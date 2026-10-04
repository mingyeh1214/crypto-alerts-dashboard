"use client";

import { useEffect, useRef, useState } from "react";
import type {
  CandlestickData,
  HistogramData,
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineData,
  MouseEventParams,
  SeriesMarker,
  Time,
  UTCTimestamp,
  WhitespaceData,
} from "lightweight-charts";

const TPE = 8 * 3600;
const POLL_MS = 5000;
const RECENT = 120;

const UP = "#3cbe88";
const DN = "#e36d6d";
const EMA9 = "#5dade2";
const EMA21 = "#e4b15a";
const EMA55 = "#c39bd3";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type LinePoint = LineData<Time> | WhitespaceData<Time>;
type HistPoint = HistogramData<Time> | WhitespaceData<Time>;

export type ChartMarker = { open_ms: number; label: string };

const STEP: Record<string, number> = {
  "1m": 60,
  "5m": 5 * 60,
  "15m": 15 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60,
  "1d": 24 * 60 * 60,
};

type Bundle = {
  chart: IChartApi;
  candle: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  ema9: ISeriesApi<"Line">;
  ema21: ISeriesApi<"Line">;
  ema55: ISeriesApi<"Line">;
  macd: ISeriesApi<"Line">;
  signal: ISeriesApi<"Line">;
  hist: ISeriesApi<"Histogram">;
  rsi: ISeriesApi<"Line">;
};

function bucket(openMs: number, interval: string) {
  const step = STEP[interval] ?? 900;
  return Math.floor(openMs / 1000 / step) * step + TPE;
}

function focusPad(interval: string) {
  if (interval === "1m") return 6 * 3600;
  if (interval === "5m") return 18 * 3600;
  if (interval === "1h" || interval === "4h") return 6 * 86400;
  if (interval === "1d") return 45 * 86400;
  return 2.5 * 86400;
}

function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsiWilder(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  const at = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  out[period] = at(avgG, avgL);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
    avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = at(avgG, avgL);
  }
  return out;
}

function macdOf(closes: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const fastE = ema(closes, fast);
  const slowE = ema(closes, slow);
  const line: (number | null)[] = closes.map((_, i) =>
    fastE[i] != null && slowE[i] != null ? (fastE[i] as number) - (slowE[i] as number) : null,
  );
  const compact: number[] = [];
  const index: number[] = [];
  line.forEach((v, i) => {
    if (v != null) {
      compact.push(v);
      index.push(i);
    }
  });
  const sigCompact = ema(compact, signalPeriod);
  const signal: (number | null)[] = Array(closes.length).fill(null);
  const hist: (number | null)[] = Array(closes.length).fill(null);
  sigCompact.forEach((s, j) => {
    if (s == null) return;
    const i = index[j];
    signal[i] = s;
    hist[i] = (line[i] as number) - s;
  });
  return { line, signal, hist };
}

function stamp(sec: number): UTCTimestamp {
  return (sec + TPE) as UTCTimestamp;
}

function formatChartPrice(value: number) {
  return value.toFixed(6);
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function linePoints(candles: Candle[], values: (number | null)[]): LinePoint[] {
  return candles.map((c, i) => {
    const time = stamp(c.time);
    const v = values[i];
    return v == null ? { time } : { time, value: v };
  });
}

type View = {
  candle: CandlestickData<Time>[];
  volume: HistPoint[];
  ema9: LinePoint[];
  ema21: LinePoint[];
  ema55: LinePoint[];
  macd: LinePoint[];
  signal: LinePoint[];
  hist: HistPoint[];
  rsi: LinePoint[];
};

function buildView(candles: Candle[]): View {
  const closes = candles.map((c) => c.close);
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const e55 = ema(closes, 55);
  const m = macdOf(closes);
  const rsi = rsiWilder(closes, 14);
  return {
    candle: candles.map((c) => ({
      time: stamp(c.time),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })),
    volume: candles.map((c) => ({
      time: stamp(c.time),
      value: c.volume,
      color: c.close >= c.open ? "rgba(60,190,136,0.65)" : "rgba(227,109,109,0.65)",
    })),
    ema9: linePoints(candles, e9),
    ema21: linePoints(candles, e21),
    ema55: linePoints(candles, e55),
    macd: linePoints(candles, m.line),
    signal: linePoints(candles, m.signal),
    hist: candles.map((c, i) => {
      const time = stamp(c.time);
      const v = m.hist[i];
      if (v == null) return { time };
      return { time, value: v, color: v >= 0 ? UP : DN };
    }),
    rsi: linePoints(candles, rsi),
  };
}

function sameBar(a: Candle, b: Candle) {
  return a.time === b.time && a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close && a.volume === b.volume;
}

function mergeCandles(prev: Candle[], incoming: Candle[]) {
  const map = new Map(prev.map((c) => [c.time, c]));
  for (const c of incoming) map.set(c.time, c);
  return [...map.values()].sort((a, b) => a.time - b.time);
}

function tailOnly(prev: Candle[], next: Candle[]) {
  if (!prev.length || next.length < prev.length || next.length - prev.length > 5) return false;
  const stableUntil = prev.length - 1;
  for (let i = 0; i < stableUntil; i++) {
    if (!sameBar(prev[i], next[i])) return false;
  }
  return true;
}

export function SignalChart({
  pair,
  interval,
  markers,
  focusMs,
  market = "spot",
}: {
  pair: string;
  interval: string;
  markers: ChartMarker[];
  focusMs: number | null;
  market?: "spot" | "futures";
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const [status, setStatus] = useState("載入 K 線…");
  const [bars, setBars] = useState(0);
  const [live, setLive] = useState<"" | "ok" | "stale">("");
  const readoutRef = useRef<HTMLDivElement | null>(null);
  const latestPriceRef = useRef<number | null>(null);
  const hoveredPriceRef = useRef<number | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false;
    const ac = new AbortController();
    setStatus("載入 K 線…");
    setBars(0);
    setLive("");
    chartRef.current = null;
    markersRef.current = null;
    latestPriceRef.current = null;
    hoveredPriceRef.current = null;
    if (readoutRef.current) readoutRef.current.hidden = true;

    const updateReadout = () => {
      const node = readoutRef.current;
      const price = hoveredPriceRef.current;
      const current = latestPriceRef.current;
      if (!node || price == null || current == null || !Number.isFinite(price) || !Number.isFinite(current) || current === 0) {
        if (node) node.hidden = true;
        return;
      }
      const change = ((price - current) / current) * 100;
      node.textContent = `游標價格 ${formatChartPrice(price)} · 對現價 ${formatPercent(change)}（現價 ${formatChartPrice(current)}）`;
      node.hidden = false;
    };

    let bundle: Bundle | null = null;
    let candles: Candle[] = [];

    const applyAll = (next: Candle[], followRight: boolean) => {
      if (!bundle) return;
      const view = buildView(next);
      latestPriceRef.current = next.length ? next[next.length - 1].close : null;
      updateReadout();
      const range = bundle.chart.timeScale().getVisibleLogicalRange();
      const atRight = range != null && next.length - range.to < 3;
      bundle.candle.setData(view.candle);
      bundle.volume.setData(view.volume);
      bundle.ema9.setData(view.ema9);
      bundle.ema21.setData(view.ema21);
      bundle.ema55.setData(view.ema55);
      bundle.macd.setData(view.macd);
      bundle.signal.setData(view.signal);
      bundle.hist.setData(view.hist);
      bundle.rsi.setData(view.rsi);
      if (followRight && atRight) bundle.chart.timeScale().scrollToRealTime();
      else if (followRight && range) bundle.chart.timeScale().setVisibleLogicalRange(range);
    };

    const applyTail = (prev: Candle[], next: Candle[]) => {
      if (!bundle) return;
      const view = buildView(next);
      latestPriceRef.current = next.length ? next[next.length - 1].close : null;
      updateReadout();
      const from = Math.max(0, prev.length - 1);
      const bump = (series: ISeriesApi<"Line" | "Histogram" | "Candlestick">, rows: { time: Time }[]) => {
        for (let i = from; i < rows.length; i++) series.update(rows[i] as never);
      };
      bump(bundle.candle, view.candle);
      bump(bundle.volume, view.volume);
      bump(bundle.ema9, view.ema9);
      bump(bundle.ema21, view.ema21);
      bump(bundle.ema55, view.ema55);
      bump(bundle.macd, view.macd);
      bump(bundle.signal, view.signal);
      bump(bundle.hist, view.hist);
      bump(bundle.rsi, view.rsi);
    };

    const pull = async (recent: boolean) => {
      const q = recent ? `&recent=${RECENT}` : "";
      const res = await fetch(`/api/klines?symbol=${encodeURIComponent(pair)}&interval=${interval}&market=${market}${q}`, {
        signal: ac.signal,
        cache: "no-store",
      });
      const body = (await res.json()) as { candles?: Candle[]; error?: string };
      if (!res.ok || !body.candles) throw new Error(body.error || `HTTP ${res.status}`);
      return body.candles.filter((c) => Number.isFinite(c.open) && c.time > 0);
    };

    (async () => {
      const lc = await import("lightweight-charts");
      const first = await pull(false);
      if (dead || !host.current) return;
      const chart = lc.createChart(host.current, {
        autoSize: true,
        layout: {
          background: { type: lc.ColorType.Solid, color: "#131922" },
          textColor: "#93a0b0",
          fontFamily: '"IBM Plex Sans", "Noto Sans TC", sans-serif',
          panes: {
            separatorColor: "#2a3544",
            separatorHoverColor: "#3d4d62",
          },
        },
        grid: {
          vertLines: { color: "#243140" },
          horzLines: { color: "#243140" },
        },
        rightPriceScale: { borderColor: "#2a3544" },
        timeScale: { borderColor: "#2a3544", timeVisible: true, secondsVisible: false },
        crosshair: { mode: lc.CrosshairMode.Normal },
      });
      const lineOpts = (color: string) => ({
        color,
        lineWidth: 2 as const,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      // Keep the main price pane readable for low-priced contracts. The
      // precision and minMove together make the price scale/crosshair show
      // exactly six decimal places instead of auto-rounding the values.
      const mainPriceFormat = { type: "price" as const, precision: 6, minMove: 0.000001 };
      const mainLineOpts = (color: string) => ({ ...lineOpts(color), priceFormat: mainPriceFormat });
      const candle = chart.addSeries(lc.CandlestickSeries, {
        upColor: UP,
        downColor: DN,
        borderUpColor: UP,
        borderDownColor: DN,
        wickUpColor: UP,
        wickDownColor: DN,
        priceFormat: mainPriceFormat,
      });
      const onCrosshairMove = (param: MouseEventParams<Time>) => {
        if (param.point == null) {
          hoveredPriceRef.current = null;
          updateReadout();
          return;
        }
        const data = param.seriesData.get(candle);
        if (!data || !("close" in data) || typeof data.close !== "number") {
          hoveredPriceRef.current = null;
          updateReadout();
          return;
        }
        hoveredPriceRef.current = data.close;
        updateReadout();
      };
      chart.subscribeCrosshairMove(onCrosshairMove);
      const ema9 = chart.addSeries(lc.LineSeries, mainLineOpts(EMA9));
      const ema21 = chart.addSeries(lc.LineSeries, mainLineOpts(EMA21));
      const ema55 = chart.addSeries(lc.LineSeries, mainLineOpts(EMA55));
      const volume = chart.addSeries(
        lc.HistogramSeries,
        { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false },
        1,
      );
      const macd = chart.addSeries(lc.LineSeries, { ...lineOpts(EMA9), lastValueVisible: true }, 2);
      const signal = chart.addSeries(lc.LineSeries, lineOpts(EMA21), 2);
      const hist = chart.addSeries(
        lc.HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false },
        2,
      );
      const rsi = chart.addSeries(
        lc.LineSeries,
        {
          ...lineOpts(EMA55),
          lastValueVisible: true,
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        },
        3,
      );
      for (const price of [70, 30]) {
        rsi.createPriceLine({
          price,
          color: "#5c6b7a",
          lineWidth: 1,
          lineStyle: lc.LineStyle.Dashed,
          axisLabelVisible: true,
          title: "",
        });
      }
      hist.createPriceLine({
        price: 0,
        color: "#5c6b7a",
        lineWidth: 1,
        lineStyle: lc.LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
      const panes = chart.panes();
      panes[1]?.setHeight(76);
      panes[2]?.setHeight(112);
      panes[3]?.setHeight(92);
      chartRef.current = chart;
      markersRef.current = lc.createSeriesMarkers(candle, []);
      bundle = { chart, candle, volume, ema9, ema21, ema55, macd, signal, hist, rsi };
      candles = first;
      applyAll(first, false);
      setBars(first.length);
      setStatus("");
      setLive("ok");
    })().catch((err: unknown) => {
      if (dead || (err instanceof DOMException && err.name === "AbortError")) return;
      setStatus(err instanceof Error ? err.message : "K 線載入失敗");
    });

    const poll = async () => {
      if (dead || !bundle || document.visibilityState === "hidden") return;
      try {
        const incoming = await pull(true);
        if (dead || !bundle || !incoming.length) return;
        const step = STEP[interval] ?? 900;
        const last = candles[candles.length - 1];
        if (last && incoming[0].time > last.time + step) {
          const full = await pull(false);
          if (dead || !bundle) return;
          candles = full;
          applyAll(full, true);
          setBars(full.length);
          setLive("ok");
          return;
        }
        const next = mergeCandles(candles, incoming);
        let changed = next.length !== candles.length;
        if (!changed) {
          const start = Math.max(0, next.length - incoming.length - 1);
          for (let i = start; i < next.length; i++) {
            if (!sameBar(candles[i], next[i])) {
              changed = true;
              break;
            }
          }
        }
        if (!changed) {
          setLive("ok");
          return;
        }
        if (tailOnly(candles, next)) applyTail(candles, next);
        else applyAll(next, true);
        candles = next;
        setBars(next.length);
        setLive("ok");
      } catch (err: unknown) {
        if (dead || (err instanceof DOMException && err.name === "AbortError")) return;
        setLive("stale");
      }
    };

    const timer = setInterval(() => void poll(), POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      dead = true;
      ac.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      bundle?.chart.remove();
      bundle = null;
      chartRef.current = null;
      markersRef.current = null;
    };
  }, [pair, interval, market]);

  useEffect(() => {
    const plugin = markersRef.current;
    const chart = chartRef.current;
    if (!plugin || !chart || status) return;
    const merged = new Map<number, string[]>();
    for (const m of markers) {
      const t = bucket(m.open_ms, interval);
      const list = merged.get(t) ?? [];
      list.push(m.label);
      merged.set(t, list);
    }
    const marks: SeriesMarker<Time>[] = [...merged.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([time, labels]) => ({
        time: time as UTCTimestamp,
        position: "aboveBar" as const,
        color: "#e4b15a",
        shape: "arrowDown" as const,
        text: labels.length > 2 ? `${labels[0]} +${labels.length - 1}` : labels.join(" · "),
      }));
    plugin.setMarkers(marks);
    if (focusMs != null) {
      const center = bucket(focusMs, interval);
      const pad = focusPad(interval);
      chart.timeScale().setVisibleRange({
        from: (center - pad) as UTCTimestamp,
        to: (center + pad) as UTCTimestamp,
      });
    } else {
      chart.timeScale().fitContent();
    }
  }, [markers, focusMs, interval, status]);

  return (
    <div>
      <div className="chart-legend" aria-hidden="true">
        <span><i style={{ background: EMA9 }} />EMA 9</span>
        <span><i style={{ background: EMA21 }} />EMA 21</span>
        <span><i style={{ background: EMA55 }} />EMA 55</span>
        <span><i style={{ background: UP }} />量 / MACD</span>
        <span><i style={{ background: EMA55 }} />RSI 14</span>
      </div>
      <div className="chart-box" ref={host}>
        <div className="chart-crosshair-readout" ref={readoutRef} hidden />
      </div>
      <p className="note">
        {status
          ? status
          : `${pair} ${interval} · ${bars.toLocaleString("en-US")} 根 · 台北時間。琥珀色箭頭標在訊號那一根。EMA 9／21／55、量能、MACD(12,26,9)、RSI(14)。${
              live === "ok" ? "形成中的 K 每 5 秒更新。" : live === "stale" ? "即時更新暫時失敗，圖仍是上一筆。" : ""
            }`}
      </p>
    </div>
  );
}
