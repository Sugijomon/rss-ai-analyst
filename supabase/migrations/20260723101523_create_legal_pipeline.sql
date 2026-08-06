create table public.legal_signals (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.articles(id) on delete set null,

  feed_id text not null,
  source_title text not null,
  source_name text not null,
  source_url text not null,
  canonical_url text not null,
  source_level text not null
    check (source_level in ('primary', 'secondary')),
  published_at timestamptz,

  candidate_type text not null
    check (candidate_type in (
      'regulation_update',
      'guidance',
      'enforcement',
      'court_decision',
      'consultation',
      'standard',
      'other'
    )),
  candidate_status text not null default 'candidate'
    check (candidate_status = 'candidate'),
  candidate_legal_status text
    check (candidate_legal_status in (
      'proposed',
      'adopted',
      'published',
      'in_force',
      'applicable',
      'amended',
      'repealed'
    )),
  jurisdiction text not null default 'unknown'
    check (jurisdiction in ('EU', 'NL', 'other', 'unknown')),
  identifier text,
  instrument text,
  provision text,
  candidate_summary text not null,
  candidate_rationale text not null,
  evidence text[] not null default '{}',
  affected_modules text[] not null default '{}',
  primary_source_url text,
  confidence integer not null check (confidence between 1 and 10),

  change_type text not null
    check (change_type in ('new', 'updated')),
  content_hash text not null,
  model_version text not null,
  prompt_version text not null,
  run_date date not null default current_date,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  review_status text not null default 'unreviewed'
    check (review_status in (
      'unreviewed',
      'reviewed_relevant',
      'reviewed_not_relevant'
    )),
  reviewed_at timestamptz,
  notification_status text not null default 'pending'
    check (notification_status in ('pending', 'sent', 'failed', 'skipped')),
  notified_at timestamptz,
  created_at timestamptz not null default now(),

  unique (canonical_url, content_hash)
);

create index legal_signals_run_date
  on public.legal_signals (run_date desc);

create index legal_signals_review_status
  on public.legal_signals (review_status, created_at desc);

create index legal_signals_identifier
  on public.legal_signals (identifier)
  where identifier is not null;

create index legal_signals_article_id
  on public.legal_signals (article_id)
  where article_id is not null;

alter table public.legal_signals enable row level security;
revoke all on public.legal_signals from anon, authenticated;
grant all on public.legal_signals to service_role;

create table public.legal_scan_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'completed', 'partial', 'failed')),
  feeds_attempted integer not null default 0 check (feeds_attempted >= 0),
  feeds_failed integer not null default 0 check (feeds_failed >= 0),
  items_found integer not null default 0 check (items_found >= 0),
  signals_created integer not null default 0 check (signals_created >= 0),
  signals_changed integer not null default 0 check (signals_changed >= 0),
  notifications_sent integer not null default 0 check (notifications_sent >= 0),
  error_summary text,
  created_at timestamptz not null default now()
);

create index legal_scan_runs_started_at
  on public.legal_scan_runs (started_at desc);

alter table public.legal_scan_runs enable row level security;
revoke all on public.legal_scan_runs from anon, authenticated;
grant all on public.legal_scan_runs to service_role;

alter table public.newsletter_articles
  add column legal_signal_id uuid
    references public.legal_signals(id) on delete cascade;

create index newsletter_articles_legal_signal_id
  on public.newsletter_articles (legal_signal_id)
  where legal_signal_id is not null;

alter table public.newsletter_articles
  add constraint newsletter_articles_exactly_one_source
  check (num_nonnulls(article_id, legal_signal_id) = 1) not valid;

alter table public.newsletter_articles
  validate constraint newsletter_articles_exactly_one_source;

alter table public.newsletter_articles
  drop constraint if exists valid_category;

alter table public.newsletter_articles
  add constraint valid_category
  check (category in (
    'Knelpunten en kansen',
    'Nieuws EU AI Act',
    'Belangrijkste nieuwsfeiten',
    'Internationale lessen',
    'Technologische ontwikkelingen',
    'Governance en compliance',
    'Lezenswaardig onderzoek',
    'Juridische signalen'
  ));
