import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabase } from '@/lib/server-clients';

const IssueUpdateSchema = z.object({
  subject: z.string().min(1).max(500),
  intro_text: z.string().max(10000),
  status: z.enum(['draft', 'ready', 'sent']),
  articles: z.array(z.object({
    id: z.string().uuid(),
    legal_signal_id: z.string().uuid().nullable().optional(),
    included: z.boolean(),
  }).strict()).max(200),
}).strict();

function checkAuth(request: Request) {
  return request.headers.get('x-review-password') === process.env.REVIEW_PASSWORD;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const parsed = IssueUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { subject, intro_text, status, articles } = parsed.data;
  const supabase = getSupabase();

  const { data: issue, error: issueFetchError } = await supabase
    .from('newsletter_issues')
    .select('type')
    .eq('id', id)
    .single();

  if (issueFetchError || !issue) {
    return NextResponse.json({ error: 'Editie niet gevonden' }, { status: 404 });
  }

  const { error: issueError } = await supabase
    .from('newsletter_issues')
    .update({ subject, intro_text, status })
    .eq('id', id);

  if (issueError) return NextResponse.json({ error: issueError.message }, { status: 500 });

  if (articles.length) {
    for (const article of articles) {
      const { error: articleError } = await supabase
        .from('newsletter_articles')
        .update({ included: article.included })
        .eq('id', article.id)
        .eq('issue_id', id);

      if (articleError) {
        return NextResponse.json({ error: articleError.message }, { status: 500 });
      }

      if (issue.type === 'external' && article.included && article.legal_signal_id) {
        const { error: reviewError } = await supabase
          .from('legal_signals')
          .update({
            review_status: 'reviewed_relevant',
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', article.legal_signal_id);

        if (reviewError) {
          return NextResponse.json({ error: reviewError.message }, { status: 500 });
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
