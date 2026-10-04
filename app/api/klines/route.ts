import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERVALS: Record<string, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};

const START = Date.parse("2026-09-01T00:00:00+08:00");
const HOSTS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
];

type Candle = { time: number; open: number; high: number; low: number; close: number };

async function fetchChunk(symbol: string, interval: string, start: number, end: number): Promise<Candle[]> {
  let lastErr = "binance unavailable";
  for (const host of HOSTS) {
    const url = new URL(`${host}/api/v3/klines`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("startTime", String(start));
    url.searchParams.set("endTime", String(end));
    url.searchParams.set("limit", "1000");
    const res = await fetch(url, { next: { revalidate: 300 } });
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
      };
    });
  }
  throw new Error(lastErr);
}

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") || "").toUpperCase();
  const interval = req.nextUrl.searchParams.get("interval") || "15m";
  const step = INTERVALS[interval];
  if (!/^[A-Z0-9]{2,30}$/.test(symbol) || !symbol.endsWith("USDT") || !step) {
    return NextResponse.json({ error: "參數不正確" }, { status: 400 });
  }
  const end = Date.now();
  const span = 1000 * step;
  const chunks: [number, number][] = [];
  for (let t = START; t < end; t += span) {
    chunks.push([t, Math.min(end, t + span - 1)]);
  }
  try {
    const parts = await Promise.all(chunks.map(([a, b]) => fetchChunk(symbol, interval, a, b)));
    const byTime = new Map<number, Candle>();
    for (const part of parts) {
      for (const c of part) {
        if (Number.isFinite(c.open) && c.time > 0) byTime.set(c.time, c);
      }
    }
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
