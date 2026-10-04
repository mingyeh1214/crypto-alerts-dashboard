"use client";

import { useEffect, useMemo, useRef } from "react";

export type ChartMarker = { open_ms: number; label: string };

const TV_INTERVAL: Record<string, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1h": "60",
  "4h": "240",
};

const fmt = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function SignalChart({
  pair,
  interval,
  markers,
  focusMs,
  onPick,
}: {
  pair: string;
  interval: string;
  markers: ChartMarker[];
  focusMs: number | null;
  onPick?: (openMs: number) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const symbol = `BINANCE:${pair}`;
  const tvInterval = TV_INTERVAL[interval] ?? "15";

  const ordered = useMemo(
    () => [...markers].sort((a, b) => b.open_ms - a.open_ms),
    [markers],
  );

  useEffect(() => {
    const root = host.current;
    if (!root) return;
    root.replaceChildren();

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "calc(100% - 32px)";
    widget.style.width = "100%";

    const copy = document.createElement("div");
    copy.className = "tradingview-widget-copyright";
    const link = document.createElement("a");
    link.href = `https://www.tradingview.com/symbols/${symbol.replace(":", "-")}/?exchange=BINANCE`;
    link.target = "_blank";
    link.rel = "noopener nofollow";
    const name = document.createElement("span");
    name.className = "blue-text";
    name.textContent = `${pair} chart`;
    link.append(name);
    const mark = document.createElement("span");
    mark.className = "trademark";
    mark.textContent = " by TradingView";
    copy.append(link, mark);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.text = JSON.stringify({
      autosize: true,
      symbol,
      interval: tvInterval,
      timezone: "Asia/Taipei",
      theme: "dark",
      style: "1",
      locale: "zh_TW",
      backgroundColor: "#131922",
      gridColor: "rgba(42, 53, 68, 0.5)",
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false,
      save_image: true,
      withdateranges: true,
      details: true,
      calendar: false,
      studies: [
        "STD;EMA",
        "STD;MACD",
        "STD;RSI",
        "Volume@tv-basicstudies",
      ],
      support_host: "https://www.tradingview.com",
    });

    root.append(widget, copy, script);
    return () => {
      root.replaceChildren();
    };
  }, [symbol, pair, tvInterval]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [focusMs, pair]);

  const chartUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}&interval=${tvInterval}`;

  return (
    <div>
      <div className="chart-layout">
        <div className="chart-box tv-chart" ref={host} />
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
                  ref={on ? activeRef : undefined}
                  className={on ? "on" : ""}
                  onClick={() => onPick?.(m.open_ms)}
                >
                  {m.label || fmt.format(m.open_ms)}
                </button>
              );
            })
          )}
        </aside>
      </div>
      <p className="note">
        {pair} 現貨 · TradingView 進階圖（BINANCE:{pair}）· 時間軸台北。
        K 線自帶成交量，並預載 EMA、MACD、RSI；週期、畫線與其他指標可在圖上直接改。
        免費圖不能替我們畫箭頭，右邊清單就是發送時間；點一筆會在表上對到同一列。
        {focusMs != null ? ` 目前選取 ${fmt.format(focusMs)}。` : ""}
        {" "}
        <a href={chartUrl} target="_blank" rel="noopener noreferrer">在 TradingView 打開</a>
      </p>
    </div>
  );
}
