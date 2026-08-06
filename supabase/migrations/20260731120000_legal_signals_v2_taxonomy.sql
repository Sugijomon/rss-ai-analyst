-- candidate_type: oude constraint eraf, waarden migreren, v2-constraint erop
alter table public.legal_signals drop constraint if exists legal_signals_candidate_type_check;

update public.legal_signals set candidate_type = 'legislation' where candidate_type = 'regulation_update';
update public.legal_signals set candidate_type = 'case_law'    where candidate_type = 'court_decision';

alter table public.legal_signals
  add constraint legal_signals_candidate_type_check
  check (candidate_type in
    ('legislation', 'guidance', 'enforcement', 'case_law', 'standard', 'consultation', 'other'));

-- jurisdiction: null toestaan, 'unknown' opschonen naar null
alter table public.legal_signals drop constraint if exists legal_signals_jurisdiction_check;

update public.legal_signals set jurisdiction = null where jurisdiction = 'unknown';

alter table public.legal_signals alter column jurisdiction drop not null;
alter table public.legal_signals alter column jurisdiction drop default;

alter table public.legal_signals
  add constraint legal_signals_jurisdiction_check
  check (jurisdiction is null or jurisdiction in ('EU', 'NL', 'other'));

-- candidate_change_type: nieuwe kolom voor het classifier-veld uit prompt v2
-- (los van de bestaande change_type-kolom, die nieuw/bijgewerkt bijhoudt voor de notificatielogica)
alter table public.legal_signals add column candidate_change_type text
  check (candidate_change_type in (
    'new_obligation',
    'amendment',
    'guidance',
    'enforcement_action',
    'case_law',
    'delay_or_transition',
    'repeal',
    'none'
  ));
