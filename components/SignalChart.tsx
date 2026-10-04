"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, SeriesMarker, Time, UTCTimestamp } from "lightweight-charts";

const TPE = 8 * 3600;

type Candle = { time: number; open: number; high: number; low: number; close: number };

export type ChartMarker = { open_ms: number; label: string };

const STEP: Record<string, number> = {
  "1m": 60,
  "5m": 5 * 60,
  "15m": 15 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60,
};

function bucket(openMs: number, interval: string) {
  const step = STEP[interval] ?? 900;
  return Math.floor(openMs / 1000 / step) * step + TPE;
}

export function SignalChart({
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
      if (!res.ok || !body.candles) throw new Error(body.error || `HTTP ${res.status}`);
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
        rightPriceScale: { borderColor: "#2a3544" },
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
      series.setData(
        body.candles.map((c) => ({
          ...c,
          time: (c.time + TPE) as UTCTimestamp,
        })),
      );
      chartRef.current = chart;
      seriesRef.current = series;
      setN(body.candles.length);
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
      const pad = interval === "5m" ? 18 * 3600 : interval === "1h" || interval === "4h" ? 6 * 86400 : 2.5 * 86400;
      chart.timeScale().setVisibleRange({
        from: (center - pad) as UTCTimestamp,
        to: (center + pad) as UTCTimestamp,
      });
    } else {
      chart.timeScale().fitContent();
    }
  }, [markers, focusMs, interval, status, n]);

  return (
    <div>
      <div className="chart-box" ref={host} />
      <p className="note">
        {status
          ? status
          : `${pair} ${interval} · ${n.toLocaleString("en-US")} 根 · 時間軸是台北。琥珀色箭頭標在訊號那一根 K。`}
      </p>
    </div>
  );
}
