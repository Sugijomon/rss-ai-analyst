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

RSS-titels en RSS-inhoud worden voor validatie, AI-analyse en opslag naar platte tekst
genormaliseerd. Google Alerts-opmaak zoals `<b>` en HTML-entiteiten zoals `&#39;`
worden daardoor niet letterlijk in mails of nieuwsbriefconcepten getoond.

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

## Opslag en bronupdates v1

Een SHA-256 hash wordt berekend over titel, canonical URL en RSS-inhoud.

- Onbekende canonical URL: `change_type = new`
- Bekende URL met andere hash: `change_type = updated`
- Bekende URL met dezelfde hash: alleen `last_seen_at` wordt bijgewerkt

`change_type = updated` betekent in v1 uitsluitend dat de zichtbare RSS-broninhoud is
gewijzigd. Dit bevestigt geen juridische wijziging. Bronupdates blijven auditbaar in
`legal_signals`, maar worden niet genotificeerd en niet aan daily brief of nieuwsbrief
doorgegeven. De pipeline haalt geen volledige webpagina's op.

Verschillende canonical URLs die hetzelfde juridische voorval beschrijven, worden in v1
niet semantisch samengevoegd. Cross-source gebeurtenisdeduplicatie is een afzonderlijke
vervolgstap.

## Distributiebeleid

- Alle positief gevalideerde kandidaten worden voor audit opgeslagen.
- Alleen nieuwe kandidaten met confidence 6 of hoger gaan naar notificatiemail,
  daily brief en nieuwsbrief.
- Voor kandidaat-type `other` geldt confidence 7 of hoger.
- Maximaal drie geschikte juridische signalen worden aan daily brief en
  nieuwsbriefconcepten toegevoegd.
- `legal_scan_runs.notifications_sent` telt genotificeerde signalen in de ene
  samengevoegde mail, niet het aantal verzonden e-mails.

Een nieuwe run wordt overgeslagen als minder dan 60 minuten eerder al een run met status
`running`, `completed` of `partial` is gestart. De API retourneert dan
`{"status":"skipped","reason":"recent_run"}`. Dit voorkomt onbedoelde snelle herhaling;
het is geen databasebrede concurrency-lock.

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
6. Trigger legal-scan eenmalig handmatig en controleer `legal_scan_runs`. Start niet
   opnieuw bij een client-timeout voordat runmetadata en Vercel-logs zijn gecontroleerd.
7. Controleer de interne mail, daily brief en Review UI voordat extern wordt verzonden.
