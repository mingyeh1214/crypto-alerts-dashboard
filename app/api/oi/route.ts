import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Binance open-interest history (last ~30 days only). The API timestamp is the
// period close, so we return time = period open to line up with candles.
const HOSTS = ["https://fapi.binance.com", "https://www.binance.com"];
const PERIODS: Record<string, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 3600_000,
  "4h": 4 * 3600_000,
  "1d": 86_400_000,
};
const MAX_PAGES = 3;

async function page(symbol: string, period: string, start: number, end: number, fresh: boolean) {
  let lastErr = "binance unavailable";
  for (const host of HOSTS) {
    const url = new URL(`${host}/futures/data/openInterestHist`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("period", period);
    url.searchParams.set("startTime", String(start));
    url.searchParams.set("endTime", String(end));
    url.searchParams.set("limit", "500");
    try {
      const res = await fetch(url, fresh ? { cache: "no-store" } : { next: { revalidate: 3600 } });
      if (!res.ok) {
        lastErr = `${host} ${res.status}`;
        continue;
      }
      const rows = (await res.json()) as { timestamp: number; sumOpenInterest: string }[];
      if (Array.isArray(rows)) return rows;
      lastErr = `${host} bad payload`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastErr);
}

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") || "").trim().toUpperCase();
  const period = req.nextUrl.searchParams.get("period") || "5m";
  const step = PERIODS[period];
  const now = Date.now();
  let from = Math.floor(Number(req.nextUrl.searchParams.get("from")));
  const to = Math.min(now, Math.floor(Number(req.nextUrl.searchParams.get("to"))));
  if (!/^[A-Z0-9]{2,32}USDT$/.test(symbol) || !step || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return NextResponse.json({ error: "參數不正確" }, { status: 400 });
  }
  from = Math.max(from, now - 29 * 86_400_000, to - MAX_PAGES * 500 * step);
  const live = to >= now - 2 * step;
  const headers = {
    "Cache-Control": live
      ? "public, s-maxage=60, stale-while-revalidate=60"
      : "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
  };
  if (from >= to) return NextResponse.json({ symbol, points: [] }, { headers });
  try {
    const out = new Map<number, number>();
    // Page backwards from `to` (Binance returns the newest `limit` rows of the range).
    let hi = to + step;
    for (let i = 0; i < MAX_PAGES && hi > from + step; i++) {
      const rows = await page(symbol, period, from + step, hi, live && i === 0);
      if (!rows.length) break;
      for (const r of rows) {
        const v = Number(r.sumOpenInterest);
        if (Number.isFinite(v)) out.set(Math.floor((Number(r.timestamp) - step) / 1000), v);
      }
      const oldest = Math.min(...rows.map((r) => Number(r.timestamp)));
      if (rows.length < 500) break;
      hi = oldest - 1;
    }
    const points = [...out.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
    return NextResponse.json({ symbol, period, points }, { headers });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "oi failed" }, { status: 502 });
  }
}
