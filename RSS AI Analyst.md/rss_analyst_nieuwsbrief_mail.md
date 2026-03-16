# Digidactics RSS AI Analyst — Projectdocumentatie

**Bijgewerkt:** maart 2026  
**GitHub:** github.com/Sugijomon/rss-ai-analyst  
**Vercel:** rss-ai-analyst.vercel.app  
**Supabase:** cdbacizxhnacriicikxw.supabase.co

---

## 1. Doel van het systeem

Twee geautomatiseerde pipelines vanuit dezelfde RSS-feedbron:

**Pipeline 1 — Dagelijkse brief (persoonlijk)**  
Elke ochtend om 06:00 een overzicht van relevante AI governance artikelen, direct naar rink@digidactics.nl via Resend.

**Pipeline 2 — Tweewekelijkse nieuwsbrief (extern)**  
Elke twee weken een samengestelde nieuwsbrief voor MKB-abonnees, via de Review UI handmatig goedgekeurd en verstuurd via Brevo.

---

## 2. Tech stack

| Component | Dienst | Doel |
|---|---|---|
| Hosting & crons | Vercel | Next.js deployment, scheduled jobs |
| Database | Supabase | Artikelopslag, nieuwsbrief edities |
| AI analyse | Anthropic Claude Sonnet 4.6 | Scoring, samenvatting, categorisering |
| Dagelijkse email | Resend | Persoonlijke dagelijkse brief |
| Nieuwsbrief email | Brevo | Externe nieuwsbrief naar abonnees |
| RSS parsing | rss-parser (npm) | Feed ophalen en parsen |
| Framework | Next.js 16 (App Router) | API routes + Review UI |

---

## 3. Mappenstructuur

```
app/
  api/
    cron/
      daily-brief/
        route.ts          Dagelijkse RSS analyse + email via Resend
      newsletter-draft/
        route.ts          Tweewekelijkse nieuwsbrief genereren
    newsletter/
      auth/
        route.ts          Wachtwoordcheck voor Review UI
      issues/
        route.ts          Edities ophalen uit Supabase (GET)
      issue/
        [id]/
          route.ts        Editie opslaan/updaten (PATCH)
      send/
        [id]/
          route.ts        Editie versturen via Brevo (POST)
  review/
    page.tsx              Review UI — inloggen, edities bekijken, versturen
```

---

## 4. Environment variabelen (Vercel)

Alle variabelen staan in: Vercel → rss-ai-analyst → Settings → Environment Variables

| Variabele | Waarde | Gebruik |
|---|---|---|
| ANTHROPIC_API_KEY | sk-ant-... | Claude API — beide pipelines |
| SUPABASE_URL | https://cdbacizxhnacriicikxw.supabase.co | Database |
| SUPABASE_SERVICE_KEY | eyJ... (service_role) | Database schrijven |
| RESEND_API_KEY | re_... | Dagelijkse brief versturen |
| RECIPIENT_EMAIL | rink@digidactics.nl | Ontvanger dagelijkse brief |
| CRON_SECRET | zelfgekozen secret | Beveiliging cron endpoints |
| REVIEW_PASSWORD | zelfgekozen wachtwoord | Toegang /review pagina |
| BREVO_API_KEY | uit Brevo account | Nieuwsbrief versturen |
| BREVO_SENDER_EMAIL | rink@digidactics.nl | Verzendadres (geverifieerd) |
| BREVO_LIST_ID | 7 | Contactlijst "Nieuwsbrief RSS AI Analist" |
| BREVO_SENDER_NAME | Digidactics | Afzendernaam (optioneel) |

---

## 5. Cron schema (vercel.json)

```json
{
  "crons": [
    { "path": "/api/cron/daily-brief", "schedule": "0 6 * * *" },
    { "path": "/api/cron/newsletter-draft", "schedule": "0 7 * * 1" }
  ]
}
```

- `daily-brief`: elke dag 06:00 UTC
- `newsletter-draft`: elke maandag 07:00 UTC (maakt alleen nieuwe editie als laatste 14+ dagen geleden)

Handmatig triggeren via PowerShell:
```powershell
Invoke-WebRequest -Uri "https://rss-ai-analyst.vercel.app/api/cron/newsletter-draft" -Method GET -Headers @{"Authorization" = "Bearer JOUW_CRON_SECRET"} -UseBasicParsing
```

---

## 6. Supabase tabellen

### articles
Dagelijks gevuld door de daily-brief cron.

| Kolom | Type | Omschrijving |
|---|---|---|
| id | uuid | Primary key |
| title | text | Artikeltitel (Nederlands) |
| url | text | Originele URL |
| score | integer | Relevantiescor 1-10 |
| summary | text[] | 3 bulletpoints (Nederlands) |
| why_matters | text | Waarom relevant (Nederlands) |
| tags | text[] | Regelgeving, Markt, Vacatures, etc. |
| opportunity | text | RouteAI kans (optioneel) |
| aisa_opportunity | text | AISA kans (optioneel) |
| run_date | date | Datum van de analyse-run |
| selected_for_newsletter | boolean | Geselecteerd voor nieuwsbrief |
| used_in_issue | integer | Welke editie |
| created_at | timestamptz | Aanmaakdatum |

Unieke index op `(url, run_date)` — geen dubbele artikelen per dag.

### newsletter_issues
Een rij per nieuwsbrief editie.

| Kolom | Type | Omschrijving |
|---|---|---|
| id | uuid | Primary key |
| issue_number | integer | Editienummer (1, 2, 3...) |
| period_start | date | Begin van de periode |
| period_end | date | Einde van de periode |
| status | text | draft / ready / sent |
| subject | text | Onderwerpregel |
| intro_text | text | Openingstekst (aanpasbaar in Review UI) |
| sent_at | timestamptz | Verzenddatum |

### newsletter_articles
Koppeltabel: welke artikelen zitten in welke editie.

| Kolom | Type | Omschrijving |
|---|---|---|
| id | uuid | Primary key |
| issue_id | uuid | FK naar newsletter_issues |
| article_id | uuid | FK naar articles |
| category | text | Een van de 6 categorieën |
| category_summary | text | Claude-intro voor die categorie |
| display_order | integer | Volgorde binnen categorie |
| included | boolean | Aan/uit via Review UI |

Categorieën (constraint): Pijnpunten en kansen, Nieuws EU AI Act, Belangrijkste nieuwsfeiten, Internationale lessen, Technologische ontwikkelingen, Governance en compliance.

---

## 7. RSS feeds

### RAI feeds (23 stuks) — Google Alerts + directe feeds
Gericht op: AI governance jobs, EU AI Act, regelgeving, Shadow AI, NL-specifiek.

Google Alerts account: 09449303513221250695

Actieve feed IDs:
- 712363126844262138 — AI governance/compliance jobs (EN)
- 8360176497618447048 — AI functietitels jobs (EN)
- 712363126844260895 — Enterprise AI governance jobs (EN)
- 14759970723841580188 — EU AI Act (EN)
- 3370223869929194536 — EU AI Act compliance/enforcement (EN)
- 9227181759097594092 — EC AI Office + EDPB (EN)
- 10002060156204655808 — Law firm EU AI Act briefings (EN)
- 17378552453676393076 — Law firm EU AI Act briefings (NL)
- 10529135105258354989 — AI governance/compliance jobs breed (EN)
- 16104860397407571115 — AI governance NL/EU landen (EN)
- 7124011456707508388 — AI literacy + governance frameworks (EN)
- 10002060156204656018 — AI regulation Europa + NIST (EN)
- 13385062984594143224 — AI compliance markt + boetes (EN)
- 2164771014014474126 — ISO 42001/42005 (EN)
- 451554340955659707 — Shadow AI + shadow IT (EN)
- 8058027391759189925 — MKB AI governance NL (NL)
- 8506129854880045759 — AI wet Europa (NL)
- 1576620731540475628 — AI recruitment compliance (EN)
- 11046596549212494694 — Shadow AI NL werkplek (NL)
- digital-strategy.ec.europa.eu/en/rss.xml (directe feed)
- nist.gov/news-events/news/rss.xml (directe feed)
- artificialintelligence-news.com/feed/ (directe feed)
- technologyreview.com/feed/ (directe feed)

### AISA feeds (18 stuks) — Google Alerts
Gericht op: AI literacy, upskilling, MKB training, ISO 42001 NL, handhaving.

Feed IDs:
- 11398596379508912216 — AI literacy NL werkplek (NL)
- 3751838535575008662 — AI upskilling/reskilling NL (NL)
- 13822444391883320846 — AI upskilling/reskilling Europa (EN)
- 11628233551391557605 — AI training medewerkers NL (NL)
- 9854549709752547786 — AI skills workforce Europa (EN)
- 17215868415462242323 — Corporate AI training (EN)
- 3010114955718549497 — SME EU AI Act compliance (EN)
- 13053141497936131359 — DPO EU AI Act NL (NL)
- 14220739381911567576 — ISO 42001 certificering EN (EN)
- 14220739381911565544 — ISO 42001 certificering NL (NL)
- 14171728769092608143 — ISO 42005 (EN)
- 10756906360246997719 — Digitale Overheid AI (NL)
- 10756906360247000062 — RVO AI subsidie MKB (NL)
- 11006387725598065897 — Autoriteit Persoonsgegevens (NL)
- 12740235320510231143 — EU AI Act boetes handhaving (EN)
- 10340594049990774976 — AI Act member state implementatie (EN)
- 1685465714473872504 — Agentic AI governance (EN)
- 831771200614974644 — AI governance MKB NL (NL)

---

## 8. Claude prompt configuratie

### Daily brief (daily-brief/route.ts)
- Model: claude-sonnet-4-6
- Max tokens: 4000 per batch
- Batch size: 5 artikelen tegelijk
- Minimale score voor opslag: 5/10
- Output taal: Nederlands
- Tags: Regelgeving, Markt, Vacatures, Technologie, Risico, Vaardigheden, Handhaving
- Output velden: score, title, summary (3 bullets), whyMatters, tags, url, opportunity, aisaOpportunity

### Newsletter draft (newsletter-draft/route.ts)
- Model: claude-sonnet-4-6
- Max tokens: 6000 (categorisering), 500 (intro)
- Minimale score voor selectie: 7/10
- Max artikelen per categorie: 4
- Schrijfstijl: journalistiek, beschouwend, onpersoonlijk, geen jargon
- Geen wij/jij/u — derde persoon of onpersoonlijk

---

## 9. CONFIG waarden (daily-brief/route.ts)

```typescript
const CONFIG = {
  maxArticlesPerFeed: 3,
  hoursLookback: 36,        // Was 48, verlaagd om overlap te reduceren
  minRelevanceScore: 5,
  maxArticlesInBrief: 15,
  recipientEmail: process.env.RECIPIENT_EMAIL,
};
```

---

## 10. Review UI workflow

1. Ga naar rss-ai-analyst.vercel.app/review
2. Log in met REVIEW_PASSWORD
3. Kies een editie (status: draft)
4. Schakel artikelen aan/uit per categorie
5. Pas intro tekst of onderwerpregel aan indien gewenst
6. Klik "Verstuur" — campagne wordt direct aangemaakt en verzonden in Brevo
7. Status wijzigt naar "sent" in Supabase

Nieuwe editie handmatig genereren:
1. Verwijder eventuele bestaande editie in Supabase: `DELETE FROM newsletter_issues WHERE issue_number = X;`
2. Trigger cron via PowerShell (zie sectie 5)
3. Ga naar /review — nieuwe editie staat klaar

---

## 11. Brevo configuratie

- Account: Digidactics
- Verified sender domain: digidactics.nl
- Verzendadres: rink@digidactics.nl
- Nieuwsbrief lijst: "Nieuwsbrief RSS AI Analist #7" (ID: 7)
- AISA funnel lijst: "AISA Funnel Leads" (ID: 3) — apart, niet voor nieuwsbrief
- Uitschrijflink: automatisch via {{unsubscribe}} placeholder in HTML

---

## 12. Beslissingen en rationale

| Beslissing | Keuze | Reden |
|---|---|---|
| Email dagelijkse brief | Resend | Al geconfigureerd, werkt goed |
| Email nieuwsbrief | Brevo | GDPR, EU servers, contactbeheer, al account |
| Database | Supabase | Single DB voor alle Digidactics apps |
| Hosting | Vercel | Next.js native, gratis crons |
| AI model | Claude Sonnet 4.6 | Beste balans snelheid/kwaliteit |
| Taal output | Nederlands | Doelgroep is NL MKB |
| hoursLookback | 36 uur | Minder overlap tussen dagelijkse runs |
| Score drempel dagelijks | 5/10 | Ruim opslaan, nieuwsbrief filtert strenger |
| Score drempel nieuwsbrief | 7/10 | Alleen beste artikelen in externe brief |
| Review beveiliging | Env wachtwoord | Snel, voldoende voor intern gebruik |

---

## 13. Geplande doorontwikkeling

### Korte termijn
- Tally.so aanmeldformulier op digidactics.nl koppelen aan Brevo lijst #7 via webhook
- Deduplicatie verbeteren in fetchRecentArticles() — zelfde artikel verschijnt soms 2-3x
- Feed 10340594049990774976 evalueren na 2 weken (jaar in zoekterm is suboptimaal)

### Middellange termijn
- Nieuwsbrief integreren als optie in RouteAI dashboard (abonnees via product)
- Nieuwsbrief integreren als optie in AISA dashboard
- Onderwerpselectie per abonnee (voorkeur voor categorieën)
- Aparte nieuwsbrief versie voor AISA vs RouteAI focus

### Lange termijn
- Migratie Lovable → Next.js voor RouteAI zodra 3+ betalende klanten
- Review UI uitbreiden met artikel-editor (tekst aanpassen per artikel)
- Analytics dashboard: welke categorieën scoren het best bij abonnees

---

## 14. Bekende issues en aandachtspunten

- Next.js 15+ vereist `params` als Promise in dynamic routes: `{ params: Promise<{ id: string }> }` — niet de oude synchrone syntax
- Backticks in template literals kunnen corrupt raken bij kopiëren uit chat — gebruik string concatenatie met `+` als alternatief
- Em-dash karakter `—` in template literals veroorzaakt Turbopack parse errors — vervang door `-`
- Vercel crons gebruiken GET, niet POST — beide handlers zijn aanwezig in alle cron routes
- Na toevoegen env variabelen in Vercel altijd redeploy uitvoeren

---

## 15. Relevante URLs

| Omschrijving | URL |
|---|---|
| Review UI | rss-ai-analyst.vercel.app/review |
| Vercel project | vercel.com/digidactics-projects-0927ba73/rss-ai-analyst |
| GitHub repo | github.com/Sugijomon/rss-ai-analyst |
| Supabase project | supabase.com/dashboard/project/cdbacizxhnacriicikxw |
| Brevo account | app.brevo.com |
| Anthropic console | console.anthropic.com |
| Google Alerts | google.com/alerts (account: 09449303513221250695) |
