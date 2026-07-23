import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/server-clients';

interface ContentRelation {
  title?: string;
  source_title?: string;
  url?: string;
  canonical_url?: string;
  score?: number;
  confidence?: number;
  why_matters?: string;
  candidate_summary?: string;
}

interface NewsletterArticleRow {
  id: string;
  article_id: string | null;
  legal_signal_id: string | null;
  category: string;
  category_summary: string | null;
  display_order: number | null;
  included: boolean | null;
  articles: ContentRelation | ContentRelation[] | null;
  legal_signals: ContentRelation | ContentRelation[] | null;
}

interface NewsletterIssueRow {
  id: string;
  issue_number: number;
  type: 'external' | 'internal';
  period_start: string;
  period_end: string;
  status: 'draft' | 'ready' | 'sent';
  subject: string | null;
  intro_text: string | null;
  sent_at: string | null;
  newsletter_articles: NewsletterArticleRow[] | null;
}

function firstRelation(
  relation: ContentRelation | ContentRelation[] | null
): ContentRelation | null {
  return Array.isArray(relation) ? relation[0] || null : relation;
}

function checkAuth(request: Request) {
  return request.headers.get('x-review-password') === process.env.REVIEW_PASSWORD;
}

export async function GET(request: Request) {
  if (!checkAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: issues, error } = await getSupabase()
    .from('newsletter_issues')
    .select(`
      id, issue_number, type, period_start, period_end,
      status, subject, intro_text, sent_at,
      newsletter_articles (
        id, article_id, legal_signal_id, category, category_summary,
        display_order, included,
        articles ( title, url, score, why_matters ),
        legal_signals ( source_title, canonical_url, confidence, candidate_summary )
      )
    `)
    .order('issue_number', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten articles
  const formatted = ((issues || []) as NewsletterIssueRow[]).map(issue => ({
    ...issue,
    articles: (issue.newsletter_articles || []).map(na => {
      const content = firstRelation(na.articles) || firstRelation(na.legal_signals);
      return {
        id: na.id,
        article_id: na.article_id,
        legal_signal_id: na.legal_signal_id,
        category: na.category,
        category_summary: na.category_summary,
        display_order: na.display_order,
        included: na.included,
        title: content?.title || content?.source_title || '',
        url: content?.url || content?.canonical_url || '',
        score: content?.score || content?.confidence || 0,
        why_matters: content?.why_matters || content?.candidate_summary || '',
      };
    }),
    newsletter_articles: undefined,
  }));

  return NextResponse.json({ issues: formatted });
}
