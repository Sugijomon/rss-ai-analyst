import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

function checkAuth(request: Request) {
  return request.headers.get('x-review-password') === process.env.REVIEW_PASSWORD;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { subject, intro_text, status, articles } = await request.json();

  const { error: issueError } = await supabase
    .from('newsletter_issues')
    .update({ subject, intro_text, status })
    .eq('id', id);

  if (issueError) return NextResponse.json({ error: issueError.message }, { status: 500 });

  if (articles?.length) {
    for (const article of articles) {
      await supabase
        .from('newsletter_articles')
        .update({ included: article.included })
        .eq('id', article.id);
    }
  }

  return NextResponse.json({ ok: true });
}
