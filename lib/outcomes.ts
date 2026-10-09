/**
 * Post-signal outcomes, computed the same way as the overall backtest:
 * entry = close of the futures 5m bar that ends at the alert time (burst close + 15 min);
 * window = the next 12 (1h) / 48 (4h) 5m bars; change = last close, max rise / fall = window high / low.
 */
export type Outcome = {
  a1: number | null; u1: number | null; d1: number | null; f1: boolean;
  a4: number | null; u4: number | null; d4: number | null; f4: boolean;
};

export const M5 = 5 * 60_000;
export const ALERT_DELAY = 15 * 60_000;
export const alertMsOf = (burstCloseMs: number) => burstCloseMs + ALERT_DELAY;

export function fromTriples(o1: (number | null)[] | null | undefined, o4: (number | null)[] | null | undefined): Outcome | undefined {
  if (!o1 && !o4) return undefined;
  return {
    a1: o1?.[0] ?? null, u1: o1?.[1] ?? null, d1: o1?.[2] ?? null, f1: !!o1,
    a4: o4?.[0] ?? null, u4: o4?.[1] ?? null, d4: o4?.[2] ?? null, f4: !!o4,
  };
}

type Candle = { time: number; high: number; low: number; close: number };

function outcomeFrom(bars: Map<number, Candle>, alertMs: number, now: number): Outcome | null {
  const entry = bars.get(alertMs - M5);
  if (!entry || !(entry.close > 0)) return null;
  const px = entry.close;
  const win = (n: number) => {
    let hi = -Infinity, lo = Infinity, last: number | null = null, got = 0;
    for (let i = 0; i < n; i++) {
      const c = bars.get(alertMs + i * M5);
      if (!c) continue;
      got++;
      hi = Math.max(hi, c.high);
      lo = Math.min(lo, c.low);
      last = c.close;
    }
    if (!got || last == null) return { a: null, u: null, d: null, f: false };
    // Finished only once the last bar of the window has closed and every bar is present.
    const f = now >= alertMs + n * M5 && got === n;
    return { a: last / px - 1, u: hi / px - 1, d: lo / px - 1, f };
  };
  const h1 = win(12), h4 = win(48);
  return { a1: h1.a, u1: h1.u, d1: h1.d, f1: h1.f, a4: h4.a, u4: h4.u, d4: h4.d, f4: h4.f };
}

async function pool<T>(xs: T[], n: number, f: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) await f(xs[i++]); }));
}

/** items: [key, symbol, burst close ms]. Fetches futures 5m bars per coin through /api/klines (CDN-cached). */
export async function computeOutcomes(items: [string, string, number][]): Promise<Map<string, Outcome>> {
  const now = Date.now();
  const out = new Map<string, Outcome>();
  const bySym = new Map<string, [string, number][]>();
  for (const [k, s, closeMs] of items) {
    const a = alertMsOf(closeMs);
    if (a > now) continue; // alert not reached yet
    (bySym.get(s) ?? bySym.set(s, []).get(s)!).push([k, a]);
  }
  // Split each coin into windows of at most ~900 bars.
  const jobs: { s: string; xs: [string, number][] }[] = [];
  for (const [s, xs] of bySym) {
    xs.sort((a, b) => a[1] - b[1]);
    let cur: [string, number][] = [];
    for (const x of xs) {
      if (cur.length && x[1] + 48 * M5 - (cur[0][1] - M5) > 900 * M5) { jobs.push({ s, xs: cur }); cur = []; }
      cur.push(x);
    }
    if (cur.length) jobs.push({ s, xs: cur });
  }
  await pool(jobs, 6, async ({ s, xs }) => {
    const from = xs[0][1] - M5;
    // Round `to` up to the next 5 minutes so the URL is stable (and cacheable) for a whole bar.
    const to = Math.ceil((xs[xs.length - 1][1] + 48 * M5) / M5) * M5;
    try {
      const res = await fetch(`/api/klines?symbol=${encodeURIComponent(s)}&interval=5m&market=futures&from=${from}&to=${Math.min(to, Math.ceil(now / M5) * M5)}`);
      if (!res.ok) return;
      const j = (await res.json()) as { candles?: Candle[] };
      const bars = new Map<number, Candle>((j.candles || []).map((c) => [c.time * 1000, c]));
      for (const [k, a] of xs) {
        const o = outcomeFrom(bars, a, now);
        if (o) out.set(k, o);
      }
    } catch {
      /* leave these rows as — */
    }
  });
  return out;
}
