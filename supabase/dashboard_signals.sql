-- Read-only quiet_surge_early log for the public signals page.
-- Anon cannot select base tables. Security definer returns operational fields only.
-- Applied on etdgcixvrjylxpkucxsd as migration dashboard_signals.
-- Does not change worker writes.

create or replace function public.dashboard_signals(since timestamptz default '2026-09-01 00:00:00+08')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with entries as (
    select
      a.id,
      a.symbol,
      a.triggered_at,
      a.telegram_sent,
      a.payload,
      w.status as watch_status,
      w.m15_status,
      w.m4h_sent,
      w.m1d_sent,
      w.end_reason,
      w.alert_time
    from alerts a
    left join lateral (
      select status, m15_status, m4h_sent, m1d_sent, end_reason, alert_time
      from alert_watches
      where alert_id = a.id
      order by id desc
      limit 1
    ) w on true
    where a.alert_type = 'quiet_surge_early'
      and a.triggered_at >= since
  ),
  follows as (
    select distinct on ((payload->>'entry_alert_id')::bigint, payload->>'kind')
      (payload->>'entry_alert_id')::bigint as entry_id,
      payload->>'kind' as kind,
      nullif(payload->>'ret', '')::double precision as ret
    from alerts
    where alert_type = 'quiet_surge_watch'
      and payload ? 'entry_alert_id'
      and (payload->>'entry_alert_id') ~ '^[0-9]+$'
    order by (payload->>'entry_alert_id')::bigint, payload->>'kind', triggered_at desc
  )
  select jsonb_build_object(
    'generated_at', now(),
    'since', since,
    'entries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'symbol', e.symbol,
          'triggered_at', e.triggered_at,
          'bar_close', coalesce(
            e.alert_time,
            case
              when e.payload->>'bar_15m_open' is not null
                then (e.payload->>'bar_15m_open')::timestamptz + interval '15 minutes'
              else e.triggered_at
            end
          ),
          'close', nullif(e.payload->>'close', '')::double precision,
          'multiple', nullif(e.payload->>'xmean', '')::double precision,
          'quiet_1h', nullif(e.payload->>'med_1h_x', '')::double precision,
          'quiet_4h', nullif(e.payload->>'med_4h_x', '')::double precision,
          'ret_bar', nullif(e.payload->>'bar_return', '')::double precision,
          'prior_24h', nullif(e.payload->>'prior_24h_return', '')::double precision,
          'oi_1h', nullif(e.payload->>'oi_1h_pct', '')::double precision,
          'oi_z', nullif(e.payload->>'oi_z7', '')::double precision,
          'telegram_sent', e.telegram_sent,
          'watch_status', e.watch_status,
          'm15_status', e.m15_status,
          'm4h_sent', e.m4h_sent,
          'm1d_sent', e.m1d_sent,
          'end_reason', e.end_reason,
          'ret_15m', (select f.ret from follows f where f.entry_id = e.id and f.kind = 'm15' limit 1),
          'ret_4h', (select f.ret from follows f where f.entry_id = e.id and f.kind = 'm4h' limit 1),
          'ret_1d', (select f.ret from follows f where f.entry_id = e.id and f.kind = 'm1d' limit 1)
        )
        order by e.triggered_at desc
      )
      from entries e
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.dashboard_signals(timestamptz) from public;
grant execute on function public.dashboard_signals(timestamptz) to anon, authenticated;
