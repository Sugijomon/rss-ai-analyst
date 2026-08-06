import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { FeedArticle } from '@/lib/rss';
import {
  LEGAL_MODEL,
  LEGAL_PROMPT_VERSION,
  LEGAL_SYSTEM_PROMPT,
  LEGAL_RUN_GUARD_MINUTES,
  isLegalSignalDistributable,
  parseLegalResults,
  sanitizeCandidateLegalStatus,
  shouldSkipRecentLegalRun,
  type LegalCandidate,
} from '@/lib/legal';
import { getFeedsForPipeline } from '@/lib/feeds';
import { fetchFeedArticles } from '@/lib/rss';
import { getAnthropic, getResend, getSupabase } from '@/lib/server-clients';

const CONFIG = {
  hoursLookback: 48,
  maxArticlesPerFeed: 5,
  batchSize: 5,
  maxTokens: 2000,
};

interface ExistingSignal {
  id: string;
  canonical_url: string;
  content_hash: string;
}

interface ExistingArticle {
  id: string;
  url: string;
}

interface SignalInsert {
  article_id: string | null;
  feed_id: string;
  source_title: string;
  source_name: string;
  source_url: string;
  canonical_url: string;
  source_level: 'primary' | 'secondary';
  published_at: string;
  candidate_type: LegalCandidate['candidate_type'];
  candidate_status: 'candidate';
  candidate_legal_status: LegalCandidate['candidate_legal_status'];
  // Aard van de wijziging zoals de classifier die extraheert (v2). Niet te verwarren met
  // change_type hieronder, dat de route zelf zet om nieuw vs. bijgewerkt bij te houden.
  candidate_change_type: LegalCandidate['change_type'];
  jurisdiction: LegalCandidate['jurisdiction'];
  identifier: string | null;
  instrument: string | null;
  provision: string | null;
  candidate_summary: string;
  candidate_rationale: string;
  evidence: string[];
  affected_modules: string[];
  primary_source_url: string | null;
  confidence: number;
  change_type: 'new' | 'updated';
  content_hash: string;
  model_version: string;
  prompt_version: string;
}

interface CreatedSignal extends SignalInsert {
  id: string;
}

function contentHash(article: FeedArticle): string {
  return createHash('sha256')
    .update(article.title + '\n' + article.url + '\n' + article.content)
    .digest('hex');
}

function buildPrompt(articles: FeedArticle[]): string {
  return [
    LEGAL_SYSTEM_PROMPT,
    '',
    'Artikelen:',
    articles.map((article, index) => [
      'ARTIKEL ' + (index + 1),
      'Titel: ' + article.title,
      'Bron: ' + article.feedLabel,
      'Bronniveau: ' + article.sourceLevel,
      'Datum: ' + article.publishedAt.toISOString(),
      'URL: ' + article.url,
      'Inhoud: ' + article.content,
    ].join('\n')).join('\n---\n'),
  ].join('\n');
}

async function analyzeArticles(
  articles: FeedArticle[]
): Promise<Array<{ article: FeedArticle; candidate: LegalCandidate }>> {
  const anthropic = getAnthropic();
  const candidates: Array<{ article: FeedArticle; candidate: LegalCandidate }> = [];

  for (let index = 0; index < articles.length; index += CONFIG.batchSize) {
    const batch = articles.slice(index, index + CONFIG.batchSize);
    try {
      const message = await anthropic.messages.create({
        model: LEGAL_MODEL,
        max_tokens: CONFIG.maxTokens,
        temperature: 0,
        messages: [{ role: 'user', content: buildPrompt(batch) }],
      });
      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      const results = parseLegalResults(responseText, batch.length);

      results.forEach((result, resultIndex) => {
        if (!result.is_legal_change) {
          return;
        }

        const article = batch[resultIndex];
        candidates.push({
          article,
          candidate: {
            ...result,
            candidate_legal_status: sanitizeCandidateLegalStatus(
              result.candidate_legal_status,
              article.sourceLevel
            ),
            primary_source_url:
              article.sourceLevel === 'primary' ? article.url : null,
          },
        });
      });

      console.log(
        'Legal batch ' + (Math.floor(index / CONFIG.batchSize) + 1) +
        ': ' + results.filter(result => result.is_legal_change).length +
        '/' + batch.length + ' candidates'
      );
    } catch (error) {
      console.error('Legal analysis batch failed:', error);
    }

    if (index + CONFIG.batchSize < articles.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return candidates;
}

async function persistCandidates(
  candidates: Array<{ article: FeedArticle; candidate: LegalCandidate }>
): Promise<CreatedSignal[]> {
  if (candidates.length === 0) {
    return [];
  }

  const supabase = getSupabase();
  const urls = Array.from(new Set(candidates.map(item => item.article.url)));

  const { data: existingSignalRows, error: existingError } = await supabase
    .from('legal_signals')
    .select('id, canonical_url, content_hash')
    .in('canonical_url', urls)
    .order('created_at', { ascending: false });

  if (existingError) {
    throw new Error('Existing legal signals could not be loaded: ' + existingError.message);
  }

  const latestByUrl = new Map<string, ExistingSignal>();
  for (const row of (existingSignalRows || []) as ExistingSignal[]) {
    if (!latestByUrl.has(row.canonical_url)) {
      latestByUrl.set(row.canonical_url, row);
    }
  }

  const { data: articleRows, error: articleError } = await supabase
    .from('articles')
    .select('id, url')
    .in('url', urls)
    .order('run_date', { ascending: false });

  if (articleError) {
    console.warn('Article links for legal signals could not be loaded:', articleError);
  }

  const articleIdByUrl = new Map<string, string>();
  for (const row of (articleRows || []) as ExistingArticle[]) {
    if (!articleIdByUrl.has(row.url)) {
      articleIdByUrl.set(row.url, row.id);
    }
  }

  const now = new Date().toISOString();
  const inserts: SignalInsert[] = [];

  for (const item of candidates) {
    const hash = contentHash(item.article);
    const existing = latestByUrl.get(item.article.url);

    if (existing?.content_hash === hash) {
      const { error } = await supabase
        .from('legal_signals')
        .update({ last_seen_at: now })
        .eq('id', existing.id);
      if (error) {
        console.error('Legal signal last_seen_at update failed:', error);
      }
      continue;
    }

    inserts.push({
      article_id: articleIdByUrl.get(item.article.url) || null,
      feed_id: item.article.feedId,
      source_title: item.article.title,
      source_name: item.article.feedLabel,
      source_url: item.article.url,
      canonical_url: item.article.url,
      source_level: item.article.sourceLevel,
      published_at: item.article.publishedAt.toISOString(),
      candidate_type: item.candidate.candidate_type,
      candidate_status: 'candidate',
      candidate_legal_status: item.candidate.candidate_legal_status,
      candidate_change_type: item.candidate.change_type,
      jurisdiction: item.candidate.jurisdiction,
      identifier: item.candidate.identifier,
      instrument: item.candidate.instrument,
      provision: item.candidate.provision,
      candidate_summary: item.candidate.candidate_summary,
      candidate_rationale: item.candidate.candidate_rationale,
      evidence: item.candidate.evidence,
      affected_modules: item.candidate.affected_modules,
      primary_source_url: item.candidate.primary_source_url,
      confidence: item.candidate.confidence,
      change_type: existing ? 'updated' : 'new',
      content_hash: hash,
      model_version: LEGAL_MODEL,
      prompt_version: LEGAL_PROMPT_VERSION,
    });
  }

  if (inserts.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('legal_signals')
    .insert(inserts)
    .select('*');

  if (error) {
    throw new Error('Legal signals could not be saved: ' + error.message);
  }

  return (data || []) as CreatedSignal[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNotification(signals: CreatedSignal[]): string {
  let html = '<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;">';
  html += '<h1>Kandidaat juridische signalen</h1>';
  html += '<p>Menselijke beoordeling is vereist. Deze signalen bevestigen geen rechtsstatus of compliance.</p>';

  for (const signal of signals) {
    html += '<div style="border-left:3px solid #0f6e56;padding:12px;margin:20px 0;background:#f2fbf7;">';
    html += '<p style="margin:0 0 6px;font-size:12px;color:#4a5568;">' +
      'Nieuw kandidaat-signaal' +
      ' - ' + escapeHtml(signal.jurisdiction || 'onbekend') + ' - confidence ' + signal.confidence + '/10</p>';
    html += '<h2 style="font-size:17px;margin:0 0 8px;">' + escapeHtml(signal.source_title) + '</h2>';
    html += '<p>' + escapeHtml(signal.candidate_summary) + '</p>';
    html += '<p><strong>Kandidaattype:</strong> ' + escapeHtml(signal.candidate_type) + '</p>';
    html += '<p><a href="' + escapeHtml(signal.canonical_url) + '">Open de directe bron</a></p>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

async function notify(signals: CreatedSignal[]): Promise<number> {
  if (signals.length === 0) {
    return 0;
  }

  const distributableSignals = signals.filter(isLegalSignalDistributable);
  const skippedIds = signals
    .filter(signal => !isLegalSignalDistributable(signal))
    .map(signal => signal.id);
  const recipient = process.env.LEGAL_NOTIFICATION_EMAIL || process.env.RECIPIENT_EMAIL;
  const ids = distributableSignals.map(signal => signal.id);
  const supabase = getSupabase();

  if (skippedIds.length > 0) {
    const { error } = await supabase
      .from('legal_signals')
      .update({ notification_status: 'skipped' })
      .in('id', skippedIds);
    if (error) {
      console.error('Skipped legal notification status update failed:', error);
    }
  }

  if (distributableSignals.length === 0) {
    return 0;
  }

  if (!recipient) {
    await supabase
      .from('legal_signals')
      .update({ notification_status: 'skipped' })
      .in('id', ids);
    console.warn('No LEGAL_NOTIFICATION_EMAIL or RECIPIENT_EMAIL configured');
    return 0;
  }

  const { error } = await getResend().emails.send({
    from: 'Digidactics Legal Monitor <legal@digidactics.nl>',
    to: recipient,
    subject: 'LEGAL - Kandidaat juridische signalen - ' +
      distributableSignals.length + ' nieuw',
    html: formatNotification(distributableSignals),
  });

  if (error) {
    await supabase
      .from('legal_signals')
      .update({ notification_status: 'failed' })
      .in('id', ids);
    throw new Error('Legal notification failed: ' + error.message);
  }

  const { error: updateError } = await supabase
    .from('legal_signals')
    .update({
      notification_status: 'sent',
      notified_at: new Date().toISOString(),
    })
    .in('id', ids);

  if (updateError) {
    console.error('Legal notification status update failed:', updateError);
  }
  return distributableSignals.length;
}

async function processLegalScan(): Promise<
  { status: 'done' } | { status: 'skipped'; reason: 'recent_run' }
> {
  const supabase = getSupabase();
  const legalFeeds = getFeedsForPipeline('legal-scan');
  const guardCutoff = new Date(
    Date.now() - LEGAL_RUN_GUARD_MINUTES * 60 * 1000
  ).toISOString();
  const { data: recentRun, error: recentRunError } = await supabase
    .from('legal_scan_runs')
    .select('id, started_at, status')
    .gte('started_at', guardCutoff)
    .in('status', ['running', 'completed', 'partial'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentRunError) {
    throw new Error('Recent legal scan runs could not be checked: ' + recentRunError.message);
  }

  if (recentRun && shouldSkipRecentLegalRun(recentRun.started_at)) {
    console.warn(
      'Legal scan skipped because run ' + recentRun.id +
      ' started less than ' + LEGAL_RUN_GUARD_MINUTES + ' minutes ago'
    );
    return { status: 'skipped', reason: 'recent_run' };
  }

  const { data: run, error: runError } = await supabase
    .from('legal_scan_runs')
    .insert({
      status: 'running',
      feeds_attempted: legalFeeds.length,
    })
    .select('id')
    .single();

  if (runError || !run) {
    throw new Error('Legal scan run could not be started: ' + (runError?.message || 'unknown'));
  }

  try {
    const { articles, failures } = await fetchFeedArticles(legalFeeds, {
      hoursLookback: CONFIG.hoursLookback,
      maxArticlesPerFeed: CONFIG.maxArticlesPerFeed,
    });
    const candidates = await analyzeArticles(articles);
    const createdSignals = await persistCandidates(candidates);
    const notificationsSent = await notify(createdSignals);
    const changedCount = createdSignals.filter(signal => signal.change_type === 'updated').length;

    const status = failures.length > 0 ? 'partial' : 'completed';
    const { error } = await supabase
      .from('legal_scan_runs')
      .update({
        finished_at: new Date().toISOString(),
        status,
        feeds_failed: failures.length,
        items_found: articles.length,
        signals_created: createdSignals.length,
        signals_changed: changedCount,
        notifications_sent: notificationsSent,
        error_summary: failures.length > 0
          ? failures.map(failure => failure.label + ': ' + failure.message).join('\n').slice(0, 5000)
          : null,
      })
      .eq('id', run.id);

    if (error) {
      console.error('Legal scan run finalization failed:', error);
    }
    return { status: 'done' };
  } catch (error) {
    await supabase
      .from('legal_scan_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'failed',
        error_summary: error instanceof Error ? error.message.slice(0, 5000) : String(error).slice(0, 5000),
      })
      .eq('id', run.id);
    throw error;
  }
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) &&
    request.headers.get('authorization') === 'Bearer ' + secret;
}

async function handleCron(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processLegalScan();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Legal scan failed:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
