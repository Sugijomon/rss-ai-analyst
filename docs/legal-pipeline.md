# LEGAL-pipeline

## Doel

De LEGAL-pipeline detecteert kandidaat juridische signalen uit een centrale feedconfiguratie.
AI-uitkomsten bevestigen nooit rechtsstatus, compliance of juridische classificatie. Elke
positieve uitkomst krijgt `candidate_status = candidate` en vereist menselijke beoordeling.

## Feedconfiguratie

Alle 65 unieke feeds staan in `lib/feeds.ts`:

- RAI: 23
- AISA: 18
- Rapporten: 23
- LEGAL: 11

Groepen mogen overlappen. Alle 65 feeds blijven door daily brief gebruikt. De 11
LEGAL-feeds worden daarnaast door legal-scan verwerkt.

## Routes en schema

- `/api/cron/daily-brief`: bestaande redactionele analyse en dagelijkse mail, aangevuld
  met maximaal drie recente juridische kandidaatsignalen.
- `/api/cron/legal-scan`: juridische kandidaat-analyse, versieopslag en notificatiemail.
- `/api/cron/newsletter-draft`: maakt externe en interne drafts en voegt maximaal drie
  juridische signalen toe.

De reviewbare migratie maakt:

- `public.legal_signals`
- `public.legal_scan_runs`
- `newsletter_articles.legal_signal_id`
- nieuwsbriefcategorie `Juridische signalen`

De migratie revokeert `anon` en `authenticated` op de nieuwe LEGAL-tabellen. De bestaande
RLS-policies worden in deze wijziging niet aangepast.

## Wijzigingsdetectie v1

Een SHA-256 hash wordt berekend over titel, canonical URL en RSS-inhoud.

- Onbekende canonical URL: `change_type = new`
- Bekende URL met andere hash: `change_type = updated`
- Bekende URL met dezelfde hash: alleen `last_seen_at` wordt bijgewerkt

De pipeline haalt in v1 geen volledige webpagina's op en controleert dus geen wijzigingen
die niet in de RSS-inhoud zichtbaar zijn.

## Nieuwsbriefreview

- Interne analyse: kandidaat-signalen staan standaard aan.
- Externe nieuwsbrief: kandidaat-signalen staan standaard uit.
- Expliciete selectie in de externe Review UI zet `review_status` op
  `reviewed_relevant`.
- Selectie bevestigt relevantie voor publicatie, niet de rechtsstatus.

## Environment variables

Bestaand:

- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `RESEND_API_KEY`
- `RECIPIENT_EMAIL`
- `CRON_SECRET`
- `REVIEW_PASSWORD`
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`
- `BREVO_LIST_ID`
- `BREVO_SENDER_NAME`

Nieuw:

- `LEGAL_NOTIFICATION_EMAIL`: ontvanger van nieuwe of gewijzigde kandidaat-signalen.
  Als deze ontbreekt, wordt `RECIPIENT_EMAIL` gebruikt.

Geen secretwaarde hoort in de repository.

## Handmatige uitrol

1. Review de migratie en de volledige diff.
2. Roteer het eerder gepubliceerde `CRON_SECRET`.
3. Voeg `LEGAL_NOTIFICATION_EMAIL` toe in Vercel indien een aparte ontvanger gewenst is.
4. Pas de migratie handmatig toe na goedkeuring.
5. Deploy daarna de applicatieconfiguratie.
6. Trigger legal-scan eenmalig handmatig en controleer `legal_scan_runs`.
7. Controleer de interne mail, daily brief en Review UI voordat extern wordt verzonden.
