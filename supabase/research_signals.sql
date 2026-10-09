-- Research-rule signals (handover manual: 5m burst, ten conditions, 90-min
-- dedupe; layer 2 = one-sided Mann-Kendall on 13 OI prints t0-45..t0+15).
-- Written by crypto-alerts-worker (service_role). NOT APPLIED YET.
-- Apply before deploying feat/research-rule-replace-p12.

create table if not exists public.research_signals (
  id              bigserial primary key,
  symbol          text        not null,              -- USDT-M futures symbol (e.g. GTCUSDT, 1000PEPEUSDT)
  spot_symbol     text,                              -- same-name spot used for condition 10
  rule            text        not null default 'research_5m_oi_mk',
  burst_open      timestamptz not null,              -- 5m bar open (UTC)
  burst_close     timestamptz not null,
  decide_at       timestamptz not null,              -- burst_open + 20 min (observation bar close)
  status          text        not null default 'pending'
                  check (status in ('pending', 'passed', 'failed', 'error')),
  reason          text,
  -- layer 1 (burst bar; volume in coins)
  open            double precision,
  high            double precision,
  low             double precision,
  close           double precision,
  volume          double precision,
  ret             double precision,
  rvol            double precision,
  taker_ratio     double precision,
  delta_z         double precision,
  oi              double precision,
  oi_chg          double precision,
  clv             double precision,
  upper_wick      double precision,
  vwap            double precision,
  prior_4h_high   double precision,
  spot_close      double precision,
  spot_ret        double precision,
  -- layer 2
  obs_trend       double precision,                  -- Theil-Sen 60-min OI change
  obs_p           double precision,                  -- one-sided Mann-Kendall p
  obs_tau         double precision,
  obs_path        text,
  sig_trend       double precision,                  -- signal window (reported only)
  sig_p           double precision,
  sig_tau         double precision,
  sig_path        text,
  decided_at      timestamptz,
  message         text,
  telegram_sent   boolean     not null default false,
  telegram_sent_at timestamptz,
  telegram_message_id text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (symbol, burst_open)
);

create index if not exists research_signals_burst_open_idx on public.research_signals (burst_open desc);
create index if not exists research_signals_status_idx on public.research_signals (status, burst_open desc);

alter table public.research_signals enable row level security;
-- No anon/authenticated policies: the site reads through the security-definer
-- functions below; the worker uses service_role (bypasses RLS).

-- Public read for the dashboard (operational fields only).
create or replace function public.dashboard_research_signals(since timestamptz default now() - interval '45 days')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.burst_open desc), '[]'::jsonb)
  from (
    select id, symbol, spot_symbol, burst_open, burst_close, decide_at, status, reason,
           close, volume, ret, rvol, taker_ratio, delta_z, oi_chg, clv, upper_wick,
           obs_trend, obs_p, sig_trend, sig_p, decided_at, telegram_sent
    from research_signals
    where burst_open >= since
    order by burst_open desc
    limit 2000
  ) s;
$$;

revoke all on function public.dashboard_research_signals(timestamptz) from public;
grant execute on function public.dashboard_research_signals(timestamptz) to anon, authenticated;

-- New live snapshot for the site (the P12 dashboard_live() stays until cleanup).
create or replace function public.dashboard_research_live()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'rule', 'research_5m_oi_mk',
    'worker', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', worker_name,
        'heartbeat', last_heartbeat,
        'meta', meta
      )), '[]'::jsonb)
      from worker_state
    ),
    'counts', (
      select jsonb_build_object(
        'total', count(*),
        'passed', count(*) filter (where status = 'passed'),
        'failed', count(*) filter (where status = 'failed'),
        'pending', count(*) filter (where status = 'pending'),
        'error', count(*) filter (where status = 'error'),
        'last_24h', count(*) filter (where burst_open >= now() - interval '24 hours')
      )
      from research_signals
    ),
    'recent', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.burst_open desc), '[]'::jsonb)
      from (
        select id, symbol, burst_open, burst_close, status, reason, close, ret, rvol,
               taker_ratio, oi_chg, obs_trend, obs_p, telegram_sent
        from research_signals
        order by burst_open desc
        limit 30
      ) r
    )
  );
$$;

revoke all on function public.dashboard_research_live() from public;
grant execute on function public.dashboard_research_live() to anon, authenticated;
