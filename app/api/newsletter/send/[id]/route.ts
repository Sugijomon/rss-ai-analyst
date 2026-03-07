import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

function checkAuth(request: Request) {
  return request.headers.get('x-review-password') === process.env.REVIEW_PASSWORD;
}

const CATEGORIES = [
  'Pijnpunten en kansen',
  'Nieuws EU AI Act',
  'Belangrijkste nieuwsfeiten',
  'Internationale lessen',
  'Technologische ontwikkelingen',
  'Governance en compliance',
];

function buildEmailHtml(issue: any, articles: any[]): string {
  const periodStart = new Date(issue.period_start).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
  const periodEnd = new Date(issue.period_end).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #2d3748;">
      <div style="border-bottom: 3px solid #4299e1; padding-bottom: 16px; margin-bottom: 24px;">
        <h1 style="margin: 0; font-size: 22px; color: #1a202c;">
          🤖 AI Governance Update #${issue.issue_number}
        </h1>
        <p style="margin: 6px 0 0; font-size: 13px; color: #718096;">
          ${periodStart} – ${periodEnd} · Digidactics
        </p>
      </div>
      <p style="font-size: 15px; line-height: 1.7; color: #2d3748; margin-bottom: 28px;">
        ${issue.intro_text}
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
  `;

  CATEGORIES.forEach(cat => {
    const catArticles = articles
      .filter(a => a.category === cat && a.included)
      .sort((a, b) => a.display_order - b.display_order);

    if (catArticles.length === 0) return;

    const summary = catArticles[0]?.category_summary;

    html += `
      <div style="margin-bottom: 32px;">
        <h2 style="font-size: 16px; color: #1a202c; margin: 0 0 8px 0;
                   border-left: 3px solid #4299e1; padding-left: 10px;">
          ${cat}
        </h2>
        ${summary ? `<p style="font-size: 13px; color: #4a5568; line-height: 1.6; margin: 0 0 12px 0;">${summary}</p>` : ''}
        <ul style="margin: 0; padding-left: 20px;">
    `;

    catArticles.forEach(a => {
      html += `
          <li style="margin-bottom: 10px;">
            <a href="${a.url}" style="color: #4299e1; font-size: 14px; font-weight: 500; text-decoration: none;">
              ${a.title}
            </a>
            ${a.why_matters ? `<p style="margin: 3px 0 0; font-size: 12px; color: #718096; line-height: 1.5;">${a.why_matters}</p>` : ''}
          </li>
      `;
    });

    html += `</ul></div>`;
  });

  html += `
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 16px;">
      <p style="font-size: 11px; color: #a0aec0; line-height: 1.6;">
        Digidactics · AI Governance Update · Tweewekelijkse nieuwsbrief<br>
        <a href="{{unsubscribe}}" style="color: #a0aec0;">Uitschrijven</a>
      </p>
    </div>
  `;

  return html;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: issue, error: issueError } = await supabase
    .from('newsletter_issues')
    .select('*')
    .eq('id', id)
    .single();

  if (issueError || !issue) {
    return NextResponse.json({ error: 'Editie niet gevonden' }, { status: 404 });
  }

  const { data: naRows, error: naError } = await supabase
    .from('newsletter_articles')
    .select(`
      id, category, category_summary, display_order, included,
      articles ( title, url, score, why_matters )
    `)
    .eq('issue_id', id)
    .eq('included', true);

  if (naError) return NextResponse.json({ error: naError.message }, { status: 500 });

  const articles = (naRows || []).map((na: any) => ({
    id: na.id,
    category: na.category,
    category_summary: na.category_summary,
    display_order: na.display_order,
    included: na.included,
    title: na.articles?.title || '',
    url: na.articles?.url || '',
    score: na.articles?.score || 0,
    why_matters: na.articles?.why_matters || '',
  }));

  const htmlContent = buildEmailHtml(issue, articles);

  const brevoPayload = {
    sender: {
      name: process.env.BREVO_SENDER_NAME || 'Digidactics',
      email: process.env.BREVO_SENDER_EMAIL,
    },
    subject: issue.subject,
    htmlContent,
    listIds: [parseInt(process.env.BREVO_LIST_ID || '1')],
  };

  const brevoRes = await fetch('https://api.brevo.com/v3/emailCampaigns', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.BREVO_API_KEY || '',
    },
    body: JSON.stringify(brevoPayload),
  });

  if (!brevoRes.ok) {
    const err = await brevoRes.text();
    console.error('Brevo error:', err);
    return NextResponse.json({ error: `Brevo: ${err}` }, { status: 500 });
  }

  const brevoData = await brevoRes.json();

  await fetch(`https://api.brevo.com/v3/emailCampaigns/${brevoData.id}/sendNow`, {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY || '' },
  });

  await supabase
    .from('newsletter_issues')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id);

  return NextResponse.json({ ok: true, campaignId: brevoData.id });
}
