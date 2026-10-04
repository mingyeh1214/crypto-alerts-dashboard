-- Read-only snapshot for the public dashboard.
-- Anon cannot select base tables (RLS on, no policies). This function is security definer
-- and returns only operational fields. Service role used by crypto-alerts-worker is unchanged.
-- Applied to project etdgcixvrjylxpkucxsd. recent_alerts is Telegram-sent P12 only.

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
    'rules_p12_enabled', (select count(*) from alert_rules where enabled and rule_type = 'p12_z278'),
    'rules_quiet_surge_enabled', 0,
    'rules_enabled_other', (select count(*) from alert_rules where enabled and rule_type <> 'p12_z278'),
    'quiet_surge_symbols', '[]'::jsonb,
    'watches_active', 0,
    'watches_by_status', '{}'::jsonb,
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
        where alert_type = 'p12_z278'
          and telegram_sent
        order by triggered_at desc
        limit 30
      ) a
    ),
    'recent_watches', '[]'::jsonb
  );
$$;

revoke all on function public.dashboard_live() from public;
grant execute on function public.dashboard_live() to anon, authenticated;
