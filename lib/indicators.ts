/** Client-side technical indicators. Every function returns an array aligned with
 *  the input (NaN while warming up), so callers can zip it with candle times. */

export type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number; tb: number };

export function sma(xs: number[], n: number): number[] {
  const out = new Array<number>(xs.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i];
    if (i >= n) sum -= xs[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(xs: number[], n: number): number[] {
  const out = new Array<number>(xs.length).fill(NaN);
  const k = 2 / (n + 1);
  let prev = NaN;
  let seed = 0;
  let cnt = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    if (!Number.isFinite(x)) continue;
    if (Number.isNaN(prev)) {
      seed += x;
      cnt++;
      if (cnt === n) {
        prev = seed / n;
        out[i] = prev;
      }
    } else {
      prev = x * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** Wilder's smoothing (RMA). */
export function rma(xs: number[], n: number): number[] {
  const out = new Array<number>(xs.length).fill(NaN);
  let prev = NaN;
  let seed = 0;
  let cnt = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    if (!Number.isFinite(x)) continue;
    if (Number.isNaN(prev)) {
      seed += x;
      cnt++;
      if (cnt === n) {
        prev = seed / n;
        out[i] = prev;
      }
    } else {
      prev = (prev * (n - 1) + x) / n;
      out[i] = prev;
    }
  }
  return out;
}

export function bollinger(close: number[], n: number, mult: number) {
  const mid = sma(close, n);
  const up = new Array<number>(close.length).fill(NaN);
  const dn = new Array<number>(close.length).fill(NaN);
  for (let i = n - 1; i < close.length; i++) {
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (close[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / n);
    up[i] = mid[i] + mult * sd;
    dn[i] = mid[i] - mult * sd;
  }
  return { mid, up, dn };
}

/** Daily VWAP that resets at 00:00 Asia/Taipei (same as the research rule), typical price (H+L+C)/3. */
export function vwapTaipei(bars: Bar[]): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  let day = -1;
  let pv = 0;
  let v = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const d = Math.floor((b.time + 8 * 3600) / 86400);
    if (d !== day) {
      day = d;
      pv = 0;
      v = 0;
    }
    pv += ((b.high + b.low + b.close) / 3) * b.volume;
    v += b.volume;
    out[i] = v > 0 ? pv / v : b.close;
  }
  return out;
}

export function rsi(close: number[], n: number): number[] {
  const gain = close.map((c, i) => (i === 0 ? NaN : Math.max(0, c - close[i - 1])));
  const loss = close.map((c, i) => (i === 0 ? NaN : Math.max(0, close[i - 1] - c)));
  const g = rma(gain, n);
  const l = rma(loss, n);
  return g.map((x, i) => (Number.isNaN(x) ? NaN : l[i] === 0 ? 100 : 100 - 100 / (1 + x / l[i])));
}

export function macd(close: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(close, fast);
  const s = ema(close, slow);
  const dif = f.map((x, i) => x - s[i]);
  const dea = ema(dif, signal);
  const hist = dif.map((x, i) => x - dea[i]);
  return { dif, dea, hist };
}

/** KDJ (9,3,3), the usual Chinese-market variant of the stochastic oscillator. */
export function kdj(bars: Bar[], n = 9, m1 = 3, m2 = 3) {
  const k = new Array<number>(bars.length).fill(NaN);
  const d = new Array<number>(bars.length).fill(NaN);
  const j = new Array<number>(bars.length).fill(NaN);
  let pk = 50;
  let pd = 50;
  for (let i = n - 1; i < bars.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let t = i - n + 1; t <= i; t++) {
      hi = Math.max(hi, bars[t].high);
      lo = Math.min(lo, bars[t].low);
    }
    const rsv = hi === lo ? 50 : ((bars[i].close - lo) / (hi - lo)) * 100;
    pk = ((m1 - 1) * pk + rsv) / m1;
    pd = ((m2 - 1) * pd + pk) / m2;
    k[i] = pk;
    d[i] = pd;
    j[i] = 3 * pk - 2 * pd;
  }
  return { k, d, j };
}

export function atr(bars: Bar[], n = 14): number[] {
  const tr = bars.map((b, i) =>
    i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)),
  );
  return rma(tr, n);
}

/** Taker flow from klines: buy/sell ratio and net taker volume (coins). */
export function taker(bars: Bar[]) {
  const ratio = bars.map((b) => {
    const sell = b.volume - b.tb;
    return sell > 0 ? b.tb / sell : NaN;
  });
  const net = bars.map((b) => 2 * b.tb - b.volume);
  return { ratio, net };
}

/** Warm-up bars needed so the slowest enabled indicator is valid at the left edge. */
export function warmupBars(periods: number[]): number {
  return Math.max(60, ...periods.map((p) => p * 3));
}
