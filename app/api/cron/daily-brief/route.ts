import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import Parser from 'rss-parser';
import { Resend } from 'resend';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const resend = new Resend(process.env.RESEND_API_KEY);
const parser = new Parser();

const RSS_FEEDS = [
  // === YOUR GOOGLE ALERTS (from Feedly) ===

  // AI Governance Jobs
  'https://www.google.com/alerts/feeds/09449303513221250695/712363126844262138',
  'https://www.google.com/alerts/feeds/09449303513221250695/8360176497618448162',
  'https://www.google.com/alerts/feeds/09449303513221250695/8360176497618447048',
  'https://www.google.com/alerts/feeds/09449303513221250695/16104860397407571115',
  'https://www.google.com/alerts/feeds/09449303513221250695/712363126844260895',
  'https://www.google.com/alerts/feeds/09449303513221250695/10529135105258354989',

  // AI Regulation
  'https://www.google.com/alerts/feeds/09449303513221250695/10002060156204656018',

  // Filter out (negative alerts - still useful to monitor)
  'https://www.google.com/alerts/feeds/09449303513221250695/17057346079060550580',
  'https://www.google.com/alerts/feeds/09449303513221250695/18323230671601558587',

  // AI Compliance NL
  'https://www.google.com/alerts/feeds/09449303513221250695/8058027391759189925',

  // AI Risk
  'https://www.google.com/alerts/feeds/09449303513221250695/1576620731540475628',

  // AI Wet Nederland
  'https://www.google.com/alerts/feeds/09449303513221250695/8506129854880045759',

  // AI Lawfirms
  'https://www.google.com/alerts/feeds/09449303513221250695/10002060156204655808',

  // Shadow IT
  'https://www.google.com/alerts/feeds/09449303513221250695/451554340955659707',

  // EC AI Act
  'https://www.google.com/alerts/feeds/09449303513221250695/9227181759097594092',

  // AI Industry Impact
  'https://www.google.com/alerts/feeds/09449303513221250695/13385062984594143224',

  // AI Workplace Governance
  'https://www.google.com/alerts/feeds/09449303513221250695/7124011456707508388',

  // ISO 42001
  'https://www.google.com/alerts/feeds/09449303513221250695/2164771014014474126',

  // EU AI Act (main)
  'https://www.google.com/alerts/feeds/09449303513221250695/3370223869929194536',
  'https://www.google.com/alerts/feeds/09449303513221250695/14759970723841580188',

  // === ADDITIONAL HIGH-QUALITY SOURCES ===
  'https://digital-strategy.ec.europa.eu/en/rss.xml',
  'https://www.nist.gov/news-events/news/rss.xml',
  'https://artificialintelligence-news.com/feed/',
  'https://www.technologyreview.com/feed/',
];

const CONFIG = {
  maxArticlesPerFeed: 3,
  hoursLookback: 48,
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
  title: string;
  summary: string[];
  whyMatters: string;
  tags: string[];
  url: string;
  opportunity?: string;
}

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
          if (seenLinks.has(item.link)) return false;
          seenLinks.add(item.link);
          return true;
        });

      allArticles.push(...recentItems);
      if (recentItems.length > 0) {
        console.log(`✓ Feed ${RSS_FEEDS.indexOf(feedUrl) + 1}: ${recentItems.length} articles`);
      }
    } catch (error) {
      console.error(`✗ Error fetching feed ${RSS_FEEDS.indexOf(feedUrl) + 1}:`, error);
    }
  }

  console.log(`Total unique articles: ${allArticles.length}`);
  return allArticles;
}

async function analyzeWithClaude(articles: Article[]): Promise<AnalyzedArticle[]> {
  const analyzed: AnalyzedArticle[] = [];
  const batchSize = 5;

  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);

    const prompt = `You are my AI Governance Intelligence Analyst for RouteAI, a platform helping Dutch SMEs comply with the EU AI Act.

FOCUS ON:
- EU AI Act implementation, deadlines, enforcement updates
- ISO/IEC 42001 & 42005 certification developments
- NIST AI RMF updates
- AI risk governance frameworks
- Dutch/European SME AI adoption and compliance
- AI literacy and training requirements
- Regulatory enforcement actions or fines
- EDIH network developments in Netherlands
- AI governance job market signals

PRIORITIZE articles about:
- Dutch or European AI regulation
- SME/MKB AI compliance challenges
- AI governance tools or frameworks
- ISO 42001 certification guidance
- Practical AI implementation for non-technical organizations
- Shadow IT and AI tool governance in workplaces

IGNORE articles about:
- US-only policy (unless directly relevant to EU)
- General AI product launches without governance angle
- Hype, marketing, press releases
- Shallow opinion without substance
- Consumer AI apps (ChatGPT features, etc.)
- AI art, entertainment, gaming

For each article:
1. Score relevance (1-10) for an AI governance consultant serving Dutch SMEs
2. If score < ${CONFIG.minRelevanceScore}, output: {"score": X, "skip": true}
3. Otherwise produce JSON:
{
  "score": X,
  "title": "article title",
  "summary": ["bullet 1 (max 18 words)", "bullet 2 (max 18 words)", "bullet 3 (max 18 words)"],
  "whyMatters": "Why this matters for AI governance practice (one sentence)",
  "tags": ["Regulatory or Market or Jobs or Technology or Risk"],
  "url": "article url",
  "opportunity": "Specific opportunity for RouteAI product or positioning (only if genuinely applicable)"
}

Articles:
${batch.map((a, idx) => `
Article ${idx + 1}:
Title: ${a.title}
URL: ${a.link}
Content: ${a.content}
`).join('\n---\n')}

Return a JSON array with one result per article.`;

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
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

function formatEmailBrief(articles: AnalyzedArticle[]): string {
  const date = new Date().toLocaleDateString('nl-NL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const regulatory = articles.filter(a => a.tags.includes('Regulatory'));
  const market = articles.filter(a => a.tags.includes('Market'));
  const jobs = articles.filter(a => a.tags.includes('Jobs'));
  const opportunities = articles.filter(a => a.opportunity);

  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #1a202c; border-bottom: 2px solid #4299e1; padding-bottom: 10px;">
      🤖 Daily AI Governance Intelligence Brief
    </h1>
    <p style="color: #718096;"><strong>${date}</strong> · ${articles.length} relevant items · ${RSS_FEEDS.length} sources monitored</p>
    <hr style="border: 1px solid #e2e8f0;">
  `;

  if (regulatory.length > 0) {
    html += `<h2 style="color: #2d3748;">🏛️ Regulatory Signals</h2><ul>`;
    regulatory.forEach(a => html += `<li><a href="${a.url}" style="color: #4299e1;">${a.title}</a></li>`);
    html += `</ul>`;
  }

  if (market.length > 0) {
    html += `<h2 style="color: #2d3748;">📊 Market Signals</h2><ul>`;
    market.forEach(a => html += `<li><a href="${a.url}" style="color: #4299e1;">${a.title}</a></li>`);
    html += `</ul>`;
  }

  if (jobs.length > 0) {
    html += `<h2 style="color: #2d3748;">💼 Jobs Signals</h2><ul>`;
    jobs.forEach(a => html += `<li><a href="${a.url}" style="color: #4299e1;">${a.title}</a></li>`);
    html += `</ul>`;
  }

  if (opportunities.length > 0) {
    html += `<h2 style="color: #2d3748;">💡 RouteAI Opportunities</h2><ul>`;
    opportunities.forEach(a => html += `<li>${a.opportunity}</li>`);
    html += `</ul>`;
  }

  html += `<hr style="border: 1px solid #e2e8f0;"><h2 style="color: #2d3748;">📰 Selected Articles</h2>`;

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
          <strong>Why this matters:</strong> ${article.whyMatters}
        </p>
        ${article.opportunity ? `
          <p style="margin: 8px 0; padding: 8px; background: #ebf8ff; border-radius: 4px; color: #2b6cb0;">
            <strong>💡 RouteAI:</strong> ${article.opportunity}
          </p>` : ''}
        <p style="margin: 10px 0 0 0;">
          <a href="${article.url}" style="color: #4299e1;">Read full article →</a>
        </p>
      </div>
    `;
  });

  html += `
    <hr style="border: 1px solid #e2e8f0; margin-top: 30px;">
    <p style="color: #a0aec0; font-size: 12px;">
      RouteAI Intelligence Brief · Powered by Claude · ${RSS_FEEDS.length} sources monitored
    </p>
    </div>`;

  return html;
}

async function processAndSendBrief() {
  try {
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

    const emailHtml = formatEmailBrief(analyzed);

    await resend.emails.send({
      from: 'AI Analyst <onboarding@resend.dev>',
      to: CONFIG.recipientEmail,
      subject: `🤖 AI Governance Brief — ${analyzed.length} items (${new Date().toLocaleDateString('nl-NL')})`,
      html: emailHtml,
    });

    console.log('✅ Email sent successfully');
  } catch (error) {
    console.error('❌ Error in processAndSendBrief:', error);
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fire and forget — returns 200 immediately, processing continues in background
  processAndSendBrief();

  return NextResponse.json({ status: 'started', message: 'Brief generation started' }, { status: 200 });
}