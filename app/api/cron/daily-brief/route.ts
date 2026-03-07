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

// ─── RSS FEEDS ────────────────────────────────────────────────────────────────
// RAI (RouteAI Intelligence) feeds
const RSS_FEEDS_RAI = [
  // AI governance & compliance jobs
  'https://www.google.com/alerts/feeds/09449303513221250695/712363126844262138',
  'https://www.google.com/alerts/feeds/09449303513221250695/8360176497618447048',
  'https://www.google.com/alerts/feeds/09449303513221250695/712363126844260895',
  // EU AI Act & regulatory
  'https://www.google.com/alerts/feeds/09449303513221250695/14759970723841580188',
  'https://www.google.com/alerts/feeds/09449303513221250695/3370223869929194536',
  'https://www.google.com/alerts/feeds/09449303513221250695/9227181759097594092',
  'https://www.google.com/alerts/feeds/09449303513221250695/10002060156204655808',
  'https://www.google.com/alerts/feeds/09449303513221250695/17378552453676393076',
  // AI governance & compliance general
  'https://www.google.com/alerts/feeds/09449303513221250695/10529135105258354989',
  'https://www.google.com/alerts/feeds/09449303513221250695/16104860397407571115',
  'https://www.google.com/alerts/feeds/09449303513221250695/7124011456707508388',
  'https://www.google.com/alerts/feeds/09449303513221250695/10002060156204656018',
  'https://www.google.com/alerts/feeds/09449303513221250695/13385062984594143224',
  'https://www.google.com/alerts/feeds/09449303513221250695/2164771014014474126',
  'https://www.google.com/alerts/feeds/09449303513221250695/451554340955659707',
  // NL-specific
  'https://www.google.com/alerts/feeds/09449303513221250695/8058027391759189925',
  'https://www.google.com/alerts/feeds/09449303513221250695/8506129854880045759',
  'https://www.google.com/alerts/feeds/09449303513221250695/1576620731540475628',
  // Shadow AI NL
  'https://www.google.com/alerts/feeds/09449303513221250695/11046596549212494694',
  // Direct feeds
  'https://digital-strategy.ec.europa.eu/en/rss.xml',
  'https://www.nist.gov/news-events/news/rss.xml',
  'https://artificialintelligence-news.com/feed/',
  'https://www.technologyreview.com/feed/',
];

// AISA (AI Skills Accelerator) feeds
const RSS_FEEDS_AISA = [
  // AI literacy & training NL
  'https://www.google.com/alerts/feeds/09449303513221250695/11398596379508912216',
  'https://www.google.com/alerts/feeds/09449303513221250695/3751838535575008662',
  'https://www.google.com/alerts/feeds/09449303513221250695/13822444391883320846',
  'https://www.google.com/alerts/feeds/09449303513221250695/11628233551391557605',
  // AI skills & workforce EN
  'https://www.google.com/alerts/feeds/09449303513221250695/9854549709752547786',
  'https://www.google.com/alerts/feeds/09449303513221250695/17215868415462242323',
  // RouteAI SME & DPO channel
  'https://www.google.com/alerts/feeds/09449303513221250695/3010114955718549497',
  'https://www.google.com/alerts/feeds/09449303513221250695/13053141497936131359',
  // ISO 42001/42005
  'https://www.google.com/alerts/feeds/09449303513221250695/14220739381911567576',
  'https://www.google.com/alerts/feeds/09449303513221250695/14220739381911565544',
  'https://www.google.com/alerts/feeds/09449303513221250695/14171728769092608143',
  // NL overheid & handhaving
  'https://www.google.com/alerts/feeds/09449303513221250695/10756906360246997719',
  'https://www.google.com/alerts/feeds/09449303513221250695/10756906360247000062',
  'https://www.google.com/alerts/feeds/09449303513221250695/11006387725598065897',
  // EU enforcement & national implementation
  'https://www.google.com/alerts/feeds/09449303513221250695/12740235320510231143',
  'https://www.google.com/alerts/feeds/09449303513221250695/10340594049990774976',
  // Agentic AI & future
  'https://www.google.com/alerts/feeds/09449303513221250695/1685465714473872504',
  // MKB NL (vervanging)
  'https://www.google.com/alerts/feeds/09449303513221250695/831771200614974644',
];

const RSS_FEEDS = [...RSS_FEEDS_RAI, ...RSS_FEEDS_AISA];

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
  maxArticlesPerFeed: 3,
  hoursLookback: 36,
  minRelevanceScore: 5,
  maxArticlesInBrief: 15,
  recipientEmail: process.env.RECIPIENT_EMAIL || '',
};

// ─── INTERFACES ───────────────────────────────────────────────────────────────
interface Article {
  title: string;
  link: string;
  pubDate: Date;
  content?: string;
}

interface AnalyzedArticle {
  score: number;
  title: string;
  summary: string[];
  whyMatters: string;
  tags: string[];
  url: string;
  opportunity?: string;
  aisaOpportunity?: string;
}

// ─── FETCH FEEDS ──────────────────────────────────────────────────────────────
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
      if (recentItems.length > 0) {
        console.log(`✓ Feed ${RSS_FEEDS.indexOf(feedUrl) + 1}: ${recentItems.length} articles`);
      }
    } catch (error) {
      console.error(`✗ Error fetching feed ${RSS_FEEDS.indexOf(feedUrl) + 1} (${feedUrl}):`, error);
    }
  }

  console.log(`Total unique articles: ${allArticles.length}`);
  return allArticles;
}

// ─── ANALYZE WITH CLAUDE ──────────────────────────────────────────────────────
async function analyzeWithClaude(articles: Article[]): Promise<AnalyzedArticle[]> {
  const analyzed: AnalyzedArticle[] = [];
  const batchSize = 5;

  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);

    const prompt = `Je bent mijn AI Governance & Skills Intelligence Analist voor Digidactics, een Nederlands adviesbureau met twee producten:
- RouteAI: AI governance platform dat Nederlandse MKB-bedrijven helpt te voldoen aan de EU AI Act
- AISA: AI Skills Accelerator — cohorttraining die medewerkers van Nederlandse MKB-bedrijven praktische AI-vaardigheden bijbrengt

BELANGRIJK: Schrijf ALLE output altijd in het Nederlands, ongeacht de taal van het bronartikel.

FOCUS OP:
- EU AI Act implementatie, deadlines, handhavingsupdates
- ISO/IEC 42001 & 42005 certificeringsontwikkelingen
- NIST AI RMF updates
- AI risico governance frameworks
- Nederlandse/Europese MKB AI-adoptie en compliance
- AI-geletterdheid, bijscholing en trainingsbehoeften voor medewerkers
- Handhavingsacties of boetes door toezichthouders
- EDIH-netwerkontwikkelingen in Nederland
- Signalen op de AI governance arbeidsmarkt
- Shadow AI en beheer van AI-tools op de werkplek
- DPO- en juridisch perspectief op AI Act-compliance

PRIORITEER artikelen over:
- Nederlandse of Europese AI-regelgeving
- MKB AI-compliance uitdagingen
- AI governance tools of frameworks
- ISO 42001 certificeringsgids
- AI-geletterdheid en bijscholing van medewerkers
- Praktische AI-implementatie voor niet-technische organisaties
- Shadow AI op de werkvloer
- DPO/juridisch kanaalsignalen

NEGEER artikelen over:
- Uitsluitend Amerikaans beleid (tenzij direct relevant voor EU)
- Algemene AI-productlanceringen zonder governance-hoek
- Hype, marketing, persberichten
- Oppervlakkige meningen zonder inhoud
- Consumenten-AI apps (ChatGPT functies, etc.)
- AI kunst, entertainment, gaming

Voor elk artikel:
1. Beoordeel relevantie (1-10) voor een AI governance consultant die Nederlandse MKB-bedrijven bedient
2. Als score < ${CONFIG.minRelevanceScore}, geef terug: {"score": X, "skip": true}
3. Geef anders deze JSON terug (ALLES in het Nederlands):
{
  "score": X,
  "title": "Nederlandse vertaling van de artikeltitel",
  "summary": ["punt 1 (max 18 woorden)", "punt 2 (max 18 woorden)", "punt 3 (max 18 woorden)"],
  "whyMatters": "Waarom dit relevant is voor AI governance of AI-vaardigheidspraktijk (één zin)",
  "tags": ["één of meer van: Regelgeving, Markt, Vacatures, Technologie, Risico, Vaardigheden, Handhaving"],
  "url": "artikel url",
  "opportunity": "Concrete kans voor RouteAI product of positionering (alleen indien echt van toepassing, anders weglaten)",
  "aisaOpportunity": "Concrete kans voor AISA trainingsprogramma of positionering (alleen indien echt van toepassing, anders weglaten)"
}

Artikelen:
${batch.map((a, idx) => `
Artikel ${idx + 1}:
Titel: ${a.title}
URL: ${a.link}
Inhoud: ${a.content}
`).join('\n---\n')}

Geef een JSON-array terug met één resultaat per artikel.`;

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const results = JSON.parse(jsonMatch[0]);
        const relevant = results.filter((r: { skip?: boolean; score: number }) => !r.skip && r.score >= CONFIG.minRelevanceScore);
        analyzed.push(...relevant);
        console.log(`Batch ${Math.floor(i / batchSize) + 1}: ${relevant.length}/${batch.length} passed`);
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

// ─── SAVE TO SUPABASE ─────────────────────────────────────────────────────────
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
    run_date: new Date().toISOString().split('T')[0],
  }));

  const { error } = await supabase
    .from('articles')
    .upsert(rows, { onConflict: 'url,run_date' });

  if (error) console.error('❌ Supabase save error:', error);
  else console.log(`✅ ${rows.length} articles saved to Supabase`);
}

// ─── FORMAT EMAIL ─────────────────────────────────────────────────────────────
function formatEmailBrief(articles: AnalyzedArticle[]): string {
  const date = new Date().toLocaleDateString('nl-NL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const regelgeving  = articles.filter(a => a.tags.includes('Regelgeving'));
  const handhaving   = articles.filter(a => a.tags.includes('Handhaving'));
  const vaardigheden = articles.filter(a => a.tags.includes('Vaardigheden'));
  const markt        = articles.filter(a => a.tags.includes('Markt'));
  const vacatures    = articles.filter(a => a.tags.includes('Vacatures'));
  const routeAIOpp   = articles.filter(a => a.opportunity);
  const aisaOpp      = articles.filter(a => a.aisaOpportunity);

  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #1a202c; border-bottom: 2px solid #4299e1; padding-bottom: 10px;">
      🤖 Dagelijkse AI Governance Intelligence Brief
    </h1>
    <p style="color: #718096;">
      <strong>${date}</strong> · ${articles.length} relevante artikelen · ${RSS_FEEDS.length} bronnen gemonitord
      (${RSS_FEEDS_RAI.length} RouteAI · ${RSS_FEEDS_AISA.length} AISA)
    </p>
    <hr style="border: 1px solid #e2e8f0;">
  `;

  if (regelgeving.length > 0) {
    html += `<h2 style="color: #2d3748;">🏛️ Regelgevingssignalen</h2><ul>`;
    regelgeving.forEach(a => html += `<li><a href="${a.url}" style="color: #4299e1;">${a.title}</a></li>`);
    html += `</ul>`;
  }

  if (handhaving.length > 0) {
    html += `<h2 style="color: #2d3748;">⚖️ Handhavingssignalen</h2><ul>`;
    handhaving.forEach(a => html += `<li><a href="${a.url}" style="color: #4299e1;">${a.title}</a></li>`);
    html += `</ul>`;
  }

  if (vaardigheden.length > 0) {
    html += `<h2 style="color: #2d3748;">🎓 AI Vaardigheden & Geletterdheid</h2><ul>`;
    vaardigheden.forEach(a => html += `<li><a href="${a.url}" style="color: #4299e1;">${a.title}</a></li>`);
    html += `</ul>`;
  }

  if (markt.length > 0) {
    html += `<h2 style="color: #2d3748;">📊 Marktsignalen</h2><ul>`;
    markt.forEach(a => html += `<li><a href="${a.url}" style="color: #4299e1;">${a.title}</a></li>`);
    html += `</ul>`;
  }

  if (vacatures.length > 0) {
    html += `<h2 style="color: #2d3748;">💼 Vacaturesignalen</h2><ul>`;
    vacatures.forEach(a => html += `<li><a href="${a.url}" style="color: #4299e1;">${a.title}</a></li>`);
    html += `</ul>`;
  }

  if (routeAIOpp.length > 0) {
    html += `<h2 style="color: #2d3748;">💡 RouteAI Kansen</h2><ul>`;
    routeAIOpp.forEach(a => html += `<li>${a.opportunity}</li>`);
    html += `</ul>`;
  }

  if (aisaOpp.length > 0) {
    html += `<h2 style="color: #2d3748;">🎓 AISA Kansen</h2><ul>`;
    aisaOpp.forEach(a => html += `<li>${a.aisaOpportunity}</li>`);
    html += `</ul>`;
  }

  html += `<hr style="border: 1px solid #e2e8f0;"><h2 style="color: #2d3748;">📰 Geselecteerde Artikelen</h2>`;

  articles.forEach((article, idx) => {
    html += `
      <div style="margin-bottom: 30px; padding: 15px; border-left: 3px solid #4A5568; background: #f7fafc; border-radius: 4px;">
        <h3 style="margin: 0 0 5px 0; color: #1a202c;">${idx + 1}. ${article.title}</h3>
        <p style="color: #718096; font-size: 13px; margin: 0 0 10px 0;">
          Score: ${article.score}/10 · ${article.tags.join(', ')}
        </p>
        <ul style="margin: 0 0 10px 0; color: #2d3748;">
          ${article.summary.map(s => `<li style="margin-bottom: 4px;">${s}</li>`).join('')}
        </ul>
        <p style="margin: 0 0 5px 0; color: #2d3748;">
          <strong>Waarom relevant:</strong> ${article.whyMatters}
        </p>
        ${article.opportunity ? `
          <p style="margin: 8px 0; padding: 8px; background: #ebf8ff; border-radius: 4px; color: #2b6cb0;">
            <strong>💡 RouteAI:</strong> ${article.opportunity}
          </p>` : ''}
        ${article.aisaOpportunity ? `
          <p style="margin: 8px 0; padding: 8px; background: #f0fff4; border-radius: 4px; color: #276749;">
            <strong>🎓 AISA:</strong> ${article.aisaOpportunity}
          </p>` : ''}
        <p style="margin: 10px 0 0 0;">
          <a href="${article.url}" style="color: #4299e1;">Lees het volledige artikel →</a>
        </p>
      </div>
    `;
  });

  html += `
    <hr style="border: 1px solid #e2e8f0; margin-top: 30px;">
    <p style="color: #a0aec0; font-size: 12px;">
      Digidactics Intelligence Brief · Powered by Claude · ${RSS_FEEDS.length} bronnen gemonitord
    </p>
    </div>`;

  return html;
}

// ─── MAIN PROCESS ─────────────────────────────────────────────────────────────
async function processAndSendBrief(): Promise<void> {
  console.log('🚀 Starting daily brief...');

  const articles = await fetchRecentArticles();

  if (articles.length === 0) {
    console.log('⚠️ No articles found in any feed');
    return;
  }

  const analyzed = await analyzeWithClaude(articles);
  console.log(`🤖 ${analyzed.length} articles selected`);

  if (analyzed.length === 0) {
    console.log('⚠️ No relevant articles found by Claude');
    return;
  }

  await saveArticlesToSupabase(analyzed);

  const emailHtml = formatEmailBrief(analyzed);

  await resend.emails.send({
    from: 'AI Analyst <onboarding@resend.dev>',
    to: CONFIG.recipientEmail,
    subject: `🤖 AI Governance Brief — ${analyzed.length} artikelen (${new Date().toLocaleDateString('nl-NL')})`,
    html: emailHtml,
  });

  console.log('✅ Email sent successfully');
}

// ─── HANDLERS ─────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await processAndSendBrief();
    return NextResponse.json({ status: 'done', message: 'Brief sent successfully' }, { status: 200 });
  } catch (error) {
    console.error('❌ Error:', error);
    return NextResponse.json({ error: 'Failed', details: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await processAndSendBrief();
    return NextResponse.json({ status: 'done', message: 'Brief sent successfully' }, { status: 200 });
  } catch (error) {
    console.error('❌ Error:', error);
    return NextResponse.json({ error: 'Failed', details: String(error) }, { status: 500 });
  }
}
