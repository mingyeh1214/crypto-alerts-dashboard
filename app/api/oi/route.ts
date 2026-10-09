import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Binance 5m open-interest history (last ~30 days only). The API timestamp is the
// bar close, so we return time = bar open to line up with the 5m candles.
const HOSTS = ["https://fapi.binance.com", "https://www.binance.com"];
const M5 = 5 * 60_000;

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") || "").trim().toUpperCase();
  const from = Math.floor(Number(req.nextUrl.searchParams.get("from")));
  const to = Math.min(Date.now(), Math.floor(Number(req.nextUrl.searchParams.get("to"))));
  if (!/^[A-Z0-9]{2,32}USDT$/.test(symbol) || !Number.isFinite(from) || !Number.isFinite(to) || to <= from || (to - from) / M5 > 500) {
    return NextResponse.json({ error: "參數不正確" }, { status: 400 });
  }
  if (from < Date.now() - 29 * 86_400_000) return NextResponse.json({ symbol, points: [] });
  let lastErr = "binance unavailable";
  for (const host of HOSTS) {
    const url = new URL(`${host}/futures/data/openInterestHist`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("period", "5m");
    url.searchParams.set("startTime", String(from + M5));
    url.searchParams.set("endTime", String(to + M5));
    url.searchParams.set("limit", "500");
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        lastErr = `${host} ${res.status}`;
        continue;
      }
      const rows = (await res.json()) as { timestamp: number; sumOpenInterest: string }[];
      if (!Array.isArray(rows)) {
        lastErr = `${host} bad payload`;
        continue;
      }
      const points = rows
        .map((r) => ({ time: Math.floor((Number(r.timestamp) - M5) / 1000), value: Number(r.sumOpenInterest) }))
        .filter((p) => Number.isFinite(p.value))
        .sort((a, b) => a.time - b.time);
      return NextResponse.json({ symbol, points });
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  return NextResponse.json({ error: lastErr }, { status: 502 });
}
