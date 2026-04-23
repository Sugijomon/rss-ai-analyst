import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import Parser from 'rss-parser';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const resend = new Resend(process.env.RESEND_API_KEY);
const parser = new Parser();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// RSS FEEDS — RAI (RouteAI Intelligence)
const RSS_FEEDS_RAI = [
  'https://www.google.com/alerts/feeds/09449303513221250695/712363126844262138',
  'https://www.google.com/alerts/feeds/09449303513221250695/8360176497618447048',
  'https://www.google.com/alerts/feeds/09449303513221250695/712363126844260895',
  'https://www.google.com/alerts/feeds/09449303513221250695/14759970723841580188',
  'https://www.google.com/alerts/feeds/09449303513221250695/3370223869929194536',
  'https://www.google.com/alerts/feeds/09449303513221250695/9227181759097594092',
  'https://www.google.com/alerts/feeds/09449303513221250695/10002060156204655808',
  'https://www.google.com/alerts/feeds/09449303513221250695/17378552453676393076',
  'https://www.google.com/alerts/feeds/09449303513221250695/10529135105258354989',
  'https://www.google.com/alerts/feeds/09449303513221250695/16104860397407571115',
  'https://www.google.com/alerts/feeds/09449303513221250695/7124011456707508388',
  'https://www.google.com/alerts/feeds/09449303513221250695/10002060156204656018',
  'https://www.google.com/alerts/feeds/09449303513221250695/13385062984594143224',
  'https://www.google.com/alerts/feeds/09449303513221250695/2164771014014474126',
  'https://www.google.com/alerts/feeds/09449303513221250695/451554340955659707',
  'https://www.google.com/alerts/feeds/09449303513221250695/8058027391759189925',
  'https://www.google.com/alerts/feeds/09449303513221250695/8506129854880045759',
  'https://www.google.com/alerts/feeds/09449303513221250695/1576620731540475628',
  'https://www.google.com/alerts/feeds/09449303513221250695/11046596549212494694',
  'https://digital-strategy.ec.europa.eu/en/rss.xml',
  'https://www.nist.gov/news-events/news/rss.xml',
  'https://artificialintelligence-news.com/feed/',
  'https://www.technologyreview.com/feed/',
];

// RSS FEEDS — AISA (AI Skills Accelerator)
const RSS_FEEDS_AISA = [
  'https://www.google.com/alerts/feeds/09449303513221250695/11398596379508912216',
  'https://www.google.com/alerts/feeds/09449303513221250695/3751838535575008662',
  'https://www.google.com/alerts/feeds/09449303513221250695/13822444391883320846',
  'https://www.google.com/alerts/feeds/09449303513221250695/11628233551391557605',
  'https://www.google.com/alerts/feeds/09449303513221250695/9854549709752547786',
  'https://www.google.com/alerts/feeds/09449303513221250695/17215868415462242323',
  'https://www.google.com/alerts/feeds/09449303513221250695/3010114955718549497',
  'https://www.google.com/alerts/feeds/09449303513221250695/13053141497936131359',
  'https://www.google.com/alerts/feeds/09449303513221250695/14220739381911567576',
  'https://www.google.com/alerts/feeds/09449303513221250695/14220739381911565544',
  'https://www.google.com/alerts/feeds/09449303513221250695/14171728769092608143',
  'https://www.google.com/alerts/feeds/09449303513221250695/10756906360246997719',
  'https://www.google.com/alerts/feeds/09449303513221250695/10756906360247000062',
  'https://www.google.com/alerts/feeds/09449303513221250695/11006387725598065897',
  'https://www.google.com/alerts/feeds/09449303513221250695/12740235320510231143',
  'https://www.google.com/alerts/feeds/09449303513221250695/10340594049990774976',
  'https://www.google.com/alerts/feeds/09449303513221250695/1685465714473872504',
  'https://www.google.com/alerts/feeds/09449303513221250695/831771200614974644',
];

// RSS FEEDS — Rapporten & Onderzoek
const RSS_FEEDS_RAPPORTEN = [
  // Google Alerts — rapporten van consultancies en NL/EU bronnen
  'https://www.google.com/alerts/feeds/09449303513221250695/11020912532644878384',
  'https://www.google.com/alerts/feeds/09449303513221250695/9447431379538733276',
  'https://www.google.com/alerts/feeds/09449303513221250695/7579506280036186973',
  'https://www.google.com/alerts/feeds/09449303513221250695/9792893812522834631',
  'https://www.google.com/alerts/feeds/09449303513221250695/14534094429917281865',
  'https://www.google.com/alerts/feeds/09449303513221250695/7165356540150727077',
  'https://www.google.com/alerts/feeds/09449303513221250695/11467018644135564915',
  'https://www.google.com/alerts/feeds/09449303513221250695/8230374117749793457',
  'https://www.google.com/alerts/feeds/09449303513221250695/8061218653018401488',
  'https://www.google.com/alerts/feeds/09449303513221250695/12265904741182742856',
  'https://www.google.com/alerts/feeds/09449303513221250695/4953389541249954681',
  'https://www.google.com/alerts/feeds/09449303513221250695/16279712458524784408',
  'https://www.google.com/alerts/feeds/09449303513221250695/7022290479762771039',
  // Directe RSS — NL onderzoeksinstellingen
  'https://www.ser.nl/nl/rss',
  'https://www.rathenau.nl/nl/rss.xml',
  'https://www.cbs.nl/nl-nl/rss/longread',
  'https://www.cpb.nl/rss.xml',
  // Directe RSS — Europese instellingen
  'https://www.cedefop.europa.eu/en/rss.xml',
  'https://www.eurofound.europa.eu/rss.xml',
  // Directe RSS — Internationale consultancies en think tanks
  'https://www.mckinsey.com/Insights/rss.aspx',
  'https://sloanreview.mit.edu/feed/',
  'https://agenda.weforum.org/feed/',
  'https://hai.stanford.edu/news/rss.xml',
];

const RSS_FEEDS = [...RSS_FEEDS_RAI, ...RSS_FEEDS_AISA, ...RSS_FEEDS_RAPPORTEN];

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

// FETCH FEEDS
async function fetchRecentArticles(): Promise<Article[]> {
  const cutoffDate = new Date(Date.now() - CONFIG.hoursLookback * 60 * 60 * 1000);
  const allArticles: Article[] = [];
  const seenLinks = new Set<string>();

  for (const feedUrl of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      const recentItems = feed.items
        .filter(item => {
          const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
          return pubDate > cutoffDate;
        })
        .slice(0, CONFIG.maxArticlesPerFeed)
        .map(item => ({
          title: item.title || 'Untitled',
          link: item.link || '',
          pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
          content: item.content || item.contentSnippet || item.summary || '',
        }))
        .filter(item => {
          if (!item.link || seenLinks.has(item.link)) return false;
          seenLinks.add(item.link);
          return true;
        });

      allArticles.push(...recentItems);
    } catch (error) {
      console.error('Feed error ' + (RSS_FEEDS.indexOf(feedUrl) + 1) + ':', error);
    }
  }

  console.log('Total unique articles: ' + allArticles.length);
  return allArticles;
}

// ANALYZE WITH CLAUDE
async function analyzeWithClaude(articles: Article[]): Promise<AnalyzedArticle[]> {
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
        const results = JSON.parse(jsonMatch[0]);
        const relevant = results.filter((r: { skip?: boolean; score: number }) => !r.skip && r.score >= CONFIG.minRelevanceScore);
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

// FORMAT EMAIL
function formatEmailBrief(articles: AnalyzedArticle[]): string {
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
  html += '<p style="color: #718096;"><strong>' + date + '</strong> &middot; ' + articles.length + ' relevante artikelen &middot; ' + RSS_FEEDS.length + ' bronnen (' + RSS_FEEDS_RAI.length + ' RAI / ' + RSS_FEEDS_AISA.length + ' AISA / ' + RSS_FEEDS_RAPPORTEN.length + ' Rapporten)</p>';
  html += '<hr style="border: 1px solid #e2e8f0;">';

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
  html += '<p style="color: #a0aec0; font-size: 12px;">Digidactics Intelligence Brief &middot; Powered by Claude &middot; ' + RSS_FEEDS.length + ' bronnen gemonitord</p>';
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

  const emailHtml = formatEmailBrief(analyzed);

  await resend.emails.send({
    from: 'AI Analyst <onboarding@resend.dev>',
    to: CONFIG.recipientEmail,
    subject: 'AI Governance Brief - ' + analyzed.length + ' artikelen (' + new Date().toLocaleDateString('nl-NL') + ')',
    html: emailHtml,
  });

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
