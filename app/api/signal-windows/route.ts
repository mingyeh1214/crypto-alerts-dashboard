import { NextRequest, NextResponse } from "next/server";
import cohortE from "@/lib/cohort-e.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"];
const COHORT = cohortE as number[];

type Bar = { t: number; h: number; l: number };

type Item = { id: number; pair: string; open_ms: number; entry: number };

function tp(ms: number): string {
  const d = new Date(ms + 8 * 3600_000);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

async function fetchBars(symbol: string, start: number, end: number): Promise<Bar[]> {
  let lastErr = "binance unavailable";
  for (const host of HOSTS) {
    const url = new URL(`${host}/api/v3/klines`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", "1m");
    url.searchParams.set("startTime", String(start));
    url.searchParams.set("endTime", String(end));
    url.searchParams.set("limit", "1000");
    const res = await fetch(url, { cache: "no-store" });
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
      return { t: Number(row[0]), h: Number(row[2]), l: Number(row[3]) };
    });
  }
  throw new Error(lastErr);
}

function extreme(bars: Bar[], entry: number, n: number, now: number) {
  const got = bars.slice(0, n);
  if (!got.length || !(entry > 0)) return null;
  let upI = 0;
  let dnI = 0;
  for (let i = 1; i < got.length; i++) {
    if (got[i].h > got[upI].h) upI = i;
    if (got[i].l < got[dnI].l) dnI = i;
  }
  const last = got[got.length - 1];
  return {
    up_px: got[upI].h,
    up_t: tp(got[upI].t),
    up: got[upI].h / entry - 1,
    dn_px: got[dnI].l,
    dn_t: tp(got[dnI].t),
    dn: got[dnI].l / entry - 1,
    n: got.length,
    full: got.length >= n && last.t + 60_000 <= now,
  };
}

function scoreOf(win: Record<string, { up: number; dn: number } | null>) {
  const order = ["m15", "h1", "h4", "d1"] as const;
  const weights = { m15: 0.15, h1: 0.35, h4: 0.3, d1: 0.2 };
  if (order.every((k) => !win[k])) return { score: null, score_base: null, E: null, red: 0 };
  let E = 0;
  for (const k of order) {
    const cell = win[k];
    if (!cell) continue;
    E += weights[k] * (cell.up + cell.dn) * 100;
  }
  E = Math.round(E * 10000) / 10000;
  let rank = 0;
  for (const x of COHORT) {
    if (x > E) rank += 1;
    else break;
  }
  const n = COHORT.length || 1;
  let base = 10 - Math.min(9, Math.floor((rank * 10) / n));
  const dns = order.map((k) => win[k]?.dn).filter((d): d is number => d != null);
  const red15 = dns.some((d) => d <= -0.15);
  const red10 = dns.some((d) => d <= -0.1);
  let score = base;
  if (red15) score = 1;
  else if (red10) score = Math.min(score, 3);
  return { score, score_base: base, E, red: red10 ? 1 : 0 };
}

async function one(item: Item, now: number) {
  const start = item.open_ms + 60_000;
  const end = Math.min(now, item.open_ms + 1440 * 60_000);
  const bars: Bar[] = [];
  if (end > start) {
    const firstEnd = Math.min(end, start + 999 * 60_000);
    bars.push(...(await fetchBars(item.pair, start, firstEnd)));
    if (bars.length >= 1000 && end > firstEnd + 60_000) {
      const more = await fetchBars(item.pair, firstEnd + 60_000, end);
      const seen = new Set(bars.map((b) => b.t));
      for (const b of more) if (!seen.has(b.t)) bars.push(b);
    }
  }
  bars.sort((a, b) => a.t - b.t);
  const after = bars.filter((b) => b.t > item.open_ms);
  const win = {
    m15: extreme(after, item.entry, 15, now),
    h1: extreme(after, item.entry, 60, now),
    h4: extreme(after, item.entry, 240, now),
    d1: extreme(after, item.entry, 1440, now),
  };
  const scored = scoreOf(win);
  const pct = (cell: { up: number; dn: number } | null) =>
    cell ? { up: Math.round(cell.up * 100000) / 1000, dn: Math.round(cell.dn * 100000) / 1000 } : { up: null, dn: null };
  return {
    id: item.id,
    win,
    ...scored,
    h1_up: pct(win.h1).up,
    h1_dn: pct(win.h1).dn,
    h4_up: pct(win.h4).up,
    h4_dn: pct(win.h4).dn,
    d1_up: pct(win.d1).up,
    d1_dn: pct(win.d1).dn,
  };
}

export async function POST(req: NextRequest) {
  let body: { items?: Item[] };
  try {
    body = (await req.json()) as { items?: Item[] };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const items = (body.items ?? []).slice(0, 40).filter((it) => {
    return (
      it &&
      Number.isFinite(it.open_ms) &&
      Number.isFinite(it.entry) &&
      it.entry > 0 &&
      typeof it.pair === "string" &&
      /^[\p{L}\p{N}]{2,32}$/u.test(it.pair) &&
      it.pair.toUpperCase().endsWith("USDT")
    );
  });
  const now = Date.now();
  try {
    const rows = [];
    for (const it of items) rows.push(await one({ ...it, pair: it.pair.toUpperCase() }, now));
    return NextResponse.json({ rows, cohort_n: COHORT.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "windows failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
