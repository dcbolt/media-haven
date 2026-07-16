-- Shared cache for the Guesty OAuth access token. Guesty allows only
-- 5 token requests per key per 24h; caching here keeps all serverless
-- invocations on one token (~1 request/day). Singleton row, id = 1.

create table guesty_tokens (
  id int primary key check (id = 1),
  access_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table guesty_tokens enable row level security;
