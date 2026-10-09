"use client";

import { useEffect, useRef, useState } from "react";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

const UP = "#3cbe88";
const DN = "#e36d6d";
const TZ = 8 * 3600; // chart axis in Taipei wall-clock time
const M5 = 5 * 60_000;

/** 5m perp candles from 4h before to 8h after one burst, with the burst bar and decision bar marked. */
export function BurstChart({ symbol, closeMs }: { symbol: string; closeMs: number }) {
  const host = useRef<HTMLDivElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    let cleanup: (() => void) | null = null;
    const ac = new AbortController();
    setErr(null);
    setLoading(true);
    (async () => {
      try {
        const from = closeMs - M5 - 4 * 3600_000;
        const to = closeMs + 8 * 3600_000;
        const res = await fetch(
          `/api/klines?symbol=${encodeURIComponent(symbol)}&interval=5m&market=futures&from=${from}&to=${to}`,
          { signal: ac.signal, cache: "no-store" },
        );
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
            panes: { separatorColor: "#2a3544", separatorHoverColor: "#3d4d62" },
          },
          grid: { vertLines: { color: "#243140" }, horzLines: { color: "#243140" } },
          rightPriceScale: { borderColor: "#2a3544" },
          timeScale: { borderColor: "#2a3544", timeVisible: true, secondsVisible: false },
          crosshair: { mode: lc.CrosshairMode.Normal },
        });
        const candle = chart.addSeries(lc.CandlestickSeries, {
          upColor: UP, downColor: DN, borderUpColor: UP, borderDownColor: DN, wickUpColor: UP, wickDownColor: DN,
          priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
        });
        const volume = chart.addSeries(
          lc.HistogramSeries,
          { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false },
          1,
        );
        const t = (c: Candle) => (c.time + TZ) as import("lightweight-charts").UTCTimestamp;
        candle.setData(body.candles.map((c) => ({ time: t(c), open: c.open, high: c.high, low: c.low, close: c.close })));
        const burstOpen = Math.floor((closeMs - M5) / 1000);
        const decideOpen = Math.floor((closeMs + 2 * M5) / 1000); // bar that closes at burst close + 15m
        volume.setData(
          body.candles.map((c) => ({
            time: t(c),
            value: c.volume,
            color: c.time === burstOpen ? "#5aa9e4" : c.close >= c.open ? "rgba(60,190,136,0.45)" : "rgba(227,109,109,0.45)",
          })),
        );
        lc.createSeriesMarkers(candle, [
          { time: (burstOpen + TZ) as import("lightweight-charts").UTCTimestamp, position: "belowBar", color: "#5aa9e4", shape: "arrowUp", text: "爆量" },
          { time: (decideOpen + TZ) as import("lightweight-charts").UTCTimestamp, position: "aboveBar", color: "#b07ae4", shape: "arrowDown", text: "判斷" },
        ]);
        chart.timeScale().fitContent();
        cleanup = () => chart.remove();
        setLoading(false);
      } catch (e) {
        if (!dead) {
          setErr(e instanceof Error ? e.message : "K 線讀取失敗");
          setLoading(false);
        }
      }
    })();
    return () => {
      dead = true;
      ac.abort();
      cleanup?.();
    };
  }, [symbol, closeMs]);

  return (
    <div className="chart-frame">
      <div className="chart-legend">
        <span><i style={{ background: "#5aa9e4" }} />爆量那根</span>
        <span><i style={{ background: "#b07ae4" }} />判斷點（爆量收盤後 15 分鐘）</span>
        <span>合約 5 分 K，下格是成交量（幣）；時間為台北</span>
      </div>
      <div className="chart-box" ref={host}>
        {loading && !err ? <div className="chart-empty"><span>載入中…</span></div> : null}
        {err ? <div className="chart-empty"><strong>讀不到 K 線</strong><span>{err}</span></div> : null}
      </div>
    </div>
  );
}
