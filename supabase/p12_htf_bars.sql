-- Higher-timeframe frames for the at-signal location note.
-- Does not change whether P12 fires. service_role only.

drop function if exists public.p12_htf_bars(text, timestamptz);

create or replace function public.p12_htf_bars(
  p_symbol text,
  p_asof timestamptz,
  p_market text default 'spot'
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      p_asof as asof,
      p_asof - interval '1 day' as ago_1d,
      p_asof - interval '7 days' as ago_7d,
      p_asof - interval '10 days' as ago_10d,
      p_asof - interval '20 days' as ago_20d,
      p_asof - interval '80 days' as ago_80d
  ),
  mkt as (
    select case
      when lower(btrim(coalesce(p_market, 'spot'))) = 'futures' then 'futures'
      else 'spot'
    end as market_type
  ),
  base as (
    select k.open_time, k.high, k.low, k.close
    from public.klines_1m k
    cross join bounds b
    cross join mkt
    where k.symbol = p_symbol
      and k.market_type = mkt.market_type
      and k.is_closed
      and k.open_time <= b.asof
      and k.open_time >= b.ago_80d
  ),
  daily as (
    select
      (date_trunc('day', open_time at time zone 'Asia/Taipei') at time zone 'Asia/Taipei') as bucket,
      max(high) as high,
      min(low) as low,
      (array_agg(close order by open_time desc))[1] as close
    from base
    group by 1
  ),
  h4 as (
    select
      floor(extract(epoch from open_time) / 14400) * 14400 as bucket,
      max(high) as high,
      min(low) as low,
      (array_agg(close order by open_time desc))[1] as close
    from base
    group by 1
  )
  select jsonb_build_object(
    'daily', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          't', (extract(epoch from bucket) * 1000)::bigint,
          'high', high,
          'low', low,
          'close', close
        )
        order by bucket
      )
      from daily
    ), '[]'::jsonb),
    'h4', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          't', (bucket * 1000)::bigint,
          'high', high,
          'low', low,
          'close', close
        )
        order by bucket
      )
      from h4
    ), '[]'::jsonb),
    'close_1d', (
      select k.close
      from public.klines_1m k
      cross join bounds b
      where k.symbol = p_symbol and k.market_type = (select market_type from mkt) and k.is_closed
        and k.open_time <= b.ago_1d
      order by k.open_time desc
      limit 1
    ),
    'close_7d', (
      select k.close
      from public.klines_1m k
      cross join bounds b
      where k.symbol = p_symbol and k.market_type = (select market_type from mkt) and k.is_closed
        and k.open_time <= b.ago_7d
      order by k.open_time desc
      limit 1
    ),
    'hi_20d', (
      select max(k.high)
      from public.klines_1m k
      cross join bounds b
      where k.symbol = p_symbol and k.market_type = (select market_type from mkt) and k.is_closed
        and k.open_time <= b.asof
        and k.open_time >= b.ago_20d
    ),
    'lo_20d', (
      select min(k.low)
      from public.klines_1m k
      cross join bounds b
      where k.symbol = p_symbol and k.market_type = (select market_type from mkt) and k.is_closed
        and k.open_time <= b.asof
        and k.open_time >= b.ago_20d
    ),
    'prior_hi_10d', (
      select max(k.high)
      from public.klines_1m k
      cross join bounds b
      where k.symbol = p_symbol and k.market_type = (select market_type from mkt) and k.is_closed
        and k.open_time < b.ago_1d
        and k.open_time >= b.ago_10d
    ),
    'yest_close', (
      select k.close
      from public.klines_1m k
      cross join bounds b
      where k.symbol = p_symbol and k.market_type = (select market_type from mkt) and k.is_closed
        and k.open_time <= b.ago_1d
      order by k.open_time desc
      limit 1
    )
  );
$$;

revoke all on function public.p12_htf_bars(text, timestamptz, text) from public;
grant execute on function public.p12_htf_bars(text, timestamptz, text) to service_role;
