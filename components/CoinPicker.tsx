"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { marketType, MARKET_LABEL } from "@/lib/research";
import { FAV_KEY, RECENT_KEY, loadList, saveList } from "@/lib/chartPrefs";

export type CoinInfo = { s: string; n: number; live: boolean; lastMs: number };

/** Searchable coin dropdown: favorites, recent, then coins by most recent signal. */
export function CoinPicker({ coins, value, onPick }: { coins: CoinInfo[]; value: string | null; onPick: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [fav, setFav] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setFav(loadList(FAV_KEY));
    setRecent(loadList(RECENT_KEY));
  }, []);
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", f);
    setTimeout(() => input.current?.focus(), 0);
    return () => document.removeEventListener("mousedown", f);
  }, [open]);

  const byS = useMemo(() => new Map(coins.map((c) => [c.s, c])), [coins]);
  const sections = useMemo(() => {
    const needle = q.trim().toUpperCase();
    const match = (s: string) => !needle || s.includes(needle);
    const bySignal = [...coins].sort((a, b) => b.lastMs - a.lastMs);
    if (needle) return [{ title: "搜尋結果", items: bySignal.filter((c) => match(c.s)) }];
    const favs = fav.map((s) => byS.get(s)).filter((c): c is CoinInfo => !!c);
    const rec = recent.filter((s) => !fav.includes(s)).map((s) => byS.get(s)).filter((c): c is CoinInfo => !!c).slice(0, 8);
    return [
      { title: "★ 收藏", items: favs },
      { title: "最近看過", items: rec },
      { title: "最新訊號", items: bySignal },
    ].filter((x) => x.items.length);
  }, [coins, q, fav, recent, byS]);
  const flat = useMemo(() => sections.flatMap((s) => s.items.map((c) => c.s)), [sections]);

  const pick = (s: string) => {
    const r = [s, ...recent.filter((x) => x !== s)].slice(0, 12);
    setRecent(r);
    saveList(RECENT_KEY, r);
    onPick(s);
    setOpen(false);
    setQ("");
  };
  const toggleFav = (s: string) => {
    const f = fav.includes(s) ? fav.filter((x) => x !== s) : [s, ...fav];
    setFav(f);
    saveList(FAV_KEY, f);
  };
  const ago = (ms: number) => {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 60) return `${m} 分前`;
    if (m < 48 * 60) return `${Math.round(m / 60)} 時前`;
    return `${Math.round(m / 1440)} 天前`;
  };

  return (
    <div className="coin-picker" ref={box}>
      <button className="btn coin-btn" onClick={() => setOpen((x) => !x)} aria-haspopup="listbox" aria-expanded={open}>
        <strong>{value ?? "選擇幣別"}</strong>
        {value && marketType(value) ? <span className={`mt-tag ${marketType(value)}`}>{MARKET_LABEL[marketType(value)!]}</span> : null}
        {value && fav.includes(value) ? <span className="star on">★</span> : null}
        <span className="caret">▾</span>
      </button>
      {open ? (
        <div className="cp-pop" role="listbox">
          <input
            ref={input}
            value={q}
            placeholder="搜尋幣別，例如 GTC"
            onChange={(e) => {
              setQ(e.target.value);
              setHi(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                setHi((h) => Math.min(flat.length - 1, h + 1));
                e.preventDefault();
              } else if (e.key === "ArrowUp") {
                setHi((h) => Math.max(0, h - 1));
                e.preventDefault();
              } else if (e.key === "Enter" && flat[hi]) pick(flat[hi]);
              else if (e.key === "Escape") setOpen(false);
            }}
          />
          <div className="cp-list">
            {sections.map((sec) => (
              <div key={sec.title}>
                <div className="cp-sec">{sec.title}</div>
                {sec.items.map((c) => {
                  const idx = flat.indexOf(c.s);
                  return (
                    <div
                      key={sec.title + c.s}
                      className={`cp-item${c.s === value ? " cur" : ""}${idx === hi ? " hi" : ""}`}
                      onMouseEnter={() => setHi(idx)}
                      onClick={() => pick(c.s)}
                    >
                      <span
                        className={`star${fav.includes(c.s) ? " on" : ""}`}
                        title={fav.includes(c.s) ? "取消收藏" : "收藏"}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFav(c.s);
                        }}
                      >
                        {fav.includes(c.s) ? "★" : "☆"}
                      </span>
                      <b>{c.s.replace(/USDT$/, "")}</b>
                      <small>{c.n} 筆{c.live ? " · 線上" : ""}</small>
                      {(() => { const mt = marketType(c.s); return mt ? <span className={`mt-tag ${mt}`}>{MARKET_LABEL[mt]}</span> : null; })()}
                      <em>{ago(c.lastMs)}</em>
                    </div>
                  );
                })}
              </div>
            ))}
            {!flat.length ? <div className="cp-empty">找不到幣別</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
