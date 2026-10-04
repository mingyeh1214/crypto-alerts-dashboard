"use client";

import { useEffect, useState } from "react";

type Trade = {
  symbol: string;
  signal_tp: string;
  exit_tp: string;
  side?: string;
  entry: number;
  exit: number;
  qty?: number;
  notional: number;
  leverage?: number;
  margin?: number;
  equity_before?: number;
  free_margin_before?: number;
  free_margin_after_open?: number;
  margin_used_open?: number;
  entry_fee?: number;
  exit_fee?: number;
  fee_total?: number;
  price_pnl?: number;
  unrealized_pnl?: number;
  realized_pnl?: number;
  pnl: number;
  pnl_pct_margin?: number | null;
  pnl_pct_notional?: number | null;
  balance_after?: number | null;
  equity_after?: number | null;
  reason: string;
  hold_min: number;
};
type Book = {
  id: string;
  title: string;
  headline: string;
  start_usdt: number;
  sept_end_equity: number;
  pnl: number;
  taken: number;
  eligible: number;
  signals: number;
  win_rate: number | null;
  maxdd_realized: number;
  min_equity: number;
  rules: string[];
  note: string;
  skipped: Record<string, number>;
  curve: { tp: string; equity: number }[];
  trades: Trade[];
};
type Opt = { disclaimer: string; fees: string; sept_signals: number; books: Book[] };
type OldFill = { reason: string; px: number; qty: number; pnl: number; tp: string };
type OldTrade = {
  symbol: string;
  signal_tp: string;
  entry_tp: string;
  exit_tp: string;
  side?: string;
  entry: number;
  exit?: number;
  stop: number;
  qty?: number;
  notional?: number;
  leverage?: number;
  margin?: number;
  equity_before?: number;
  free_margin_before?: number;
  free_margin_after_open?: number;
  margin_used_open?: number;
  entry_fee?: number;
  exit_fee?: number;
  fee_total?: number;
  price_pnl?: number;
  unrealized_pnl?: number;
  realized_pnl?: number;
  pnl: number;
  pnl_pct_margin?: number | null;
  pnl_pct_notional?: number | null;
  balance_after?: number | null;
  equity_after?: number | null;
  r: number | null;
  reasons: string;
  fills: OldFill[];
};
type OldSim = {
  disclaimer: string;
  start_usdt: number;
  risk_pct: number;
  leverage_cap: number;
  rules: string[];
  signals_seen: number;
  taken: number;
  skipped_n: number;
  skipped: Record<string, number>;
  sept_end_equity: number;
  sept_pnl: number;
  win_rate: number | null;
  avg_r: number | null;
  expectancy_usdt: number | null;
  curve: { tp: string; equity: number }[];
  trades: OldTrade[];
  note: string;
  final_tp: string | null;
  final_equity: number;
};

function money(n: number) {
  const sign = n > 0 ? "+" : "";
  return (n > 0 ? sign : "") + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function num(n: number | null | undefined, dig = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: dig, maximumFractionDigits: dig });
}
function px(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}
function pct(n: number | null) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function pnlCls(n: number | null | undefined) {
  if (n == null || n === 0) return "";
  return n > 0 ? "up" : "dn";
}

function Curve({ pts, start, color }: { pts: { equity: number }[]; start: number; color: string }) {
  const w = 640;
  const h = 180;
  if (!pts.length) return null;
  const min = Math.min(...pts.map((p) => p.equity), start);
  const max = Math.max(...pts.map((p) => p.equity), start);
  const span = Math.max(1e-6, max - min);
  const d = pts
    .map((p, i) => {
      const x = pts.length === 1 ? 0 : (i / (pts.length - 1)) * (w - 16) + 8;
      const y = h - 16 - ((p.equity - min) / span) * (h - 32);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="180" role="img" aria-label="權益曲線">
      <path d={d} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

function BookView({ book, color }: { book: Book; color: string }) {
  const pnlC = book.pnl >= 0 ? "up" : "dn";
  const skips = Object.entries(book.skipped).sort((a, b) => b[1] - a[1]);
  return (
    <section>
      <h2>{book.title}</h2>
      <p className="note">{book.headline}</p>
      <div className="cards">
        <div className="card"><b>1000</b><span>起始 USDT</span><em>2026-09 鎖定訊號</em></div>
        <div className="card"><b className={pnlC}>{book.sept_end_equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b><span>9 月底權益</span><em>{money(book.pnl)} USDT</em></div>
        <div className="card"><b>{book.taken}</b><span>有做的單</span><em>可做 {book.eligible} / 訊號 {book.signals}</em></div>
        <div className="card"><b>{pct(book.win_rate)}</b><span>勝率</span><em>已實現回撤 {pct(book.maxdd_realized)}</em></div>
        <div className="card"><b>{book.min_equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b><span>期間最低權益</span><em>平倉時計算</em></div>
      </div>
      <Curve pts={book.curve} start={book.start_usdt} color={color} />
      <p className="note">{book.note}</p>
      <h3>規則</h3>
      <ul className="note">
        {book.rules.map((r) => <li key={r}>{r}</li>)}
      </ul>
      {skips.length > 0 && (
        <>
          <h3>沒做的原因</h3>
          <div className="scroll">
            <table>
              <thead><tr><th className="left">原因</th><th>筆數</th></tr></thead>
              <tbody>
                {skips.map(([k, n]) => (
                  <tr key={k}><td className="left">{k}</td><td>{n}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <h3>成交明細（期貨帳戶過程）</h3>
      <p className="note">已平倉列的未實現損益為 0。價格損益＝倉位 ×（出場−進場）；已實現＝扣手續費後淨額。總權益／餘額在平倉結算後更新。</p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="left">訊號（台北）</th>
              <th className="left">幣</th>
              <th>方向</th>
              <th>進場價</th>
              <th>出場價</th>
              <th className="left">出場</th>
              <th>倉位</th>
              <th>名義</th>
              <th>槓桿</th>
              <th>保證金</th>
              <th>進場前權益</th>
              <th>開倉前可用</th>
              <th>開倉後可用</th>
              <th>開倉後占用</th>
              <th>開倉費</th>
              <th>平倉費</th>
              <th>手續費合計</th>
              <th>價格損益</th>
              <th>未實現</th>
              <th>已實現</th>
              <th>保證金報酬%</th>
              <th>名義報酬%</th>
              <th>平倉後權益</th>
              <th>平倉後餘額</th>
            </tr>
          </thead>
          <tbody>
            {book.trades.map((t) => (
              <tr key={t.symbol + t.signal_tp}>
                <td className="left">{t.signal_tp}</td>
                <td className="left">{t.symbol}</td>
                <td>{t.side === "long" ? "多" : t.side ?? "多"}</td>
                <td>{px(t.entry)}</td>
                <td>{px(t.exit)}</td>
                <td className="left">{t.exit_tp} · {t.reason} · {t.hold_min} 分</td>
                <td>{num(t.qty, 4)}</td>
                <td>{num(t.notional)}</td>
                <td>{t.leverage != null ? `${num(t.leverage, 1)}x` : "—"}</td>
                <td>{num(t.margin)}</td>
                <td>{num(t.equity_before)}</td>
                <td>{num(t.free_margin_before)}</td>
                <td>{num(t.free_margin_after_open)}</td>
                <td>{num(t.margin_used_open)}</td>
                <td>{num(t.entry_fee, 4)}</td>
                <td>{num(t.exit_fee, 4)}</td>
                <td>{num(t.fee_total, 4)}</td>
                <td className={pnlCls(t.price_pnl)}>{t.price_pnl == null ? "—" : money(t.price_pnl)}</td>
                <td>{num(t.unrealized_pnl)}</td>
                <td className={pnlCls(t.realized_pnl ?? t.pnl)}>{money(t.realized_pnl ?? t.pnl)}</td>
                <td className={pnlCls(t.pnl_pct_margin)}>{t.pnl_pct_margin == null ? "—" : `${t.pnl_pct_margin.toFixed(2)}%`}</td>
                <td className={pnlCls(t.pnl_pct_notional)}>{t.pnl_pct_notional == null ? "—" : `${t.pnl_pct_notional.toFixed(2)}%`}</td>
                <td>{num(t.equity_after)}</td>
                <td>{num(t.balance_after ?? t.equity_after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type DiscFill = { reason: string; px: number; qty: number; pnl: number; tp: string };
type DiscTrade = {
  symbol: string;
  signal_tp: string;
  entry_tp: string;
  exit_tp: string;
  side?: string;
  entry: number;
  exit: number;
  stop: number;
  qty?: number;
  notional: number;
  leverage?: number;
  margin?: number;
  equity_before?: number;
  free_margin_before?: number;
  free_margin_after_open?: number;
  margin_used_open?: number;
  entry_fee?: number;
  exit_fee?: number;
  fee_total?: number;
  price_pnl?: number;
  unrealized_pnl?: number;
  realized_pnl?: number;
  pnl: number;
  pnl_pct_margin?: number | null;
  pnl_pct_notional?: number | null;
  balance_after?: number | null;
  equity_after?: number | null;
  r: number | null;
  reasons: string;
  hold_min: number;
  why: string;
  entry_style: string;
  fills: DiscFill[];
};
type DiscSkip = { symbol: string; signal_tp: string; why: string; skip: string };
type Disc = {
  disclaimer: string;
  title: string;
  headline: string;
  fees: string;
  rules: string[];
  note: string;
  signals: number;
  taken: number;
  skipped_n: number;
  skipped: Record<string, number>;
  win_rate: number | null;
  sept_end_equity: number;
  sept_end_pnl: number;
  maxdd: number;
  maxdd_realized: number;
  min_equity: number;
  styles: Record<string, number>;
  card_em?: string;
  curve: { tp: string; equity: number }[];
  trades: DiscTrade[];
  skips: DiscSkip[];
};

function DiscView({ book }: { book: Disc }) {
  const pnlC = book.sept_end_pnl >= 0 ? "up" : "dn";
  const skips = Object.entries(book.skipped).sort((a, b) => b[1] - a[1]);
  const whyStyle = { maxWidth: 420, whiteSpace: "normal" as const, textAlign: "left" as const };
  return (
    <section>
      <h2>{book.title}</h2>
      <p className="note">{book.headline}</p>
      <div className="cards">
        <div className="card"><b>1000</b><span>起始 USDT</span><em>只看 2026-09 鎖定訊號</em></div>
        <div className="card"><b className={pnlC}>{book.sept_end_equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b><span>9 月底權益</span><em>{money(book.sept_end_pnl)} USDT</em></div>
        <div className="card"><b>{book.taken}</b><span>有做的單</span><em>跳過 {book.skipped_n} / 訊號 {book.signals}</em></div>
        <div className="card"><b>{pct(book.win_rate)}</b><span>勝率</span><em>{book.card_em ?? `立即 ${book.styles.A ?? 0} · 回踩 ${book.styles.B ?? 0}`}</em></div>
        <div className="card"><b>{pct(book.maxdd)}</b><span>最大回撤</span><em>已實現 {pct(book.maxdd_realized)} · 最低 {book.min_equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</em></div>
      </div>
      <Curve pts={book.curve} start={1000} color="#c4b5fd" />
      <p className="note">{book.fees}</p>
      <p className="note">{book.note}</p>
      <h3>怎麼決定做不做</h3>
      <ul className="note">
        {book.rules.map((r) => <li key={r}>{r}</li>)}
      </ul>
      <h3>沒做的原因（筆數）</h3>
      <div className="scroll">
        <table>
          <thead><tr><th className="left">原因</th><th>筆數</th></tr></thead>
          <tbody>
            {skips.map(([k, n]) => (
              <tr key={k}><td className="left">{k}</td><td>{n}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>有做的單（每一筆都有理由）</h3>
      <p className="note">已平倉列的未實現損益為 0。價格損益是各段成交加總；已實現是扣掉開平倉費之後的淨額。理由只用進場當下看得到的 1 分、15 分、1 時和 BTC。</p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="left">訊號（台北）</th>
              <th className="left">幣</th>
              <th>方向</th>
              <th>進場</th>
              <th>進場價</th>
              <th>止損</th>
              <th>出場價</th>
              <th className="left">出場</th>
              <th>倉位</th>
              <th>名義</th>
              <th>槓桿</th>
              <th>保證金</th>
              <th>進場前權益</th>
              <th>開倉前可用</th>
              <th>開倉後可用</th>
              <th>開倉後占用</th>
              <th>開倉費</th>
              <th>平倉費</th>
              <th>手續費合計</th>
              <th>價格損益</th>
              <th>未實現</th>
              <th>已實現</th>
              <th>R</th>
              <th>保證金報酬%</th>
              <th>名義報酬%</th>
              <th>平倉後權益</th>
              <th>平倉後餘額</th>
              <th className="left">理由</th>
            </tr>
          </thead>
          <tbody>
            {book.trades.map((t) => (
              <tr key={t.symbol + t.signal_tp}>
                <td className="left">{t.signal_tp}</td>
                <td className="left">{t.symbol}</td>
                <td>{t.side === "long" ? "多" : t.side ?? "多"}</td>
                <td>{t.entry_style === "A" ? "立即" : t.entry_style === "B" ? "回踩" : "當下"} · {t.entry_tp.slice(11)}</td>
                <td>{px(t.entry)}</td>
                <td>{px(t.stop)}</td>
                <td>{px(t.exit)}</td>
                <td className="left">{t.exit_tp} · {t.reasons} · {t.hold_min} 分</td>
                <td>{num(t.qty, 4)}</td>
                <td>{num(t.notional)}</td>
                <td>{t.leverage != null ? `${num(t.leverage, 1)}x` : "—"}</td>
                <td>{num(t.margin)}</td>
                <td>{num(t.equity_before)}</td>
                <td>{num(t.free_margin_before)}</td>
                <td>{num(t.free_margin_after_open)}</td>
                <td>{num(t.margin_used_open)}</td>
                <td>{num(t.entry_fee, 4)}</td>
                <td>{num(t.exit_fee, 4)}</td>
                <td>{num(t.fee_total, 4)}</td>
                <td className={pnlCls(t.price_pnl)}>{t.price_pnl == null ? "—" : money(t.price_pnl)}</td>
                <td>{num(t.unrealized_pnl)}</td>
                <td className={pnlCls(t.realized_pnl ?? t.pnl)}>{money(t.realized_pnl ?? t.pnl)}</td>
                <td className={pnlCls(t.pnl)}>{t.r}</td>
                <td className={pnlCls(t.pnl_pct_margin)}>{t.pnl_pct_margin == null ? "—" : `${t.pnl_pct_margin.toFixed(2)}%`}</td>
                <td className={pnlCls(t.pnl_pct_notional)}>{t.pnl_pct_notional == null ? "—" : `${t.pnl_pct_notional.toFixed(2)}%`}</td>
                <td>{num(t.equity_after)}</td>
                <td>{num(t.balance_after ?? t.equity_after)}</td>
                <td className="left" style={whyStyle}>{t.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {book.skips.length > 0 && <h3>沒做的單（每一筆的理由）</h3>}
      {book.skips.length > 0 && <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="left">訊號（台北）</th>
              <th className="left">幣</th>
              <th className="left">歸類</th>
              <th className="left">理由</th>
            </tr>
          </thead>
          <tbody>
            {book.skips.map((s) => (
              <tr key={s.symbol + s.signal_tp}>
                <td className="left">{s.signal_tp}</td>
                <td className="left">{s.symbol}</td>
                <td className="left">{s.skip}</td>
                <td className="left" style={whyStyle}>{s.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </section>
  );
}

export function SimBoard() {
  const [opt, setOpt] = useState<Opt | null>(null);
  const [old, setOld] = useState<OldSim | null>(null);
  const [disc, setDisc] = useState<Disc | null>(null);
  const [play, setPlay] = useState<Disc | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    Promise.all([
      fetch("/data/sept_opt_sim.json").then((r) => {
        if (!r.ok) throw new Error("優化模擬 HTTP " + r.status);
        return r.json() as Promise<Opt>;
      }),
      fetch("/data/paper_sim.json").then((r) => {
        if (!r.ok) throw new Error("原模擬 HTTP " + r.status);
        return r.json() as Promise<OldSim>;
      }),
      fetch("/data/discretionary_sim.json").then((r) => {
        if (!r.ok) throw new Error("長期模擬 HTTP " + r.status);
        return r.json() as Promise<Disc>;
      }),
      fetch("/data/playbook_sim.json").then((r) => {
        if (!r.ok) throw new Error("一小時手冊 HTTP " + r.status);
        return r.json() as Promise<Disc>;
      }),
    ])
      .then(([a, b, c, d]) => {
        setOpt(a);
        setOld(b);
        setDisc(c);
        setPlay(d);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "讀取失敗"));
  }, []);
  if (err) return <p className="err">模擬讀不到：{err}</p>;
  if (!opt || !old || !disc || !play) return <p className="note">讀取模擬…</p>;
  const colors = ["#e4b15a", "#7dcea0"];
  return (
    <>
      <div className="banner">{play.disclaimer}</div>
      <DiscView book={play} />
      <div className="banner">{disc.disclaimer}</div>
      <DiscView book={disc} />
      <div className="banner">{opt.disclaimer}</div>
      <p className="note">{opt.fees} 九月鎖定訊號 {opt.sept_signals} 筆。</p>
      {opt.books.map((b, i) => (
        <BookView key={b.id} book={b} color={colors[i] ?? "#e4b15a"} />
      ))}
      <section>
        <h2>原先的當下選樣（不是九月最佳化）</h2>
        <p className="note">
          這套在看九月結果之前就定好：只做 ATR、轉強、前 24 小時與資金費過關，而且訊號後 3 根 1 分還站得住的單。每筆風險 0.75% 權益，槓桿不超過 3 倍。保留在這裡，避免被中間那兩套事後挑出來的數字蓋掉。
        </p>
        <div className="cards">
          <div className="card"><b>1000</b><span>起始 USDT</span><em>2026-09-01 起</em></div>
          <div className="card"><b className={old.sept_pnl >= 0 ? "up" : "dn"}>{old.sept_end_equity.toFixed(2)}</b><span>9 月 30 日權益</span><em>{money(old.sept_pnl)} USDT</em></div>
          <div className="card"><b>{old.taken}</b><span>有做的單</span><em>跳過 {old.skipped_n} / {old.signals_seen}</em></div>
          <div className="card"><b>{pct(old.win_rate)}</b><span>勝率</span><em>平均 {old.avg_r ?? "—"} R</em></div>
          <div className="card"><b>{old.expectancy_usdt == null ? "—" : money(old.expectancy_usdt)}</b><span>每筆期望 USDT</span><em>風險 {old.risk_pct}% · 槓桿 ≤ {old.leverage_cap}x</em></div>
        </div>
        <Curve pts={old.curve} start={old.start_usdt} color="#8ab4f8" />
        <p className="note">{old.note} 最後一筆出場 {old.final_tp}，帳戶 {old.final_equity.toFixed(2)} USDT。</p>
        <h3>規則（下單前就定死）</h3>
        <ul className="note">
          {old.rules.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <h3>為什麼沒做</h3>
        <div className="scroll">
          <table>
            <thead><tr><th className="left">原因</th><th>筆數</th></tr></thead>
            <tbody>
              {Object.entries(old.skipped).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                <tr key={k}><td className="left">{k}</td><td>{n}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>成交明細（期貨帳戶過程）</h3>
        <p className="note">已平倉列的未實現損益為 0。分批出場時出場價取最後一筆成交價；已實現含各段手續費。</p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th className="left">進場（台北）</th>
                <th className="left">幣</th>
                <th>方向</th>
                <th>進場價</th>
                <th>止損</th>
                <th>出場價</th>
                <th className="left">出場</th>
                <th>倉位</th>
                <th>名義</th>
                <th>槓桿</th>
                <th>保證金</th>
                <th>進場前權益</th>
                <th>開倉前可用</th>
                <th>開倉後可用</th>
                <th>開倉後占用</th>
                <th>開倉費</th>
                <th>平倉費</th>
                <th>手續費合計</th>
                <th>價格損益</th>
                <th>未實現</th>
                <th>已實現</th>
                <th>R</th>
                <th>保證金報酬%</th>
                <th>名義報酬%</th>
                <th>平倉後權益</th>
                <th>平倉後餘額</th>
              </tr>
            </thead>
            <tbody>
              {old.trades.map((t) => (
                <tr key={t.symbol + t.entry_tp}>
                  <td className="left">{t.entry_tp}</td>
                  <td className="left">{t.symbol}</td>
                  <td>{t.side === "long" ? "多" : t.side ?? "多"}</td>
                  <td>{px(t.entry)}</td>
                  <td>{px(t.stop)}</td>
                  <td>{t.exit != null ? px(t.exit) : "—"}</td>
                  <td className="left">{t.exit_tp} · {t.reasons}</td>
                  <td>{num(t.qty, 4)}</td>
                  <td>{num(t.notional)}</td>
                  <td>{t.leverage != null ? `${num(t.leverage, 1)}x` : "—"}</td>
                  <td>{num(t.margin)}</td>
                  <td>{num(t.equity_before)}</td>
                  <td>{num(t.free_margin_before)}</td>
                  <td>{num(t.free_margin_after_open)}</td>
                  <td>{num(t.margin_used_open)}</td>
                  <td>{num(t.entry_fee, 4)}</td>
                  <td>{num(t.exit_fee, 4)}</td>
                  <td>{num(t.fee_total, 4)}</td>
                  <td className={pnlCls(t.price_pnl)}>{t.price_pnl == null ? "—" : money(t.price_pnl)}</td>
                  <td>{num(t.unrealized_pnl)}</td>
                  <td className={pnlCls(t.realized_pnl ?? t.pnl)}>{money(t.realized_pnl ?? t.pnl)}</td>
                  <td className={pnlCls(t.pnl)}>{t.r}</td>
                  <td className={pnlCls(t.pnl_pct_margin)}>{t.pnl_pct_margin == null ? "—" : `${t.pnl_pct_margin.toFixed(2)}%`}</td>
                  <td className={pnlCls(t.pnl_pct_notional)}>{t.pnl_pct_notional == null ? "—" : `${t.pnl_pct_notional.toFixed(2)}%`}</td>
                  <td>{num(t.equity_after)}</td>
                  <td>{num(t.balance_after ?? t.equity_after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
