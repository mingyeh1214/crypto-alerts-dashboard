"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, SeriesMarker, Time, UTCTimestamp } from "lightweight-charts";

const TPE = 8 * 3600;

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ChartMarker = { open_ms: number; label: string };
export type ChartEngine = "site" | "tv";

const STEP: Record<string, number> = {
  "1m": 60,
  "5m": 5 * 60,
  "15m": 15 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60,
};

const TV_INTERVAL: Record<string, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1h": "60",
  "4h": "240",
};

const EMA_LINES = [
  { period: 9, color: "#7ec8ff", title: "EMA 9" },
  { period: 21, color: "#e4b15a", title: "EMA 21" },
  { period: 55, color: "#d08cff", title: "EMA 55" },
];

function bucket(openMs: number, interval: string) {
  const step = STEP[interval] ?? 900;
  return Math.floor(openMs / 1000 / step) * step + TPE;
}

function focusPad(interval: string) {
  if (interval === "1m") return 6 * 3600;
  if (interval === "5m") return 18 * 3600;
  if (interval === "1h" || interval === "4h") return 6 * 86400;
  return 2.5 * 86400;
}

function emaPoints(candles: Candle[], period: number) {
  const k = 2 / (period + 1);
  let prev = 0;
  let sum = 0;
  const out: { time: UTCTimestamp; value: number }[] = [];
  for (let i = 0; i < candles.length; i++) {
    const close = candles[i].close;
    if (i < period - 1) {
      sum += close;
      continue;
    }
    if (i === period - 1) prev = (sum + close) / period;
    else prev = close * k + prev * (1 - k);
    out.push({ time: (candles[i].time + TPE) as UTCTimestamp, value: prev });
  }
  return out;
}

function tvSymbol(pair: string) {
  return `BINANCE:${pair}`;
}

export function SignalChart({
  pair,
  interval,
  markers,
  focusMs,
  engine,
  onEngine,
  onPick,
}: {
  pair: string;
  interval: string;
  markers: ChartMarker[];
  focusMs: number | null;
  engine: ChartEngine;
  onEngine?: (engine: ChartEngine) => void;
  onPick?: (openMs: number) => void;
}) {
  const ordered = useMemo(
    () => [...markers].sort((a, b) => b.open_ms - a.open_ms),
    [markers],
  );

  return (
    <div>
      <div className="chart-layout">
        {engine === "tv" ? (
          <TradingViewPane pair={pair} interval={interval} onBack={() => onEngine?.("site")} />
        ) : (
          <SiteChart pair={pair} interval={interval} markers={markers} focusMs={focusMs} />
        )}
        <aside className="mark-list" aria-label="訊號發送時間">
          <p>發送時間（台北）</p>
          {ordered.length === 0 ? (
            <span className="note">這檔沒有鎖定訊號。</span>
          ) : (
            ordered.map((m) => {
              const on = focusMs === m.open_ms;
              return (
                <button
                  key={m.open_ms}
                  type="button"
                  className={on ? "on" : ""}
                  onClick={() => onPick?.(m.open_ms)}
                >
                  {m.label}
                </button>
              );
            })
          )}
        </aside>
      </div>
      <p className="note">
        {engine === "site"
          ? `${pair} ${interval} 站內圖（幣安現貨）· 量能在下方 · EMA 9／21／55 · 琥珀色箭頭是訊號那一根。不依賴 TradingView。`
          : `${pair} TradingView 進階圖。若圖是空的，代表這台網路擋了 tradingview.com，請改回站內 K 線。`}
      </p>
    </div>
  );
}

function SiteChart({
  pair,
  interval,
  markers,
  focusMs,
}: {
  pair: string;
  interval: string;
  markers: ChartMarker[];
  focusMs: number | null;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [status, setStatus] = useState("載入 K 線…");
  const [n, setN] = useState(0);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false;
    const ac = new AbortController();
    setStatus("載入 K 線…");
    setN(0);
    chartRef.current?.remove();
    chartRef.current = null;
    seriesRef.current = null;

    (async () => {
      const res = await fetch(`/api/klines?symbol=${encodeURIComponent(pair)}&interval=${interval}`, {
        signal: ac.signal,
      });
      const body = (await res.json()) as { candles?: Candle[]; error?: string };
      if (!res.ok || !body.candles?.length) throw new Error(body.error || `HTTP ${res.status}`);
      if (dead || !host.current) return;
      const lc = await import("lightweight-charts");
      if (dead || !host.current) return;
      const chart = lc.createChart(host.current, {
        autoSize: true,
        layout: {
          background: { type: lc.ColorType.Solid, color: "#131922" },
          textColor: "#93a0b0",
          fontFamily: '"IBM Plex Sans", "Noto Sans TC", sans-serif',
        },
        grid: {
          vertLines: { color: "#243140" },
          horzLines: { color: "#243140" },
        },
        rightPriceScale: { borderColor: "#2a3544", scaleMargins: { top: 0.06, bottom: 0.28 } },
        timeScale: { borderColor: "#2a3544", timeVisible: true, secondsVisible: false },
        crosshair: { mode: lc.CrosshairMode.Normal },
      });
      const series = chart.addCandlestickSeries({
        upColor: "#3cbe88",
        downColor: "#e36d6d",
        borderUpColor: "#3cbe88",
        borderDownColor: "#e36d6d",
        wickUpColor: "#3cbe88",
        wickDownColor: "#e36d6d",
      });
      const volume = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.78, bottom: 0 },
      });
      const rows = body.candles;
      series.setData(rows.map((c) => ({ ...c, time: (c.time + TPE) as UTCTimestamp })));
      volume.setData(
        rows.map((c) => ({
          time: (c.time + TPE) as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? "rgba(60,190,136,0.5)" : "rgba(227,109,109,0.5)",
        })),
      );
      for (const line of EMA_LINES) {
        const ema = chart.addLineSeries({
          color: line.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: line.title,
        });
        ema.setData(emaPoints(rows, line.period));
      }
      chartRef.current = chart;
      seriesRef.current = series;
      setN(rows.length);
      setStatus("");
    })().catch((err: unknown) => {
      if (dead || (err instanceof DOMException && err.name === "AbortError")) return;
      setStatus(err instanceof Error ? err.message : "K 線載入失敗");
    });

    return () => {
      dead = true;
      ac.abort();
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [pair, interval]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || status) return;
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
        position: "aboveBar",
        color: "#e4b15a",
        shape: "arrowDown",
        text: labels.length > 2 ? `${labels[0]} +${labels.length - 1}` : labels.join(" · "),
      }));
    series.setMarkers(marks);
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
  }, [markers, focusMs, interval, status, n]);

  return (
    <div className="chart-frame">
      <div className="chart-box" ref={host} />
      {status ? (
        <div className="chart-empty" role="status">
          <strong>{status === "載入 K 線…" ? "正在畫 K 線" : "K 線沒有出來"}</strong>
          <span>{status === "載入 K 線…" ? `${pair} ${interval}，向幣安抓現貨 K 線。` : status}</span>
        </div>
      ) : null}
    </div>
  );
}

function TradingViewPane({
  pair,
  interval,
  onBack,
}: {
  pair: string;
  interval: string;
  onBack: () => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "fail">("loading");
  const symbol = tvSymbol(pair);
  const tvInterval = TV_INTERVAL[interval] ?? "15";

  useEffect(() => {
    const root = host.current;
    if (!root) return;
    let dead = false;
    setState("loading");
    root.replaceChildren();

    const fail = () => {
      if (!dead) setState("fail");
    };
    const probe = fetch("https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js", {
      mode: "no-cors",
      cache: "no-store",
    }).then(
      () => undefined,
      () => fail(),
    );

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "calc(100% - 32px)";
    widget.style.width = "100%";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: tvInterval,
      timezone: "Asia/Taipei",
      theme: "dark",
      style: "1",
      locale: "zh_TW",
      backgroundColor: "#131922",
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      allow_symbol_change: false,
      withdateranges: true,
      studies: ["STD;EMA", "STD;MACD", "STD;RSI", "Volume@tv-basicstudies"],
      support_host: "https://www.tradingview.com",
    });
    script.onerror = fail;
    const watch = window.setInterval(() => {
      if (root.querySelector("iframe")) {
        window.clearInterval(watch);
        if (!dead) setState("ok");
      }
    }, 300);
    const timer = window.setTimeout(() => {
      if (!root.querySelector("iframe")) fail();
    }, 8000);
    root.append(widget, script);
    void probe;

    return () => {
      dead = true;
      window.clearInterval(watch);
      window.clearTimeout(timer);
      root.replaceChildren();
    };
  }, [symbol, tvInterval]);

  return (
    <div className="chart-frame">
      <div className="chart-box tv-chart tradingview-widget-container" ref={host} />
      {state !== "ok" ? (
        <div className="chart-empty" role="status">
          <strong>{state === "fail" ? "TradingView 圖載入失敗" : "正在載入 TradingView"}</strong>
          <span>
            {state === "fail"
              ? "這台網路可能擋了 tradingview.com 或 s3.tradingview.com。站內 K 線不走這條路，K 線、量能和 EMA 仍看得到。"
              : `${symbol} · ${interval}`}
          </span>
          {state === "fail" ? (
            <button type="button" className="btn" onClick={onBack}>
              改回站內 K 線
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
