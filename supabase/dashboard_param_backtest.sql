-- Parameter replay of the 1m quiet-surge rule on stored spot 1m klines + 5m OI.
-- Anon cannot read base tables. Security definer, read only.
-- OI has no 1m history: the z/1h gates use the completed 5m bar and are
-- applied on the last minute of that 5m bar (no lookahead into the bar).

create or replace function public.dashboard_param_backtest(
  surge_mult double precision default 10,
  quiet_mult double precision default 3,
  min_bar_return double precision default 0.01,
  max_prior_24h double precision default 0.08,
  oi_z_min double precision default 1,
  oi_1h_bars integer default 12,
  oi_z_lookback integer default 2016,
  oi_z_min_periods integer default 600,
  baseline_bars integer default 8640,
  quiet_1h_bars integer default 4,
  quiet_4h_bars integer default 16,
  require_prior_24h boolean default true,
  symbol text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_surge double precision := least(100, greatest(1, coalesce(surge_mult, 10)));
  v_quiet double precision := least(50, greatest(0.1, coalesce(quiet_mult, 3)));
  v_min_ret double precision := least(1, greatest(-0.5, coalesce(min_bar_return, 0.01)));
  v_max_24h double precision := least(5, greatest(-0.5, coalesce(max_prior_24h, 0.08)));
  v_zmin double precision := least(10, greatest(-5, coalesce(oi_z_min, 1)));
  v_oi_1h integer := least(48, greatest(1, coalesce(oi_1h_bars, 12)));
  v_lookback integer := least(3000, greatest(20, coalesce(oi_z_lookback, 2016)));
  v_min_p integer := least(2000, greatest(10, coalesce(oi_z_min_periods, 600)));
  v_base integer := least(8640, greatest(4, coalesce(baseline_bars, 8640)));
  v_q1 integer := least(96, greatest(1, coalesce(quiet_1h_bars, 4)));
  v_q4 integer := least(96, greatest(1, coalesce(quiet_4h_bars, 16)));
  v_need24 boolean := coalesce(require_prior_24h, true);
  v_symbol text := nullif(upper(btrim(coalesce(symbol, ''))), '');
  v_k_min timestamptz;
  v_k_max timestamptz;
  v_k_rows bigint;
  v_k_syms bigint;
  v_oi_min timestamptz;
  v_oi_max timestamptz;
  v_oi_rows bigint;
  v_oi_syms bigint;
  v_max15 integer;
  v_maxoi integer;
  v_reason text;
  v_price bigint := 0;
  v_signals jsonb := '[]'::jsonb;
begin
  if v_q4 < v_q1 then
    v_q4 := v_q1;
  end if;
  if v_min_p > v_lookback then
    v_min_p := v_lookback;
  end if;

  select min(k.open_time), max(k.open_time), count(*), count(distinct k.symbol)
    into v_k_min, v_k_max, v_k_rows, v_k_syms
  from klines_1m k
  where market_type = 'spot' and is_closed
    and (v_symbol is null or k.symbol = v_symbol);

  select min(o.open_time), max(o.open_time), count(*), count(distinct o.symbol)
    into v_oi_min, v_oi_max, v_oi_rows, v_oi_syms
  from oi_5m o
  where v_symbol is null or o.symbol = v_symbol;

  select coalesce(max(n), 0) into v_max15
  from (
    select count(*)::int as n
    from (
      select k15.symbol,
             to_timestamp(floor(extract(epoch from k15.open_time) / 900) * 900) as bucket,
             count(*) as minutes
      from klines_1m k15
      where k15.market_type = 'spot' and k15.is_closed
        and (v_symbol is null or k15.symbol = v_symbol)
      group by 1, 2
    ) b
    where minutes >= 15
    group by b.symbol
  ) s;

  select coalesce(max(n), 0) into v_maxoi
  from (
    select count(*)::int as n from oi_5m o
    where v_symbol is null or o.symbol = v_symbol
    group by o.symbol
  ) s;

  if v_max15 < v_base then
    v_reason := format('15 分已完成棒最多 %s 根，少於基準 %s 根，沒有訊號。把「基準 15 分根數」調小，或等 1 分 K 累積。', v_max15, v_base);
  elsif v_need24 and v_max15 < 97 then
    v_reason := format('要套用前 24h 上限至少需要 97 根已完成 15 分，目前最多 %s 根。取消「套用前 24h」或等資料補上。', v_max15);
  elsif coalesce(v_oi_rows, 0) = 0 then
    v_reason := 'oi_5m 還沒有資料。Worker 暖機寫入後再跑；價格條件先不算進清單。';
  else
    with m1 as (
      select
        k.symbol,
        k.open_time,
        k.close,
        k.close * k.volume as quote,
        to_timestamp(floor(extract(epoch from k.open_time) / 900) * 900) as b15,
        lag(k.close) over (partition by k.symbol order by k.open_time) as prev_1m,
        lag(k.open_time) over (partition by k.symbol order by k.open_time) as prev_1m_t
      from klines_1m k
      where k.market_type = 'spot'
        and k.is_closed
        and k.close > 0
        and k.volume >= 0
        and (v_symbol is null or k.symbol = v_symbol)
        and mod(extract(epoch from k.open_time)::bigint, 300) = 240
    ),
    comp as (
      select
        symbol,
        bucket,
        close,
        quote,
        row_number() over (partition by symbol order by bucket) as rn,
        sum(quote) over (partition by symbol order by bucket) as q_cum
      from (
        select
          k.symbol,
          to_timestamp(floor(extract(epoch from k.open_time) / 900) * 900) as bucket,
          (array_agg(k.close order by k.open_time desc))[1] as close,
          sum(k.close * k.volume) as quote,
          count(*) as minutes
        from klines_1m k
        where k.market_type = 'spot' and k.is_closed
          and (v_symbol is null or k.symbol = v_symbol)
        group by 1, 2
      ) raw
      where minutes >= 15 and quote > 0 and close > 0
    ),
    fut_map as (
      select distinct on (r.symbol)
        r.symbol,
        coalesce(nullif(r.params->>'futures_symbol', ''), r.symbol) as fut
      from alert_rules r
      where r.rule_type = 'quiet_surge_early'
      order by r.symbol, r.enabled desc, r.id desc
    ),
    priced as (
      select
        m.symbol,
        m.open_time,
        m.open_time + interval '1 minute' as bar_close,
        m.close,
        m.quote,
        last.close as prev_15_close,
        (m.close / last.close - 1) as ret_bar,
        case when c24.close is null then null else last.close / c24.close - 1 end as prior_24h,
        m.quote / (base_mean / 15.0) as multiple,
        med1 / base_mean as quiet_1h,
        med4 / base_mean as quiet_4h,
        coalesce(fm.fut, m.symbol) as fut,
        to_timestamp(floor(extract(epoch from m.open_time) / 300) * 300) as bucket5
      from m1 m
      join lateral (
        select c.*
        from comp c
        where c.symbol = m.symbol and c.bucket < m.b15
        order by c.bucket desc
        limit 1
      ) last on true
      left join comp prev
        on prev.symbol = last.symbol and prev.rn = last.rn - v_base
      left join comp c24
        on c24.symbol = last.symbol and c24.rn = last.rn - 96
      left join fut_map fm on fm.symbol = m.symbol
      cross join lateral (
        select case
          when last.rn < v_base then null
          when prev.q_cum is null then last.q_cum / v_base
          else (last.q_cum - prev.q_cum) / v_base
        end as base_mean
      ) b
      cross join lateral (
        select
          (
            select percentile_cont(0.5) within group (order by q.quote)
            from comp q
            where q.symbol = last.symbol and q.rn <= last.rn and q.rn > last.rn - v_q1
          ) as med1,
          (
            select percentile_cont(0.5) within group (order by q.quote)
            from comp q
            where q.symbol = last.symbol and q.rn <= last.rn and q.rn > last.rn - v_q4
          ) as med4
      ) med
      where last.rn >= greatest(v_base, v_q4)
        and base_mean > 0
        and (not v_need24 or (c24.close is not null and c24.close > 0))
        and m.quote / (base_mean / 15.0) >= v_surge
        and med1 / base_mean <= v_quiet
        and med4 / base_mean <= v_quiet
        and (m.close / last.close - 1) >= v_min_ret
        and (
          m.prev_1m_t is distinct from m.open_time - interval '1 minute'
          or m.close >= m.prev_1m
        )
        and (
          not v_need24
          or (last.close / c24.close - 1) <= v_max_24h
        )
    ),
    scored as (
      select
        p.*,
        (z.end_oi / z.start_oi - 1) as oi_5m,
        (z.end_oi / z.prev_1h - 1) as oi_1h,
        case
          when z.n >= v_min_p and z.sd > 1e-12
            then ((z.end_oi / z.start_oi - 1) - z.mu) / z.sd
        end as oi_z
      from priced p
      join lateral (
        select
          (select o.sum_open_interest from oi_5m o
            where o.symbol = p.fut and o.open_time = p.bucket5) as start_oi,
          (select o.sum_open_interest from oi_5m o
            where o.symbol = p.fut and o.open_time = p.bucket5 + interval '5 minutes') as end_oi,
          (select o.sum_open_interest from oi_5m o
            where o.symbol = p.fut
              and o.open_time = p.bucket5 + interval '5 minutes' - (v_oi_1h * interval '5 minutes')
          ) as prev_1h,
          s.mu, s.sd, s.n
        from (
          select avg(x.pct) as mu, stddev_pop(x.pct) as sd, count(*) as n
          from (
            select c.pct
            from (
              select
                o.open_time,
                case
                  when lag(o.open_time) over (order by o.open_time) = o.open_time - interval '5 minutes'
                   and lag(o.sum_open_interest) over (order by o.open_time) > 0
                  then o.sum_open_interest / lag(o.sum_open_interest) over (order by o.open_time) - 1
                end as pct
              from oi_5m o
              where o.symbol = p.fut
            ) c
            where c.pct is not null
              and c.open_time < p.bucket5 + interval '5 minutes'
            order by c.open_time desc
            limit v_lookback
          ) x
        ) s
      ) z on true
      where z.start_oi > 0
        and z.end_oi > 0
        and z.prev_1h > 0
        and (z.end_oi / z.prev_1h - 1) > 0
        and z.n >= v_min_p
        and z.sd > 1e-12
        and ((z.end_oi / z.start_oi - 1) - z.mu) / z.sd >= v_zmin
    )
    select
      (select count(*) from priced),
      coalesce((
        select jsonb_agg(row_to_json(t)::jsonb order by t.bar_close desc)
        from (
          select
            symbol,
            bar_close,
            close,
            multiple,
            quiet_1h,
            quiet_4h,
            ret_bar,
            prior_24h,
            oi_1h,
            oi_z,
            oi_5m
          from scored
          order by bar_close desc
          limit 300
        ) t
      ), '[]'::jsonb)
    into v_price, v_signals;
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'params', jsonb_build_object(
      'surge_mult', v_surge,
      'quiet_mult', v_quiet,
      'min_bar_return', v_min_ret,
      'max_prior_24h', v_max_24h,
      'oi_z_min', v_zmin,
      'oi_1h_bars', v_oi_1h,
      'oi_z_lookback', v_lookback,
      'oi_z_min_periods', v_min_p,
      'baseline_bars', v_base,
      'quiet_1h_bars', v_q1,
      'quiet_4h_bars', v_q4,
      'require_prior_24h', v_need24,
      'symbol', v_symbol
    ),
    'coverage', jsonb_build_object(
      'kline_min', v_k_min,
      'kline_max', v_k_max,
      'kline_rows', v_k_rows,
      'kline_symbols', v_k_syms,
      'oi_min', v_oi_min,
      'oi_max', v_oi_max,
      'oi_rows', v_oi_rows,
      'oi_symbols', v_oi_syms,
      'max_completed_15m', v_max15,
      'max_oi_points', v_maxoi
    ),
    'price_hits', v_price,
    'signal_count', coalesce(jsonb_array_length(v_signals), 0),
    'reason', v_reason,
    'signals', coalesce(v_signals, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.dashboard_param_backtest(
  double precision, double precision, double precision, double precision,
  double precision, integer, integer, integer, integer, integer, integer,
  boolean, text
) from public;

grant execute on function public.dashboard_param_backtest(
  double precision, double precision, double precision, double precision,
  double precision, integer, integer, integer, integer, integer, integer,
  boolean, text
) to anon, authenticated;
