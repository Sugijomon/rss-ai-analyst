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

// EXTERNAL — nieuwsbrief opmaak (artikellijst per categorie)
function buildExternalHtml(issue: any, articles: any[]): string {
  const periodStart = new Date(issue.period_start).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
  const periodEnd = new Date(issue.period_end).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  let html = '<div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #2d3748;">';

  html += '<div style="border-bottom: 3px solid #4299e1; padding-bottom: 16px; margin-bottom: 24px;">';
  html += '<h1 style="margin: 0; font-size: 22px; color: #1a202c;">AI Governance Update #' + issue.issue_number + '</h1>';
  html += '<p style="margin: 6px 0 0; font-size: 13px; color: #718096;">' + periodStart + ' - ' + periodEnd + ' &middot; Digidactics</p>';
  html += '</div>';

  html += '<p style="font-size: 15px; line-height: 1.7; color: #2d3748; margin-bottom: 28px;">' + issue.intro_text + '</p>';
  html += '<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">';

  CATEGORIES.forEach(cat => {
    const catArticles = articles
      .filter(a => a.category === cat && a.included)
      .sort((a: any, b: any) => a.display_order - b.display_order);

    if (catArticles.length === 0) return;

    const summary = catArticles[0]?.category_summary;

    html += '<div style="margin-bottom: 32px;">';
    html += '<h2 style="font-size: 16px; color: #1a202c; margin: 0 0 8px 0; border-left: 3px solid #4299e1; padding-left: 10px;">' + cat + '</h2>';
    if (summary) {
      html += '<p style="font-size: 13px; color: #4a5568; line-height: 1.6; margin: 0 0 12px 0;">' + summary + '</p>';
    }
    html += '<ul style="margin: 0; padding-left: 20px;">';
    catArticles.forEach((a: any) => {
      html += '<li style="margin-bottom: 10px;">';
      html += '<a href="' + a.url + '" style="color: #4299e1; font-size: 14px; font-weight: 500; text-decoration: none;">' + a.title + '</a>';
      if (a.why_matters) {
        html += '<p style="margin: 3px 0 0; font-size: 12px; color: #718096; line-height: 1.5;">' + a.why_matters + '</p>';
      }
      html += '</li>';
    });
    html += '</ul></div>';
  });

  html += '<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 16px;">';
  html += '<p style="font-size: 11px; color: #a0aec0; line-height: 1.6;">Digidactics &middot; AI Governance Update &middot; Tweewekelijkse nieuwsbrief<br><a href="{{unsubscribe}}" style="color: #a0aec0;">Uitschrijven</a></p>';
  html += '</div>';

  return html;
}

// INTERNAL — blogvorm met lopende tekst en inline bronlinks
function buildInternalHtml(issue: any, articles: any[]): string {
  const periodStart = new Date(issue.period_start).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
  const periodEnd = new Date(issue.period_end).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  let html = '<div style="font-family: Georgia, serif; max-width: 680px; margin: 0 auto; padding: 32px; color: #1a202c; background: #ffffff;">';

  // Header
  html += '<div style="border-bottom: 2px solid #1a202c; padding-bottom: 20px; margin-bottom: 32px;">';
  html += '<p style="margin: 0 0 6px 0; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #718096; font-family: Arial, sans-serif;">Digidactics &middot; Intern &middot; Niet voor verspreiding</p>';
  html += '<h1 style="margin: 0 0 8px 0; font-size: 26px; font-weight: bold; color: #1a202c; line-height: 1.2;">Marktanalyse #' + issue.issue_number + '</h1>';
  html += '<p style="margin: 0; font-size: 14px; color: #4a5568; font-family: Arial, sans-serif;">' + periodStart + ' - ' + periodEnd + '</p>';
  html += '</div>';

  // Intro
  html += '<p style="font-size: 17px; line-height: 1.8; color: #2d3748; margin-bottom: 36px; font-style: italic; border-left: 3px solid #4299e1; padding-left: 16px;">' + issue.intro_text + '</p>';

  // Categorieen als blogsecties
  CATEGORIES.forEach(cat => {
    const catArticles = articles
      .filter((a: any) => a.category === cat && a.included)
      .sort((a: any, b: any) => a.display_order - b.display_order);

    if (catArticles.length === 0) return;

    const summary = catArticles[0]?.category_summary;

    html += '<div style="margin-bottom: 40px;">';

    // Sectietitel
    html += '<h2 style="font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #4299e1; font-family: Arial, sans-serif; margin: 0 0 12px 0; font-weight: 600;">' + cat + '</h2>';

    // Lopende tekst (HTML proza van Claude)
    if (summary) {
      html += '<div style="font-size: 15px; line-height: 1.85; color: #2d3748;">';
      // summary kan HTML-ankers bevatten van Claude
      // We stijlen alle links in de prose
      const styledSummary = summary
        .replace(/<a href=/g, '<a style="color: #2b6cb0; text-decoration: underline;" href=')
        .replace(/<p>/g, '<p style="margin: 0 0 14px 0;">');
      html += styledSummary;
      html += '</div>';
    }

    // Bronnenlijst onderaan sectie (compact, als referentie)
    if (catArticles.length > 0) {
      html += '<div style="margin-top: 12px; padding: 10px 14px; background: #f7fafc; border-radius: 4px; font-family: Arial, sans-serif;">';
      html += '<p style="margin: 0 0 6px 0; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #a0aec0;">Bronnen</p>';
      catArticles.forEach((a: any) => {
        html += '<p style="margin: 0 0 4px 0; font-size: 12px; color: #4a5568;">';
        html += '<a href="' + a.url + '" style="color: #4299e1; text-decoration: none;">' + a.title + '</a>';
        html += ' <span style="color: #a0aec0;">&middot; score ' + a.score + '/10</span>';
        html += '</p>';
      });
      html += '</div>';
    }

    html += '</div>';

    // Scheiding tussen secties
    html += '<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0 0 40px 0;">';
  });

  // Footer
  html += '<p style="font-size: 11px; color: #a0aec0; font-family: Arial, sans-serif; line-height: 1.6;">Digidactics &middot; Interne Marktanalyse &middot; Vertrouwelijk</p>';
  html += '</div>';

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
    .select('id, category, category_summary, display_order, included, articles ( title, url, score, why_matters )')
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

  // Kies HTML builder op basis van type
  const isInternal = issue.type === 'internal';
  const htmlContent = isInternal
    ? buildInternalHtml(issue, articles)
    : buildExternalHtml(issue, articles);

  // Interne editie — verstuur als transactionele email naar RECIPIENT_EMAIL, niet naar abonnees
  if (isInternal) {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (process.env.RESEND_API_KEY || ''),
      },
      body: JSON.stringify({
        from: 'Digidactics Intern <onboarding@resend.dev>',
        to: [process.env.RECIPIENT_EMAIL || ''],
        subject: issue.subject,
        html: htmlContent,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      return NextResponse.json({ error: 'Resend: ' + err }, { status: 500 });
    }

    await supabase
      .from('newsletter_issues')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json({ ok: true, channel: 'resend-internal' });
  }

  // Externe editie — verstuur als campagne via Brevo naar abonneelijst
  const brevoPayload = {
    name: 'AI Governance Update #' + issue.issue_number,
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
    return NextResponse.json({ error: 'Brevo: ' + err }, { status: 500 });
  }

  const brevoData = await brevoRes.json();

  await fetch('https://api.brevo.com/v3/emailCampaigns/' + brevoData.id + '/sendNow', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY || '' },
  });

  await supabase
    .from('newsletter_issues')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id);

  return NextResponse.json({ ok: true, channel: 'brevo-external', campaignId: brevoData.id });
}
