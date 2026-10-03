-- Read-only snapshot for the public dashboard.
-- Anon cannot select base tables (RLS on, no policies). This function is security definer
-- and returns only operational fields. Service role used by crypto-alerts-worker is unchanged.
-- Applied to project etdgcixvrjylxpkucxsd as migration dashboard_live_include_symbols.

create or replace function public.dashboard_live()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'symbols_spot_enabled', (select count(*) from symbols where enabled and market_type = 'spot'),
    'symbols_futures_enabled', (select count(*) from symbols where enabled and market_type = 'futures'),
    'rules_quiet_surge_enabled', (select count(*) from alert_rules where enabled and rule_type = 'quiet_surge_early'),
    'rules_enabled_other', (select count(*) from alert_rules where enabled and rule_type <> 'quiet_surge_early'),
    'quiet_surge_symbols', (
      select coalesce(jsonb_agg(symbol order by symbol), '[]'::jsonb)
      from alert_rules
      where enabled and rule_type = 'quiet_surge_early' and coalesce(market_type, 'spot') = 'spot'
    ),
    'watches_active', (select count(*) from alert_watches where status = 'active'),
    'watches_by_status', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
      from (select status, count(*) as n from alert_watches group by status) s
    ),
    'worker', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', worker_name,
        'heartbeat', last_heartbeat,
        'last_symbol', last_symbol,
        'last_open_time', last_open_time,
        'meta', meta
      )), '[]'::jsonb)
      from worker_state
    ),
    'recent_alerts', (
      select coalesce(jsonb_agg(to_jsonb(a) order by a.triggered_at desc), '[]'::jsonb)
      from (
        select id, symbol, market_type, alert_type, severity, title, left(message, 500) as message, triggered_at, telegram_sent
        from alerts
        order by triggered_at desc
        limit 30
      ) a
    ),
    'recent_watches', (
      select coalesce(jsonb_agg(to_jsonb(w) order by w.alert_time desc), '[]'::jsonb)
      from (
        select id, symbol, market_type, status, alert_time, alert_price, entry_tf, m5_status, m5_sent, m15_status, m15_sent, m4h_sent, m1d_sent, end_reason, ended_at
        from alert_watches
        order by coalesce(alert_time, created_at) desc
        limit 30
      ) w
    )
  );
$$;

revoke all on function public.dashboard_live() from public;
grant execute on function public.dashboard_live() to anon, authenticated;
