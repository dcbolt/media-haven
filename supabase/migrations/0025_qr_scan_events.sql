-- QR attribution + signage insights (host 2026-11-22).
-- No guest PII, IPs, or full user agents. Service-role inserts only; RLS
-- default-deny (no anon/authenticated read or write policies).

create table if not exists qr_scan_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id),
  slug text not null,
  slide_id text,
  property_slug text not null default 'unknown',
  attribution_tag text,
  tv_device_id text,
  visitor_key text,
  scanned_hour timestamptz not null,
  ua_class text not null default 'unknown',
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists qr_scan_events_org_hour_idx
  on qr_scan_events (org_id, scanned_hour desc);

create index if not exists qr_scan_events_breakdown_idx
  on qr_scan_events (org_id, slug, slide_id, property_slug, tv_device_id, scanned_hour)
  where is_test = false;

create table if not exists tv_slide_impressions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id),
  slide_id text not null,
  property_slug text not null default 'unknown',
  tv_device_id text,
  shown_hour timestamptz not null,
  show_count integer not null default 1 check (show_count >= 0),
  seconds_on_screen integer not null default 0 check (seconds_on_screen >= 0),
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists tv_slide_impressions_insights_idx
  on tv_slide_impressions (org_id, slide_id, property_slug, tv_device_id, shown_hour)
  where is_test = false;

create table if not exists tv_feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id),
  property_slug text not null default 'unknown',
  tv_device_id text,
  slide_id text,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 500),
  submitted_hour timestamptz not null,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists tv_feedback_submissions_hour_idx
  on tv_feedback_submissions (org_id, property_slug, tv_device_id, submitted_hour);

create index if not exists tv_feedback_submissions_insights_idx
  on tv_feedback_submissions (org_id, slide_id, property_slug, submitted_hour)
  where is_test = false;

alter table qr_scan_events enable row level security;
alter table tv_slide_impressions enable row level security;
alter table tv_feedback_submissions enable row level security;

revoke all on table qr_scan_events from anon, authenticated;
revoke all on table tv_slide_impressions from anon, authenticated;
revoke all on table tv_feedback_submissions from anon, authenticated;