import Anthropic from '@anthropic-ai/sdk';
import Parser from 'rss-parser';
import { Resend } from 'resend';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const resend = new Resend(process.env.RESEND_API_KEY);
const parser = new Parser();

const RSS_FEEDS = [
  'https://digital-strategy.ec.europa.eu/en/rss.xml',
  'https://www.nist.gov/news-events/news/rss.xml',
  'https://edpb.europa.eu/rss.xml',
  // Add more feeds here after Feedly OPML export
];

const CONFIG = {
  maxArticlesPerFeed: 5,
  hoursLookback: 24,
  minRelevanceScore: 7,
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
        }));

      allArticles.push(...recentItems);
    } catch (error) {
      console.error(`Error fetching feed ${feedUrl}:`, error);
    }
  }

  return allArticles;
}

async function analyzeWithClaude(articles: Article[]): Promise<AnalyzedArticle[]> {
  const analyzed: AnalyzedArticle[] = [];
  const batchSize = 5;

  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);

    const prompt = `You are my AI Governance Intelligence Analyst.
Focus on: EU AI Act implementation, ISO/IEC 42001 & 42005, NIST AI RMF, AI risk governance, SME adoption, and agentic AI.
Ignore hype, marketing, press releases, and shallow opinion.

For each article below:
1. Score relevance (1-10)
2. If score < 7, output: {"score": X, "skip": true}
3. Otherwise produce JSON:
{
  "score": X,
  "title": "article title",
  "summary": ["bullet 1 (max 18 words)", "bullet 2 (max 18 words)", "bullet 3 (max 18 words)"],
  "whyMatters": "Why this matters for AI governance practice (one sentence)",
  "tags": ["Regulatory or Market or Jobs or Technology or Risk"],
  "url": "article url",
  "opportunity": "Potential opportunity for RouteAI (optional, leave out if not applicable)"
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
  const market = articles.filter(a => a.tags.includes('Market') || a.tags.includes('Jobs'));
  const opportunities = articles.filter(a => a.opportunity);

  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #1a202c;">Daily AI Governance Intelligence Brief</h1>
    <p style="color: #718096;"><strong>${date}</strong> · ${articles.length} relevant items</p>
    <hr style="border: 1px solid #e2e8f0;">
  `;

  if (regulatory.length > 0) {
    html += `<h2 style="color: #2d3748;">🏛️ Regulatory Signals</h2><ul>`;
    regulatory.forEach(a => html += `<li><a href="${a.url}">${a.title}</a></li>`);
    html += `</ul>`;
  }

  if (market.length > 0) {
    html += `<h2 style="color: #2d3748;">📊 Market & Jobs Signals</h2><ul>`;
    market.forEach(a => html += `<li><a href="${a.url}">${a.title}</a></li>`);
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
      <div style="margin-bottom: 30px; padding: 15px; border-left: 3px solid #4A5568; background: #f7fafc;">
        <h3 style="margin: 0 0 5px 0;">${idx + 1}. ${article.title}</h3>
        <p style="color: #718096; font-size: 13px; margin: 0 0 10px 0;">Score: ${article.score}/10 · ${article.tags.join(', ')}</p>
        <ul style="margin: 0 0 10px 0;">
          ${article.summary.map(s => `<li>${s}</li>`).join('')}
        </ul>
        <p style="margin: 0 0 5px 0;"><strong>Why this matters:</strong> ${article.whyMatters}</p>
        ${article.opportunity ? `<p style="margin: 5px 0; color: #2f855a;"><strong>💡 RouteAI:</strong> ${article.opportunity}</p>` : ''}
        <p style="margin: 10px 0 0 0;"><a href="${article.url}" style="color: #4299e1;">Read full article →</a></p>
      </div>
    `;
  });

  html += `</div>`;
  return html;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    console.log('Starting daily brief...');
    const articles = await fetchRecentArticles();
    console.log(`Fetched ${articles.length} articles`);

    if (articles.length === 0) {
      return Response.json({ message: 'No new articles found', count: 0 });
    }

    const analyzed = await analyzeWithClaude(articles);
    console.log(`Selected ${analyzed.length} relevant articles`);

    if (analyzed.length === 0) {
      return Response.json({ message: 'No relevant articles found', count: 0 });
    }

    const emailHtml = formatEmailBrief(analyzed);

    await resend.emails.send({
      from: 'AI Analyst <onboarding@resend.dev>',
      to: CONFIG.recipientEmail,
      subject: `AI Governance Brief — ${analyzed.length} items (${new Date().toLocaleDateString('nl-NL')})`,
      html: emailHtml,
    });

    console.log(`Email sent to ${CONFIG.recipientEmail}`);

    return Response.json({
      success: true,
      articlesProcessed: articles.length,
      articlesSelected: analyzed.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: 'Failed to generate brief', details: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
