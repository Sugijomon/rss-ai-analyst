import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getFeedGroupCounts, getFeedsForPipeline } from '@/lib/feeds';
import {
  LEGAL_DISTRIBUTION_MIN_CONFIDENCE,
  isLegalSignalDistributable,
} from '@/lib/legal';
import { fetchFeedArticles } from '@/lib/rss';
import { getAnthropic, getResend, getSupabase } from '@/lib/server-clients';
import { normalizeFeedText } from '@/lib/text';

const DAILY_FEEDS = getFeedsForPipeline('daily-brief');
const FEED_GROUP_COUNTS = getFeedGroupCounts();

const CONFIG = {
  maxArticlesPerFeed: 3,
  hoursLookback: 36,
  minRelevanceScore: 5,
  maxArticlesInBrief: 15,
  recipientEmail: process.env.RECIPIENT_EMAIL || '',
};

interface Article {
  title: string;
  link: string;
  pubDate: Date;
  content?: string;
}

interface AnalyzedArticle {
  score: number;
  contentType: 'nieuws' | 'rapport' | 'analyse' | 'regelgeving';
  title: string;
  summary: string[];
  whyMatters: string;
  tags: string[];
  url: string;
  opportunity?: string;
  aisaOpportunity?: string;
}

interface LegalBriefSignal {
  id: string;
  source_title: string;
  canonical_url: string;
  jurisdiction: string;
  candidate_type: string;
  candidate_summary: string;
  confidence: number;
  change_type: 'new' | 'updated';
}

const SkippedAnalysisSchema = z.object({
  score: z.number().int().min(1).max(10),
  skip: z.literal(true),
}).passthrough();

const CompletedAnalysisSchema = z.object({
  score: z.number().int().min(1).max(10),
  contentType: z.enum(['nieuws', 'rapport', 'analyse', 'regelgeving']),
  title: z.string().min(1).max(500),
  summary: z.array(z.string().min(1).max(500)).min(1).max(3),
  whyMatters: z.string().min(1).max(2000),
  tags: z.array(z.enum([
    'Regelgeving',
    'Markt',
    'Vacatures',
    'Technologie',
    'Risico',
    'Vaardigheden',
    'Handhaving',
    'Rapport',
  ])).min(1),
  url: z.string().url(),
  opportunity: z.string().max(2000).optional(),
  aisaOpportunity: z.string().max(2000).optional(),
}).strict();

const AnalysisResultsSchema = z.array(
  z.union([SkippedAnalysisSchema, CompletedAnalysisSchema])
);

// FETCH FEEDS
async function fetchRecentArticles(): Promise<Article[]> {
  const { articles } = await fetchFeedArticles(DAILY_FEEDS, {
    hoursLookback: CONFIG.hoursLookback,
    maxArticlesPerFeed: CONFIG.maxArticlesPerFeed,
  });

  return articles.map(article => ({
    title: article.title,
    link: article.url,
    pubDate: article.publishedAt,
    content: article.content,
  }));
}

// ANALYZE WITH CLAUDE
async function analyzeWithClaude(articles: Article[]): Promise<AnalyzedArticle[]> {
  const anthropic = getAnthropic();
  const analyzed: AnalyzedArticle[] = [];
  const batchSize = 5;

  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);

    const prompt =
      'Je bent Intelligence Analist voor Digidactics, een Nederlands adviesbureau met twee producten:\n' +
      '- RouteAI: AI governance platform voor Nederlandse MKB-bedrijven (EU AI Act compliance)\n' +
      '- AISA: AI Skills Accelerator - cohorttraining voor medewerkers van Nederlandse MKB-bedrijven\n' +
      '\n' +
      'BELANGRIJK: Schrijf ALLE output in het Nederlands, ongeacht de taal van het bronartikel.\n' +
      '\n' +
      'FOCUS OP:\n' +
      '- EU AI Act implementatie, deadlines, handhavingsupdates\n' +
      '- ISO/IEC 42001 & 42005 certificeringsontwikkelingen\n' +
      '- NIST AI RMF updates\n' +
      '- AI risico governance frameworks\n' +
      '- Nederlandse/Europese MKB AI-adoptie en compliance\n' +
      '- AI-geletterdheid, bijscholing en trainingsbehoeften\n' +
      '- Handhavingsacties of boetes door toezichthouders\n' +
      '- Shadow AI en beheer van AI-tools op de werkplek\n' +
      '- DPO- en juridisch perspectief op AI Act-compliance\n' +
      '- Rapporten en onderzoek over AI-adoptie, arbeidsmarkt, change management, HR en AI-strategie voor MKB\n' +
      '\n' +
      'NEGEER:\n' +
      '- Uitsluitend Amerikaans beleid (tenzij direct relevant voor EU)\n' +
      '- Algemene AI-productlanceringen zonder governance-hoek\n' +
      '- Hype, marketing, persberichten\n' +
      '- Consumenten-AI apps, AI kunst, entertainment\n' +
      '\n' +
      '## STAP 1: Bepaal het inhoudstype\n' +
      '\n' +
      'Identificeer eerst het type content:\n' +
      '- nieuws: actueel nieuwsbericht, persverklaring, blogpost (minder dan 2 weken oud)\n' +
      '- rapport: onderzoeksrapport, whitepaper, jaarverslag, survey, studie (van consultancy, overheid, universiteit of NGO)\n' +
      '- analyse: opiniestuk, beschouwing, longread van vakpublicatie (HBR, MIT SMR, McKinsey Insights)\n' +
      '- regelgeving: officiele publicatie van EU, overheid of toezichthouder\n' +
      '\n' +
      'Signalen voor rapport: woorden als rapport, whitepaper, studie, onderzoek, survey, jaarverslag, ' +
      'outlook, index, barometer, monitor - of afkomstig van: McKinsey, Deloitte, PwC, BCG, KPMG, Gartner, ' +
      'IDC, Forrester, WEF, OECD, ILO, Rathenau, SER, CBS, CPB, TNO, Cedefop, Eurofound, Stanford HAI, MIT SMR, Dialogic.\n' +
      '\n' +
      '## STAP 2: Scoor op basis van inhoudstype\n' +
      '\n' +
      'Scoringscriteria voor nieuws (weeg zwaarder op actualiteit):\n' +
      '- 9-10: Baanbrekend nieuws met directe impact op NL MKB of EU AI Act handhaving\n' +
      '- 7-8: Relevant nieuws over AI governance, Shadow AI, compliance, arbeidsmarkt AI\n' +
      '- 5-6: Nuttige context, interessant maar niet urgent\n' +
      '- 1-4: Te technisch, niet NL/EU relevant, of clickbait\n' +
      '\n' +
      'Scoringscriteria voor rapport en analyse (weeg zwaarder op bruikbaarheid):\n' +
      '- 9-10: Praktisch rapport over AI-adoptie MKB, AI op de werkvloer, change management AI, ' +
      'upskilling - NL of EU focus. Of diepgaand rapport van gezaghebbende bron (SER, CBS, McKinsey, Cedefop, WEF)\n' +
      '- 7-8: Internationaal rapport met directe vertaalwaarde naar NL MKB; of diepgaande analyse ' +
      'van vakpublicatie (MIT SMR, HBR) over AI strategie of workforce\n' +
      '- 5-6: Relevant maar te algemeen of te technisch voor MKB-doelgroep\n' +
      '- 1-4: Irrelevant onderwerp, te academisch, of buiten scope\n' +
      '\n' +
      'Scoringscriteria voor regelgeving:\n' +
      '- 9-10: Directe EU AI Act update, handhavingsbesluit, NL implementatie\n' +
      '- 7-8: Officiele guidance, consultation, of significante beleidswijziging\n' +
      '- 5-6: Achtergrond, consultatie, voorbereidend document\n' +
      '\n' +
      '## STAP 3: Vul de velden in\n' +
      '\n' +
      'Als score < ' + CONFIG.minRelevanceScore + ', geef terug: {"score": X, "skip": true}\n' +
      '\n' +
      'Geef anders deze JSON terug (ALLES in het Nederlands):\n' +
      '{\n' +
      '  "score": X,\n' +
      '  "contentType": "nieuws" of "rapport" of "analyse" of "regelgeving",\n' +
      '  "title": "Nederlandse vertaling van de artikeltitel",\n' +
      '  "summary": ["punt 1 (max 18 woorden)", "punt 2 (max 18 woorden)", "punt 3 (max 18 woorden)"],\n' +
      '  "whyMatters": "Wat dit betekent voor organisaties die met AI werken (een zin, geen vermelding van Digidactics/RouteAI/AISA, bij rapporten: noem de praktische inzichten)",\n' +
      '  "tags": ["een of meer van: Regelgeving, Markt, Vacatures, Technologie, Risico, Vaardigheden, Handhaving, Rapport"],\n' +
      '  "url": "artikel url",\n' +
      '  "opportunity": "INTERN GEBRUIK: Concrete kans voor RouteAI (alleen indien van toepassing, anders weglaten)",\n' +
      '  "aisaOpportunity": "INTERN GEBRUIK: Concrete kans voor AISA (alleen indien van toepassing, anders weglaten)"\n' +
      '}\n' +
      '\n' +
      'Artikelen:\n' +
      batch.map((a, idx) =>
        'Artikel ' + (idx + 1) + ':\n' +
        'Titel: ' + a.title + '\n' +
        'URL: ' + a.link + '\n' +
        'Inhoud: ' + a.content
      ).join('\n---\n') +
      '\n' +
      'Geef een JSON-array terug met een resultaat per artikel.';

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const results = AnalysisResultsSchema.parse(JSON.parse(jsonMatch[0]));
        if (results.length !== batch.length) {
          throw new Error(
            'Claude returned ' + results.length + ' results for ' + batch.length + ' articles'
          );
        }
        const relevant = results.flatMap((result, resultIndex) => {
          if ('skip' in result || result.score < CONFIG.minRelevanceScore) {
            return [];
          }
          return [{
            ...result,
            url: batch[resultIndex].link,
          }];
        });
        analyzed.push(...relevant);
        console.log('Batch ' + (Math.floor(i / batchSize) + 1) + ': ' + relevant.length + '/' + batch.length + ' passed');
      }
    } catch (error) {
      console.error('Error analyzing batch:', error);
    }

    if (i + batchSize < articles.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return analyzed
    .sort((a, b) => b.score - a.score)
    .slice(0, CONFIG.maxArticlesInBrief);
}

// SAVE TO SUPABASE
async function saveArticlesToSupabase(articles: AnalyzedArticle[]): Promise<void> {
  const supabase = getSupabase();
  const rows = articles.map(a => ({
    title: a.title,
    url: a.url,
    score: a.score,
    summary: a.summary,
    why_matters: a.whyMatters,
    tags: a.tags,
    opportunity: a.opportunity || null,
    aisa_opportunity: a.aisaOpportunity || null,
    content_type: a.contentType ?? 'nieuws',
    run_date: new Date().toISOString().split('T')[0],
  }));

  const { error } = await supabase
    .from('articles')
    .upsert(rows, { onConflict: 'url,run_date' });

  if (error) console.error('Supabase save error:', error);
  else console.log(rows.length + ' articles saved to Supabase');
}

async function fetchLegalSignalsForBrief(): Promise<LegalBriefSignal[]> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await getSupabase()
    .from('legal_signals')
    .select(
      'id, source_title, canonical_url, jurisdiction, candidate_type, candidate_summary, confidence, change_type'
    )
    .gte('created_at', cutoff)
    .gte('confidence', LEGAL_DISTRIBUTION_MIN_CONFIDENCE)
    .eq('change_type', 'new')
    .in('review_status', ['unreviewed', 'reviewed_relevant'])
    .order('confidence', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('Legal signals unavailable for daily brief:', error.message);
    return [];
  }
  return ((data || []) as LegalBriefSignal[])
    .filter(isLegalSignalDistributable)
    .map(signal => ({
      ...signal,
      source_title: normalizeFeedText(signal.source_title),
      candidate_summary: normalizeFeedText(signal.candidate_summary),
    }))
    .slice(0, 3);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// FORMAT EMAIL
function formatEmailBrief(
  articles: AnalyzedArticle[],
  legalSignals: LegalBriefSignal[]
): string {
  const date = new Date().toLocaleDateString('nl-NL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const regelgeving  = articles.filter(a => a.tags.includes('Regelgeving'));
  const handhaving   = articles.filter(a => a.tags.includes('Handhaving'));
  const vaardigheden = articles.filter(a => a.tags.includes('Vaardigheden'));
  const markt        = articles.filter(a => a.tags.includes('Markt'));
  const vacatures    = articles.filter(a => a.tags.includes('Vacatures'));
  const routeAIOpp   = articles.filter(a => a.opportunity);
  const aisaOpp      = articles.filter(a => a.aisaOpportunity);

  let html = '<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">';
  html += '<h1 style="color: #1a202c; border-bottom: 2px solid #4299e1; padding-bottom: 10px;">Dagelijkse AI Governance Intelligence Brief</h1>';
  html += '<p style="color: #718096;"><strong>' + date + '</strong> &middot; ' + articles.length + ' relevante artikelen &middot; ' + DAILY_FEEDS.length + ' unieke bronnen (' + FEED_GROUP_COUNTS.rai + ' RAI / ' + FEED_GROUP_COUNTS.aisa + ' AISA / ' + FEED_GROUP_COUNTS.rapporten + ' Rapporten / ' + FEED_GROUP_COUNTS.legal + ' LEGAL, met overlap)</p>';
  html += '<hr style="border: 1px solid #e2e8f0;">';

  if (legalSignals.length > 0) {
    html += '<h2 style="color:#085041;">Kandidaat juridische signalen</h2>';
    html += '<p style="color:#718096;font-size:13px;">Menselijke beoordeling is vereist. Deze signalen bevestigen geen rechtsstatus of compliance.</p>';
    legalSignals.forEach(signal => {
      html += '<div style="margin-bottom:16px;padding:12px;border-left:3px solid #0f6e56;background:#f2fbf7;">';
      html += '<p style="margin:0 0 4px;font-size:11px;color:#4a5568;">' +
        'Nieuw kandidaat-signaal' +
        ' - ' + escapeHtml(signal.jurisdiction) +
        ' - confidence ' + signal.confidence + '/10</p>';
      html += '<h3 style="margin:0 0 6px;"><a href="' + escapeHtml(signal.canonical_url) +
        '" style="color:#0f6e56;">' + escapeHtml(signal.source_title) + '</a></h3>';
      html += '<p style="margin:0;">' + escapeHtml(signal.candidate_summary) + '</p>';
      html += '</div>';
    });
    html += '<hr style="border: 1px solid #e2e8f0;">';
  }

  const sections = [
    { label: 'Regelgevingssignalen', items: regelgeving, icon: '' },
    { label: 'Handhavingssignalen', items: handhaving, icon: '' },
    { label: 'AI Vaardigheden & Geletterdheid', items: vaardigheden, icon: '' },
    { label: 'Marktsignalen', items: markt, icon: '' },
    { label: 'Vacaturesignalen', items: vacatures, icon: '' },
  ];

  sections.forEach(s => {
    if (s.items.length === 0) return;
    html += '<h2 style="color: #2d3748;">' + s.label + '</h2><ul>';
    s.items.forEach(a => {
      html += '<li><a href="' + a.url + '" style="color: #4299e1;">' + a.title + '</a></li>';
    });
    html += '</ul>';
  });

  if (routeAIOpp.length > 0) {
    html += '<h2 style="color: #2d3748;">RouteAI Kansen</h2><ul>';
    routeAIOpp.forEach(a => { html += '<li>' + a.opportunity + '</li>'; });
    html += '</ul>';
  }

  if (aisaOpp.length > 0) {
    html += '<h2 style="color: #2d3748;">AISA Kansen</h2><ul>';
    aisaOpp.forEach(a => { html += '<li>' + a.aisaOpportunity + '</li>'; });
    html += '</ul>';
  }

  html += '<hr style="border: 1px solid #e2e8f0;"><h2 style="color: #2d3748;">Geselecteerde Artikelen</h2>';

  articles.forEach((article, idx) => {
    const typeLabel =
      article.contentType === 'rapport' ? '📄 Rapport' :
      article.contentType === 'analyse' ? '💡 Analyse' :
      article.contentType === 'regelgeving' ? '⚖️ Regelgeving' :
      '📰 Nieuws';
    html += '<div style="margin-bottom: 30px; padding: 15px; border-left: 3px solid #4A5568; background: #f7fafc; border-radius: 4px;">';
    html += '<p style="margin: 0 0 4px 0; font-size: 11px; color: #718096;">' + typeLabel + '</p>';
    html += '<h3 style="margin: 0 0 5px 0; color: #1a202c;">' + (idx + 1) + '. ' + article.title + '</h3>';
    html += '<p style="color: #718096; font-size: 13px; margin: 0 0 10px 0;">Score: ' + article.score + '/10 &middot; ' + article.tags.join(', ') + '</p>';
    html += '<ul style="margin: 0 0 10px 0; color: #2d3748;">';
    article.summary.forEach(s => { html += '<li style="margin-bottom: 4px;">' + s + '</li>'; });
    html += '</ul>';
    html += '<p style="margin: 0 0 5px 0; color: #2d3748;"><strong>Waarom relevant:</strong> ' + article.whyMatters + '</p>';
    if (article.opportunity) {
      html += '<p style="margin: 8px 0; padding: 8px; background: #ebf8ff; border-radius: 4px; color: #2b6cb0;"><strong>RouteAI:</strong> ' + article.opportunity + '</p>';
    }
    if (article.aisaOpportunity) {
      html += '<p style="margin: 8px 0; padding: 8px; background: #f0fff4; border-radius: 4px; color: #276749;"><strong>AISA:</strong> ' + article.aisaOpportunity + '</p>';
    }
    html += '<p style="margin: 10px 0 0 0;"><a href="' + article.url + '" style="color: #4299e1;">Lees het volledige artikel</a></p>';
    html += '</div>';
  });

  html += '<hr style="border: 1px solid #e2e8f0; margin-top: 30px;">';
  html += '<p style="color: #a0aec0; font-size: 12px;">Digidactics Intelligence Brief &middot; Powered by Claude &middot; ' + DAILY_FEEDS.length + ' unieke bronnen gemonitord</p>';
  html += '</div>';

  return html;
}

// MAIN PROCESS
async function processAndSendBrief(): Promise<void> {
  console.log('Starting daily brief...');

  const articles = await fetchRecentArticles();
  if (articles.length === 0) {
    console.log('No articles found');
    return;
  }

  const analyzed = await analyzeWithClaude(articles);
  console.log(analyzed.length + ' articles selected');

  if (analyzed.length === 0) {
    console.log('No relevant articles found');
    return;
  }

  await saveArticlesToSupabase(analyzed);

  const legalSignals = await fetchLegalSignalsForBrief();
  const emailHtml = formatEmailBrief(analyzed, legalSignals);

  const { error } = await getResend().emails.send({
    from: 'AI Analyst <onboarding@resend.dev>',
    to: CONFIG.recipientEmail,
    subject: 'AI Governance Brief - ' + analyzed.length + ' artikelen (' + new Date().toLocaleDateString('nl-NL') + ')',
    html: emailHtml,
  });
  if (error) {
    throw new Error('Daily brief email failed: ' + error.message);
  }

  console.log('Email sent successfully');
}

// HANDLERS
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await processAndSendBrief();
    return NextResponse.json({ status: 'done' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed', details: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await processAndSendBrief();
    return NextResponse.json({ status: 'done' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed', details: String(error) }, { status: 500 });
  }
}
