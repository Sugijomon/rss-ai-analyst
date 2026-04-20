import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
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
const MAX_ARTICLES_PER_CATEGORY_EXTERNAL = 4;
const MAX_ARTICLES_PER_CATEGORY_INTERNAL = 3;
const MAX_TOTAL_ARTICLES = 20;
const MAX_CLAUDE_INPUT_ARTICLES = 40;

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

// CHECK IF NEW ISSUE NEEDED
async function shouldCreateNewIssue(): Promise<{ create: boolean; issueNumber: number; periodStart: Date }> {
  const { data: lastIssue } = await supabase
    .from('newsletter_issues')
    .select('issue_number, created_at')
    .eq('type', 'external')
    .order('issue_number', { ascending: false })
    .limit(1)
    .single();

  if (!lastIssue) {
    return {
      create: true,
      issueNumber: 1,
      periodStart: new Date(Date.now() - ISSUE_INTERVAL_DAYS * 24 * 60 * 60 * 1000),
    };
  }

  const lastCreated = new Date(lastIssue.created_at);
  const daysSinceLast = (Date.now() - lastCreated.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceLast < ISSUE_INTERVAL_DAYS) {
    console.log('Laatste editie was ' + Math.round(daysSinceLast) + ' dagen geleden - nog geen nieuwe editie nodig');
    return { create: false, issueNumber: 0, periodStart: new Date() };
  }

  return {
    create: true,
    issueNumber: lastIssue.issue_number + 1,
    periodStart: new Date(lastCreated),
  };
}

// FETCH ARTICLES FROM SUPABASE
async function fetchArticlesForPeriod(periodStart: Date): Promise<SupabaseArticle[]> {
  const startDate = periodStart.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('articles')
    .select('id, title, url, score, summary, why_matters, tags, opportunity, aisa_opportunity, run_date')
    .gte('run_date', startDate)
    .gte('score', MIN_SCORE)
    .order('score', { ascending: false })
    .limit(MAX_CLAUDE_INPUT_ARTICLES);

  if (error) {
    console.error('Supabase fetch error:', error);
    return [];
  }

  console.log((data?.length || 0) + ' artikelen gevonden vanaf ' + startDate);
  return data || [];
}

// CATEGORIZE FOR EXTERNAL NEWSLETTER
async function categorizeForExternal(articles: SupabaseArticle[]): Promise<CategoryGroup[]> {
  const articleList = articles.map((a, idx) => [
    'Artikel ' + (idx + 1) + ':',
    'ID: ' + a.id,
    'Titel: ' + a.title,
    'URL: ' + a.url,
    'Score: ' + a.score + '/10',
    'Samenvatting: ' + (a.summary ? a.summary.join(' | ') : ''),
    'Waarom relevant: ' + a.why_matters,
    'Tags: ' + (a.tags ? a.tags.join(', ') : ''),
  ].join('\n')).join('\n---\n');

  const prompt = [
    'Je bent redacteur van een tweewekelijkse AI governance nieuwsbrief voor Nederlandse MKB-professionals.',
    'De nieuwsbrief is van Digidactics en gericht op beslissers bij MKB-bedrijven die te maken hebben met de EU AI Act.',
    '',
    'BELANGRIJK: Gebruik UITSLUITEND de exacte UUIDs die bij elk artikel staan vermeld als "ID: ...".',
    'Verzin GEEN nieuwe UUIDs. Kopieer de ID letterlijk uit de invoer.',
    '',
    'SCHRIJFSTIJL:',
    'Informatief en beschouwend, journalistieke vakbladstijl.',
    'De schrijver blijft op de achtergrond - geen wij, geen jij, geen u.',
    'Schrijf in de derde persoon of onpersoonlijk.',
    'Gebruik af en toe een metafoor, vergelijking of praktijkvoorbeeld.',
    'Licht uitdagend van toon - de lezer wordt geprikkeld, niet gerustgesteld.',
    'NOOIT verwijzen naar Digidactics, RouteAI of AISA als aanbieder of oplossing.',
    'Vermijd: consultantstaal, opsommingen zonder context, open deuren.',
    'Vermijd: "In deze editie", "Zoals bekend", "Het is duidelijk dat".',
    '',
    'TAAK:',
    '1. Verdeel artikelen over de categorieen:',
    '   - "Pijnpunten en kansen"',
    '   - "Nieuws EU AI Act"',
    '   - "Belangrijkste nieuwsfeiten"',
    '   - "Internationale lessen"',
    '   - "Technologische ontwikkelingen"',
    '   - "Governance en compliance"',
    '',
    '2. Selecteer maximaal ' + MAX_ARTICLES_PER_CATEGORY_EXTERNAL + ' artikelen per categorie.',
    '3. Schrijf per categorie een intro van 2-3 zinnen, journalistieke toon, puur informatief.',
    '',
    'Geef je antwoord als JSON:',
    '{"categories": [{"category": "naam", "summary": "intro tekst", "articles": [{"article_id": "uuid", "category": "naam", "title": "titel", "url": "url", "score": 8, "why_matters": "waarom relevant"}]}]}',
    '',
    'Artikelen:',
    articleList,
    '',
    'Geef alleen geldige JSON terug, geen uitleg of Markdown.',
  ].join('\n');

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 10000,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Geen geldige JSON in externe Claude-response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.categories || [];
  } catch (error) {
    console.error('Claude externe categorisatie fout:', error);
    return [];
  }
}

// CATEGORIZE FOR INTERNAL ANALYSIS
async function categorizeForInternal(articles: SupabaseArticle[]): Promise<CategoryGroup[]> {
  const articleList = articles.map((a, idx) => [
    'Artikel ' + (idx + 1) + ':',
    'ID: ' + a.id,
    'Titel: ' + a.title,
    'URL: ' + a.url,
    'Score: ' + a.score + '/10',
    'Samenvatting: ' + (a.summary ? a.summary.join(' | ') : ''),
    'Waarom relevant: ' + a.why_matters,
    'Tags: ' + (a.tags ? a.tags.join(', ') : ''),
    a.opportunity ? 'RouteAI kans: ' + a.opportunity : '',
    a.aisa_opportunity ? 'AISA kans: ' + a.aisa_opportunity : '',
  ].filter(Boolean).join('\n')).join('\n---\n');

  const prompt = [
    'Je bent strategisch analist voor Digidactics, een Nederlands adviesbureau met:',
    '- RouteAI: AI governance platform voor Nederlandse MKB EU AI Act compliance',
    '- AISA: AI Skills Accelerator cohorttraining voor MKB-medewerkers',
    '',
    'BELANGRIJK: Gebruik UITSLUITEND de exacte UUIDs die bij elk artikel staan vermeld als "ID: ...".',
    'Verzin GEEN nieuwe UUIDs. Kopieer de ID letterlijk uit de invoer.',
    '',
    'Schrijf een INTERNE marktanalyse in blogvorm voor de Digidactics-directie.',
    '',
    'SCHRIJFSTIJL:',
    'Vloeiende lopende tekst per categorie, geen bulletlijsten.',
    'Analytisch, direct, zakelijk. Mag stellig zijn.',
    'Verwijs naar bronnen inline met het marker [REF:artikel_id|ankertekst].',
    'De ankertekst is een korte natuurlijke omschrijving die past in de zin.',
    'Voorbeelden:',
    '  "Meer dan 80 procent van grote bedrijven gebruikt AI zonder governance [REF:abc-123|onderzoek van Nutanix]."',
    '  "De EU AI Act nadert haar eerste handhavingsmoment [REF:def-456|analyse van Eversheds Sutherland]."',
    'Verbind ontwikkelingen expliciet aan RouteAI en AISA waar relevant.',
    'Geef concrete strategische observaties.',
    '',
    'STRUCTUUR PER CATEGORIE:',
    '3-5 zinnen lopende tekst met minimaal 1-2 [REF:id|ankertekst] markers.',
    '',
    'TAAK:',
    '1. Selecteer de ' + MAX_ARTICLES_PER_CATEGORY_INTERNAL + ' meest strategisch relevante artikelen per categorie.',
    '2. Schrijf per categorie een analyseparagraaf als gewone tekst.',
    '3. Gebruik [REF:artikel_id|ankertekst] om bronnen in de tekst te verwerken.',
    '',
    'Categorieen:',
    '   - "Pijnpunten en kansen"',
    '   - "Nieuws EU AI Act"',
    '   - "Belangrijkste nieuwsfeiten"',
    '   - "Internationale lessen"',
    '   - "Technologische ontwikkelingen"',
    '   - "Governance en compliance"',
    '',
    'Geef je antwoord als JSON (alleen gewone tekst in summary, geen HTML of aanhalingstekens):',
    '{"categories": [{"category": "naam", "summary": "Lopende tekst met bron [REF:uuid|ankertekst] verwerkt.", "articles": [{"article_id": "uuid", "category": "naam", "title": "titel", "url": "url", "score": 8, "why_matters": "strategische betekenis"}]}]}',
    '',
    'Artikelen:',
    articleList,
    '',
    'Geef alleen geldige JSON terug, geen uitleg of Markdown.',
  ].join('\n');

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 10000,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Geen geldige JSON in interne Claude-response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.categories || [];
  } catch (error) {
    console.error('Claude interne categorisatie fout:', error);
    return [];
  }
}

// GENERATE INTRO TEXT
async function generateIntroText(
  categoryGroups: CategoryGroup[],
  periodStart: Date,
  periodEnd: Date,
  type: 'external' | 'internal'
): Promise<string> {
  const topArticles = categoryGroups
    .flatMap(g => g.articles)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(a => a.title)
    .join(', ');

  const startStr = periodStart.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
  const endStr = periodEnd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  const externalInstructions = [
    'Schrijf een opening van 3-4 zinnen voor een tweewekelijkse AI governance nieuwsbrief voor Nederlandse MKB-professionals.',
    'Periode: ' + startStr + ' - ' + endStr,
    'Meest opvallende onderwerpen: ' + topArticles,
    '',
    'Stijl: journalistieke vakbladtoon, onpersoonlijk, geen wij/jij/u.',
    'Begin met de meest opvallende ontwikkeling - als de eerste zinnen van een krantenartikel.',
    'Geen verwijzing naar Digidactics, RouteAI of AISA.',
    'Vermijd: "In deze editie", "Beste lezer", open deuren.',
    'Schrijf in het Nederlands. Geef alleen de tekst terug, geen opmaak.',
  ].join('\n');

  const internalInstructions = [
    'Schrijf een strategische inleiding van 3-4 zinnen voor een interne marktanalyse voor Digidactics-directie.',
    'Periode: ' + startStr + ' - ' + endStr,
    'Meest opvallende ontwikkelingen: ' + topArticles,
    '',
    'Stijl: direct, analytisch, zakelijk. Mag stellig zijn.',
    'Benoem de strategische betekenis van de periode voor RouteAI en AISA.',
    'Schrijf in het Nederlands. Geef alleen de tekst terug, geen opmaak.',
  ].join('\n');

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: type === 'external' ? externalInstructions : internalInstructions }],
    });
    return message.content[0].type === 'text' ? message.content[0].text : '';
  } catch {
    return '';
  }
}

// SAVE ISSUE TO SUPABASE
async function saveIssue(
  issueNumber: number,
  periodStart: Date,
  periodEnd: Date,
  introText: string,
  categoryGroups: CategoryGroup[],
  type: 'external' | 'internal',
  validArticleIds: Set<string>
): Promise<string | null> {
  const monthYear = periodEnd.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
  const subjectLine = type === 'external'
    ? 'AI Governance Update #' + issueNumber + ' - ' + monthYear
    : 'Interne Marktanalyse #' + issueNumber + ' - ' + monthYear;

  const { data: issue, error: issueError } = await supabase
    .from('newsletter_issues')
    .insert({
      issue_number: issueNumber,
      period_start: periodStart.toISOString().split('T')[0],
      period_end: periodEnd.toISOString().split('T')[0],
      status: 'draft',
      type: type,
      subject: subjectLine,
      intro_text: introText,
    })
    .select('id')
    .single();

  if (issueError || !issue) {
    console.error('Fout bij aanmaken editie (' + type + '):', issueError);
    return null;
  }

  console.log('Editie ' + type + ' #' + issueNumber + ' aangemaakt: ' + issue.id);

  const articleRows = categoryGroups.flatMap((group, groupIdx) =>
    group.articles
      .filter(article => {
        const valid = validArticleIds.has(article.article_id);
        if (!valid) {
          console.warn('Onbekend article_id gefilterd: ' + article.article_id + ' (' + article.title + ')');
        }
        return valid;
      })
      .map((article, articleIdx) => ({
        issue_id: issue.id,
        article_id: article.article_id,
        category: group.category,
        category_summary: group.summary,
        display_order: groupIdx * 10 + articleIdx,
        included: true,
      }))
  );

  if (articleRows.length > 0) {
    const { error } = await supabase.from('newsletter_articles').insert(articleRows);
    if (error) {
      console.error('Fout bij opslaan artikelen:', error);
    } else {
      console.log(articleRows.length + ' artikelen opgeslagen (' + type + ')');
    }
  } else {
    console.warn('Geen geldige artikelen om op te slaan voor editie ' + type + ' #' + issueNumber);
  }

  return issue.id;
}

// MAIN PROCESS
async function generateNewsletterDraft(): Promise<void> {
  console.log('Nieuwsbrief drafts genereren...');

  const { create, issueNumber, periodStart } = await shouldCreateNewIssue();
  if (!create) return;

  const periodEnd = new Date();

  const articles = await fetchArticlesForPeriod(periodStart);
  if (articles.length === 0) {
    console.log('Geen artikelen gevonden voor deze periode');
    return;
  }

  const validArticleIds = new Set(articles.map(a => a.id));
  console.log('Geldige article IDs geladen: ' + validArticleIds.size);

  console.log('Claude categoriseert voor externe nieuwsbrief...');
  const externalGroups = await categorizeForExternal(articles);
  const externalIntro = await generateIntroText(externalGroups, periodStart, periodEnd, 'external');
  const externalId = await saveIssue(issueNumber, periodStart, periodEnd, externalIntro, externalGroups, 'external', validArticleIds);

  console.log('Claude categoriseert voor interne analyse...');
  const internalGroups = await categorizeForInternal(articles);
  const internalIntro = await generateIntroText(internalGroups, periodStart, periodEnd, 'internal');
  const internalId = await saveIssue(issueNumber, periodStart, periodEnd, internalIntro, internalGroups, 'internal', validArticleIds);

  console.log('Klaar - extern: ' + externalId + ' / intern: ' + internalId);
}

// HANDLERS
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await generateNewsletterDraft();
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
    await generateNewsletterDraft();
    return NextResponse.json({ status: 'done' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed', details: String(error) }, { status: 500 });
  }
}
