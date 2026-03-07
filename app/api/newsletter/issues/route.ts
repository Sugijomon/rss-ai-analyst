import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

function checkAuth(request: Request) {
  return request.headers.get('x-review-password') === process.env.REVIEW_PASSWORD;
}

export async function GET(request: Request) {
  if (!checkAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: issues, error } = await supabase
    .from('newsletter_issues')
    .select(`
      id, issue_number, period_start, period_end,
      status, subject, intro_text, sent_at,
      newsletter_articles (
        id, article_id, category, category_summary,
        display_order, included,
        articles ( title, url, score, why_matters )
      )
    `)
    .order('issue_number', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten articles
  const formatted = issues?.map(issue => ({
    ...issue,
    articles: (issue.newsletter_articles || []).map((na: any) => ({
      id: na.id,
      article_id: na.article_id,
      category: na.category,
      category_summary: na.category_summary,
      display_order: na.display_order,
      included: na.included,
      title: na.articles?.title || '',
      url: na.articles?.url || '',
      score: na.articles?.score || 0,
      why_matters: na.articles?.why_matters || '',
    })),
    newsletter_articles: undefined,
  }));

  return NextResponse.json({ issues: formatted });
}
