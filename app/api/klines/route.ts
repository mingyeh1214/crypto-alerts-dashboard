import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERVALS: Record<string, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

const START = Date.parse("2026-09-01T00:00:00+08:00");
const SPOT_HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"];
const FUT_HOSTS = ["https://www.binance.com", "https://fapi.binance.com"];

type Market = "spot" | "futures" | "premium";
/** tb = taker buy base volume (coins); volume is in coins as well. */
type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number; tb: number };

const PATHS: Record<Market, string> = {
  spot: "/api/v3/klines",
  futures: "/fapi/v1/klines",
  premium: "/fapi/v1/premiumIndexKlines",
};

async function fetchChunk(
  symbol: string,
  interval: string,
  start: number,
  end: number,
  fresh = false,
  market: Market = "spot",
  limit = 1000,
): Promise<Candle[]> {
  let lastErr = "binance unavailable";
  const hosts = market === "spot" ? SPOT_HOSTS : FUT_HOSTS;
  for (const host of hosts) {
    const url = new URL(`${host}${PATHS[market]}`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("startTime", String(start));
    url.searchParams.set("endTime", String(end));
    // Binance weight scales with limit (<100: 1, <500: 2, <=1000: 5), so ask only for what we need.
    url.searchParams.set("limit", String(Math.max(1, Math.min(1000, limit))));
    let res: Response;
    try {
      res = await fetch(url, fresh ? { cache: "no-store" } : { next: { revalidate: 3600 } });
    } catch (e) {
      lastErr = `${host} ${e instanceof Error ? e.message : "fetch failed"}`;
      continue;
    }
    if (!res.ok) {
      lastErr = `${host} ${res.status}`;
      continue;
    }
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows)) {
      lastErr = `${host} bad payload`;
      continue;
    }
    return rows.map((r) => {
      const row = r as (string | number)[];
      return {
        time: Math.floor(Number(row[0]) / 1000),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]) || 0,
        tb: Number(row[9]) || 0,
      };
    });
  }
  throw new Error(lastErr);
}

const clean = (xs: Candle[]) => xs.filter((c) => Number.isFinite(c.open) && c.time > 0).sort((a, b) => a.time - b.time);

export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("symbol") || "").trim();
  // ASCII tickers are uppercased; Chinese spot names (e.g. 币安人生USDT) stay as listed.
  const symbol = /^[\x00-\x7F]+$/.test(raw) ? raw.toUpperCase() : raw;
  const interval = req.nextUrl.searchParams.get("interval") || "15m";
  const m = req.nextUrl.searchParams.get("market");
  const market: Market = m === "futures" ? "futures" : m === "premium" ? "premium" : "spot";
  const step = INTERVALS[interval];
  if (!/^[\p{L}\p{N}]{2,32}$/u.test(symbol) || !symbol.endsWith("USDT") || !step) {
    return NextResponse.json({ error: "參數不正確" }, { status: 400 });
  }
  const end = Date.now();
  const recentRaw = req.nextUrl.searchParams.get("recent");
  const fromRaw = req.nextUrl.searchParams.get("from");
  const toRaw = req.nextUrl.searchParams.get("to");
  try {
    if (fromRaw != null && toRaw != null) {
      // Window mode (at most 1000 bars). `to` may lie in the future so the URL stays
      // stable for a whole bar and the CDN can share one response between viewers.
      const from = Math.floor(Number(fromRaw));
      const to = Math.min(end, Math.floor(Number(toRaw)));
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || (to - from) / step > 1001) {
        return NextResponse.json({ error: "參數不正確" }, { status: 400 });
      }
      const live = to >= end - 2 * step;
      const need = Math.floor((to - from) / step) + 2;
      const candles = clean(await fetchChunk(symbol, interval, from, to, live, market, need));
      return NextResponse.json(
        { symbol, interval, candles },
        {
          headers: {
            "Cache-Control": live
              ? "public, s-maxage=10, stale-while-revalidate=20"
              : "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
          },
        },
      );
    }
    if (recentRaw != null) {
      const limit = Math.min(1000, Math.max(2, Math.floor(Number(recentRaw)) || 120));
      // Tight window so Binance's limit does not drop the forming candle.
      const start = end - (limit - 1) * step;
      const candles = clean(await fetchChunk(symbol, interval, start, end, true, market, limit));
      return NextResponse.json({ symbol, interval, candles }, { headers: { "Cache-Control": "no-store" } });
    }
    const span = 1000 * step;
    const chunks: [number, number][] = [];
    for (let t = START; t < end; t += span) chunks.push([t, Math.min(end, t + span - 1)]);
    const parts = await Promise.all(chunks.map(([a, b]) => fetchChunk(symbol, interval, a, b, false, market)));
    const byTime = new Map<number, Candle>();
    for (const part of parts) for (const c of part) if (Number.isFinite(c.open) && c.time > 0) byTime.set(c.time, c);
    const candles = [...byTime.values()].sort((a, b) => a.time - b.time);
    return NextResponse.json(
      { symbol, interval, candles },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "kline failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
