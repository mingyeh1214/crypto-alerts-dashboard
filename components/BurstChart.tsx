"use client";

import { useEffect, useRef, useState } from "react";
import type { SignalStatus } from "@/lib/research";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type ChartMark = { closeMs: number; status: SignalStatus };

const UP = "#3cbe88";
const DN = "#e36d6d";
const TZ = 8 * 3600; // chart axis in Taipei wall-clock time
const M5 = 5 * 60_000;
const BEFORE = 4 * 3600_000;
const AFTER = 8 * 3600_000;

export const MARK_COLOR: Record<SignalStatus, string> = {
  passed: "#3cbe88",
  failed: "#e36d6d",
  pending: "#e3b341",
  error: "#8b97a8",
};

/**
 * 5m perp candles around one focus signal (4h before to 8h after, capped at now),
 * with every signal of the coin inside the window marked (burst bar + decision bar),
 * volume below and open interest in a third pane when Binance still has it (~30 days).
 */
export function BurstChart({ symbol, focusMs, marks }: { symbol: string; focusMs: number; marks: ChartMark[] }) {
  const host = useRef<HTMLDivElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasOi, setHasOi] = useState(false);
  const marksKey = marks.map((m) => `${m.closeMs}:${m.status}`).join(",");

  useEffect(() => {
    let dead = false;
    let cleanup: (() => void) | null = null;
    const ac = new AbortController();
    setErr(null);
    setLoading(true);
    setHasOi(false);
    (async () => {
      try {
        const from = Math.floor((focusMs - M5 - BEFORE) / M5) * M5;
        const to = Math.min(Date.now(), focusMs + AFTER);
        const q = `symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`;
        const [res, oiRes] = await Promise.all([
          fetch(`/api/klines?${q}&interval=5m&market=futures`, { signal: ac.signal, cache: "no-store" }),
          fetch(`/api/oi?${q}`, { signal: ac.signal, cache: "no-store" }).catch(() => null),
        ]);
        const body = (await res.json()) as { candles?: Candle[]; error?: string };
        if (!res.ok || !body.candles) throw new Error(body.error || `HTTP ${res.status}`);
        let oi: { time: number; value: number }[] = [];
        if (oiRes && oiRes.ok) {
          const j = (await oiRes.json().catch(() => ({}))) as { points?: { time: number; value: number }[] };
          oi = j.points || [];
        }
        if (dead || !host.current) return;
        const lc = await import("lightweight-charts");
        if (dead || !host.current) return;
        type T = import("lightweight-charts").UTCTimestamp;
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
        const t = (sec: number) => (sec + TZ) as T;
        candle.setData(body.candles.map((c) => ({ time: t(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));
        const times = new Set(body.candles.map((c) => c.time));
        const inWin = marks.filter((m) => times.has(Math.floor((m.closeMs - M5) / 1000)));
        const burstBars = new Map(inWin.map((m) => [Math.floor((m.closeMs - M5) / 1000), m.status]));
        volume.setData(
          body.candles.map((c) => {
            const st = burstBars.get(c.time);
            return {
              time: t(c.time),
              value: c.volume,
              color: st ? MARK_COLOR[st] : c.close >= c.open ? "rgba(60,190,136,0.35)" : "rgba(227,109,109,0.35)",
            };
          }),
        );
        if (oi.length) {
          const oiSeries = chart.addSeries(
            lc.LineSeries,
            { color: "#5aa9e4", lineWidth: 2, priceLineVisible: false, priceFormat: { type: "volume" } },
            2,
          );
          oiSeries.setData(oi.filter((p) => times.has(p.time)).map((p) => ({ time: t(p.time), value: p.value })));
          setHasOi(true);
        }
        const markers = inWin
          .flatMap((m) => {
            const b = Math.floor((m.closeMs - M5) / 1000);
            const d = Math.floor((m.closeMs + 2 * M5) / 1000); // bar that closes at burst close + 15m
            const c = MARK_COLOR[m.status];
            const out = [{ time: t(b), position: "belowBar" as const, color: c, shape: "arrowUp" as const, text: m.closeMs === focusMs ? "爆量 ●" : "爆量" }];
            if (times.has(d)) out.push({ time: t(d), position: "aboveBar" as const, color: c, shape: "arrowDown" as const, text: "判斷" } as never);
            return out;
          })
          .sort((a, b) => (a.time as number) - (b.time as number));
        lc.createSeriesMarkers(candle, markers);
        const panes = chart.panes();
        if (panes[1]) panes[1].setHeight(80);
        if (panes[2]) panes[2].setHeight(80);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, focusMs, marksKey]);

  return (
    <div className="chart-frame">
      <div className="chart-legend">
        <span><i style={{ background: MARK_COLOR.passed }} />通過</span>
        <span><i style={{ background: MARK_COLOR.failed }} />未過</span>
        <span><i style={{ background: MARK_COLOR.pending }} />觀察中</span>
        <span>↑ 爆量那根　↓ 判斷點（爆量收盤後 15 分鐘）</span>
        <span>合約 5 分 K；第二格成交量（幣）{hasOi ? "；第三格未平倉（幣）" : ""}；時間為台北</span>
      </div>
      <div className="chart-box chart-tall" ref={host}>
        {loading && !err ? <div className="chart-empty"><span>載入中…</span></div> : null}
        {err ? <div className="chart-empty"><strong>讀不到 K 線</strong><span>{err}</span></div> : null}
      </div>
    </div>
  );
}
