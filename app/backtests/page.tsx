import type { Metadata } from "next";
import backtests from "@/public/data/backtests.json";
import { pct, usd } from "@/lib/format";
import { Explorer } from "./Explorer";

export const metadata: Metadata = { title: "回測 · 盯盤哨兵" };

type Horizon = { n: number; median: number; mean: number; median_usd: number; win: number | null };

const HLABEL: Record<string, string> = {
  ret_15m: "+15 分",
  ret_30m: "+30 分",
  ret_1h: "+1 小時",
  ret_4h: "+4 小時",
  ret_1d: "+1 日",
  max_up: "警報後最大漲（高）",
  max_dn: "警報後最大跌（低）",
};

function cls(n: number | null | undefined) {
  if (n == null || n === 0) return "";
  return n > 0 ? "up" : "dn";
}

export default function BacktestsPage() {
  const main = backtests.full_market.main;
  const horizons = main.horizons as Record<string, Horizon>;
  const early = backtests.early;
  const recs = backtests.filter_scan.recs;

  return (
    <main>
      <h1>回測模擬</h1>
      <p className="lead">
        模擬起點是台北 2026-09-01，收到當時最新的 15 分 K（約 2026-10-03）。
        60 分冷卻仍會計入 9 月以前的觸發，但表上只列出 9 月起的訊號。
        進場價是警報收盤，名義 100 美元，不含手續費與滑價。
      </p>
      <div className="banner">
        {backtests.generated_note}
        嵌入的 HTML 若寫「正式 worker 只盯四幣」，那是產報表當下的舊狀態，請以本站總覽與即時頁為準。
      </div>

      <h2>全市場主表（有合約 OI）</h2>
      <div className="cards">
        <div className="card"><b>{main.events}</b><span>訊號筆數</span></div>
        <div className="card"><b>{main.symbols_eligible}</b><span>歷史夠長可評</span></div>
        <div className="card"><b>{main.symbols_with_signal}</b><span>至少一筆的幣</span></div>
        <div className="card"><b>{main.per_symbol_per_day.toFixed(3)}</b><span>次／日／幣</span></div>
      </div>
      <p className="note">
        現貨 USDT 交易中 {backtests.full_market.meta.spot_usdt} 對，其中有 U 本位永續 {backtests.full_market.meta.spot_with_um}。
        主表 K 線檔與 OI 檔各 {backtests.full_market.meta.klines_with_oi_files}。
        OI 覆蓋到 {backtests.full_market.meta.oi_end}。已下架幣不在樣本（存活偏差）。
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="left">持有</th><th>樣本</th><th>中位報酬</th><th>中位（$100）</th><th>平均報酬</th><th>上漲比例</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(horizons).map(([k, h]) => (
              <tr key={k}>
                <td className="left">{HLABEL[k] ?? k}</td>
                <td>{h.n}</td>
                <td className={cls(h.median)}>{pct(h.median)}</td>
                <td className={cls(h.median_usd)}>{usd(h.median_usd)}</td>
                <td className={cls(h.mean)}>{pct(h.mean)}</td>
                <td>{h.win == null ? "—" : pct(h.win, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>各幣完整資料</h2>
      <p className="lead">
        模擬宇宙 491 檔全部列出（含 0 筆與歷史不足）。可依幣別、日期、合約 OI、+1 日報酬區間、訊號筆數與歷史長度篩選；
        點幣別可看該檔每一筆。
      </p>
      <Explorer />

      <details className="fold">
        <summary>參考幣時間軸、條件掃描與原始 HTML</summary>
      <h2>參考幣時間軸（SAGA／GTC／SAND／QNT／MANA）</h2>
      <div className="cards">
        <div className="card"><b>{early.summary.total}</b><span>9 月起筆數</span></div>
        <div className="card"><b>{pct(early.summary.median_ret_4h)}</b><span>+4 小時中位</span></div>
        <div className="card"><b>{pct(early.summary.median_ret_1d)}</b><span>+1 日中位</span></div>
        <div className="card"><b>{pct(early.summary.median_mfe)}</b><span>路徑最大漲中位</span></div>
        <div className="card"><b>{pct(early.summary.median_mae)}</b><span>路徑最大跌中位</span></div>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="left">發送（台北）</th><th className="left">幣</th><th>收盤</th><th>倍數</th>
              <th>+4 時</th><th>+1 日</th><th>至今最大漲</th><th>至今最大跌</th>
            </tr>
          </thead>
          <tbody>
            {early.events.map((e) => (
              <tr key={e.symbol + e.send_time}>
                <td className="left">{e.send_time}</td>
                <td className="left">{e.coin}</td>
                <td>{e.close}</td>
                <td>{e.multiple.toFixed(1)}×</td>
                <td className={cls(e.ret_4h)}>{pct(e.ret_4h)}</td>
                <td className={cls(e.ret_1d)}>{pct(e.ret_1d)}</td>
                <td className={cls(e.mfe)}>{pct(e.mfe)}</td>
                <td className={cls(e.mae)}>{pct(e.mae)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row-links">
        <a href="/reports/quiet_surge_early_oi_timeline.html">打開時間軸 HTML</a>
      </div>

      <h2>加嚴條件怎麼選到現在這套</h2>
      <p className="note">
        掃描基準（只有 10× 與前 1 小時安靜）約 {backtests.filter_scan.baseline_events} 筆、
        每天 {backtests.filter_scan.baseline_per_day.toFixed(2)} 次。下面兩條是當時留下的候選；
        線上採用的是第一條再加合約 OI（近 1 小時增倉且 15 分 OI% z ≥ 1）。
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="left">規則</th><th>筆數</th><th>次／日</th><th>+1 日中位</th><th>+1 日上漲</th><th>+4 時中位</th>
            </tr>
          </thead>
          <tbody>
            {recs.map((r) => (
              <tr key={r.rule_id}>
                <td className="left">{r.rule_id}</td>
                <td>{r.events}</td>
                <td>{r.per_day.toFixed(3)}</td>
                <td className={cls(r.median_ret_1d)}>{pct(r.median_ret_1d)}</td>
                <td>{pct(r.pct_up_1d, 0)}</td>
                <td className={cls(r.median_ret_4h)}>{pct(r.median_ret_4h)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row-links">
        <a href="/reports/full_market_early_oi_report.html">全市場 HTML 摘要</a>
        <a href="/reports/quiet_surge_early_oi_timeline.html">參考幣時間軸 HTML</a>
        <a href="/reports/quiet_surge_filter_scan.html">條件掃描 HTML（較大）</a>
        <a href="/data/full_market.json">全市場 JSON</a>
      </div>
      <p className="note">不是投資建議。全市場中位偏弱，路徑最大漲的中位約 +19%，不能當成可實現的出場。</p>
      </details>
    </main>
  );
}
