import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY_NEWSLETTER,
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const CATEGORIES = [
  'Pijnpunten en kansen',
  'Nieuws EU AI Act',
  'Belangrijkste nieuwsfeiten',
  'Internationale lessen',
  'Technologische ontwikkelingen',
  'Governance en compliance',
] as const;

type Category = typeof CATEGORIES[number];

const MIN_SCORE = 7;
const ISSUE_INTERVAL_DAYS = 14;
const MAX_ARTICLES_PER_CATEGORY = 4;
const MAX_TOTAL_ARTICLES = 20;

interface SupabaseArticle {
  id: string;
  title: string;
  url: string;
  score: number;
  summary: string[];
  why_matters: string;
  tags: string[];
  opportunity: string | null;
  aisa_opportunity: string | null;
  run_date: string;
}

interface CategorizedArticle {
  article_id: string;
  category: Category;
  title: string;
  url: string;
  score: number;
  why_matters: string;
}

interface CategoryGroup {
  category: Category;
  summary: string;
  articles: CategorizedArticle[];
}

// ─── CHECK IF NEW ISSUE NEEDED ────────────────────────────────────────────────
async function shouldCreateNewIssue(): Promise<{ create: boolean; issueNumber: number; periodStart: Date }> {
  const { data: lastIssue } = await supabase
    .from('newsletter_issues')
    .select('issue_number, period_end, created_at')
    .order('issue_number', { ascending: false })
    .limit(1)
    .single();

  if (!lastIssue) {
    // Eerste editie
    return { create: true, issueNumber: 1, periodStart: new Date(Date.now() - ISSUE_INTERVAL_DAYS * 24 * 60 * 60 * 1000) };
  }

  const lastCreated = new Date(lastIssue.created_at);
  const daysSinceLast = (Date.now() - lastCreated.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceLast < ISSUE_INTERVAL_DAYS) {
    console.log(`⏭️ Laatste editie was ${Math.round(daysSinceLast)} dagen geleden — nog geen nieuwe editie nodig`);
    return { create: false, issueNumber: 0, periodStart: new Date() };
  }

  return {
    create: true,
    issueNumber: lastIssue.issue_number + 1,
    periodStart: new Date(lastCreated),
  };
}

// ─── FETCH ARTICLES FROM SUPABASE ─────────────────────────────────────────────
async function fetchArticlesForPeriod(periodStart: Date): Promise<SupabaseArticle[]> {
  const startDate = periodStart.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('articles')
    .select('id, title, url, score, summary, why_matters, tags, opportunity, aisa_opportunity, run_date')
    .gte('run_date', startDate)
    .gte('score', MIN_SCORE)
    .order('score', { ascending: false })
    .limit(MAX_TOTAL_ARTICLES * 3); // ruim ophalen, Claude selecteert de beste

  if (error) {
    console.error('❌ Supabase fetch error:', error);
    return [];
  }

  console.log(`📚 ${data?.length || 0} artikelen gevonden vanaf ${startDate} met score ≥ ${MIN_SCORE}`);
  return data || [];
}

// ─── CATEGORIZE & SUMMARIZE WITH CLAUDE ───────────────────────────────────────
async function categorizeWithClaude(articles: SupabaseArticle[]): Promise<CategoryGroup[]> {
  const articleList = articles.map((a, idx) => `
Artikel ${idx + 1}:
ID: ${a.id}
Titel: ${a.title}
URL: ${a.url}
Score: ${a.score}/10
Samenvatting: ${a.summary?.join(' | ')}
Waarom relevant: ${a.why_matters}
Tags: ${a.tags?.join(', ')}
${a.opportunity ? `RouteAI kans: ${a.opportunity}` : ''}
${a.aisa_opportunity ? `AISA kans: ${a.aisa_opportunity}` : ''}
`).join('\n---\n');

  const prompt = `Je bent redacteur van een tweewekelijkse AI governance nieuwsbrief voor Nederlandse MKB-professionals.
De nieuwsbrief is van Digidactics en gericht op beslissers bij MKB-bedrijven die te maken hebben met de EU AI Act.
Toon: professioneel maar toegankelijk, praktisch, geen jargon.

Je taak:
1. Verdeel de onderstaande artikelen over de volgende categorieën (kies per artikel de beste categorie):
   - "Pijnpunten en kansen" — concrete uitdagingen en kansen voor MKB rondom AI
   - "Nieuws EU AI Act" — updates over de EU AI Act zelf (deadlines, handhaving, guidance)
   - "Belangrijkste nieuwsfeiten" — algemeen belangrijk AI-nieuws voor MKB
   - "Internationale lessen" — wat kunnen Nederlandse MKB'ers leren van andere landen?
   - "Technologische ontwikkelingen" — relevante AI-technologie voor MKB-praktijk
   - "Governance en compliance" — frameworks, ISO 42001, tools, praktische compliance

2. Selecteer maximaal ${MAX_ARTICLES_PER_CATEGORY} artikelen per categorie (de meest relevante).
   Laat categorieën leeg als er geen goede artikelen voor zijn.

3. Schrijf per categorie een korte intro-samenvatting van 2-3 zinnen in het Nederlands.
   Schrijf vanuit het perspectief van een MKB-professional: wat betekent dit voor hun organisatie?

Geef je antwoord als JSON:
{
  "categories": [
    {
      "category": "naam van categorie",
      "summary": "2-3 zinnen intro voor deze categorie",
      "articles": [
        {
          "article_id": "uuid van het artikel",
          "category": "naam van categorie",
          "title": "titel van artikel",
          "url": "url van artikel",
          "score": 8,
          "why_matters": "waarom relevant"
        }
      ]
    }
  ]
}

Artikelen:
${articleList}

Geef alleen geldige JSON terug, geen uitleg of Markdown.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('❌ Geen geldige JSON in Claude-response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.categories || [];
  } catch (error) {
    console.error('❌ Claude categorisatie fout:', error);
    return [];
  }
}

// ─── GENERATE INTRO TEXT ──────────────────────────────────────────────────────
async function generateIntroText(categoryGroups: CategoryGroup[], periodStart: Date, periodEnd: Date): Promise<string> {
  const topArticles = categoryGroups
    .flatMap(g => g.articles)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(a => a.title)
    .join(', ');

  const startStr = periodStart.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
  const endStr = periodEnd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  const prompt = `Schrijf een korte opening (3-4 zinnen) voor een tweewekelijkse AI governance nieuwsbrief voor Nederlandse MKB-professionals.
Periode: ${startStr} – ${endStr}
Meest opvallende onderwerpen deze periode: ${topArticles}

Begin niet met "In deze editie" of "Beste lezer" of "wij".
Toon: betrokken, direct en praktisch, vanuit het perspectief van een drukke MKB-ondernemer.
Schrijf vanuit de motivatie inzicht te verstrekken en handelingsperspectief, zonder te verkopen. Geen bullshit, geen jargon.
Schrijf in het Nederlands.
Schrijf in een beschouwende/informatieve stijl vanuit Digidactics.
Begin met de meest opvallende ontwikkeling van de periode.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });
    return message.content[0].type === 'text' ? message.content[0].text : '';
  } catch {
    return '';
  }
}

// ─── SAVE TO SUPABASE ─────────────────────────────────────────────────────────
async function saveNewsletterIssue(
  issueNumber: number,
  periodStart: Date,
  periodEnd: Date,
  introText: string,
  categoryGroups: CategoryGroup[]
): Promise<string | null> {
  // Maak nieuwsbrief editie aan
  const { data: issue, error: issueError } = await supabase
    .from('newsletter_issues')
    .insert({
      issue_number: issueNumber,
      period_start: periodStart.toISOString().split('T')[0],
      period_end: periodEnd.toISOString().split('T')[0],
      status: 'draft',
      subject: `AI Governance Update #${issueNumber} — ${periodEnd.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}`,
      intro_text: introText,
    })
    .select('id')
    .single();

  if (issueError || !issue) {
    console.error('❌ Fout bij aanmaken editie:', issueError);
    return null;
  }

  console.log(`✅ Editie #${issueNumber} aangemaakt: ${issue.id}`);

  // Sla artikelen op per categorie
  const articleRows = categoryGroups.flatMap((group, groupIdx) =>
    group.articles.map((article, articleIdx) => ({
      issue_id: issue.id,
      article_id: article.article_id,
      category: group.category,
      category_summary: group.summary,
      display_order: groupIdx * 10 + articleIdx,
      included: true,
    }))
  );

  if (articleRows.length > 0) {
    const { error: articlesError } = await supabase
      .from('newsletter_articles')
      .insert(articleRows);

    if (articlesError) {
      console.error('❌ Fout bij opslaan artikelen:', articlesError);
    } else {
      console.log(`✅ ${articleRows.length} artikelen opgeslagen voor editie #${issueNumber}`);
    }
  }

  return issue.id;
}

// ─── MAIN PROCESS ─────────────────────────────────────────────────────────────
async function generateNewsletterDraft(): Promise<void> {
  console.log('🗞️ Nieuwsbrief draft genereren...');

  const { create, issueNumber, periodStart } = await shouldCreateNewIssue();
  if (!create) return;

  const periodEnd = new Date();

  const articles = await fetchArticlesForPeriod(periodStart);
  if (articles.length === 0) {
    console.log('⚠️ Geen artikelen gevonden voor deze periode');
    return;
  }

  console.log(`🤖 Claude categoriseert ${articles.length} artikelen...`);
  const categoryGroups = await categorizeWithClaude(articles);

  const totalSelected = categoryGroups.reduce((sum, g) => sum + g.articles.length, 0);
  console.log(`📋 ${totalSelected} artikelen verdeeld over ${categoryGroups.length} categorieën`);

  const introText = await generateIntroText(categoryGroups, periodStart, periodEnd);

  const issueId = await saveNewsletterIssue(issueNumber, periodStart, periodEnd, introText, categoryGroups);

  if (issueId) {
    console.log(`✅ Editie #${issueNumber} klaar voor review: /review/${issueId}`);
  }
}

// ─── HANDLERS ─────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await generateNewsletterDraft();
    return NextResponse.json({ status: 'done' }, { status: 200 });
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
    await generateNewsletterDraft();
    return NextResponse.json({ status: 'done' }, { status: 200 });
  } catch (error) {
    console.error('❌ Error:', error);
    return NextResponse.json({ error: 'Failed', details: String(error) }, { status: 500 });
  }
}
