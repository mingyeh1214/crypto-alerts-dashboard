-- Sent P12 alerts for the signals page, plus unsent keys so backfill-only rows can be dropped.
-- Anon cannot select alerts. Security definer. Does not change worker writes.
-- Applied on etdgcixvrjylxpkucxsd as migration dashboard_p12_feed.

create or replace function public.dashboard_p12_feed()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'sent', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'symbol', a.symbol,
          'triggered_at', a.triggered_at,
          'telegram_sent', true,
          'open_ms', nullif(a.payload->>'open_ms', '')::bigint,
          'entry', nullif(a.payload->>'close', '')::double precision,
          'volume', nullif(a.payload->>'volume', '')::double precision,
          'quote_usdt', nullif(a.payload->>'quote_usdt', '')::double precision,
          'z', nullif(a.payload->>'z', '')::double precision,
          'turn', nullif(a.payload->>'turn', '')::double precision,
          'atr15_pct', nullif(a.payload->>'atr15_pct', '')::double precision,
          'funding', nullif(a.payload->>'funding', '')::double precision,
          'oi_z', nullif(a.payload->>'oi_z', '')::double precision,
          'oi_1h', nullif(a.payload->>'oi_1h', '')::double precision,
          'prior24', nullif(a.payload->>'prior24', '')::double precision
        )
        order by a.triggered_at desc
      )
      from alerts a
      where a.alert_type = 'p12_z278'
        and a.telegram_sent
    ), '[]'::jsonb),
    'unsent', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'symbol', a.symbol,
          'open_ms', nullif(a.payload->>'open_ms', '')::bigint
        )
        order by a.triggered_at desc
      )
      from alerts a
      where a.alert_type = 'p12_z278'
        and not coalesce(a.telegram_sent, false)
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.dashboard_p12_feed() from public;
grant execute on function public.dashboard_p12_feed() to anon, authenticated;
