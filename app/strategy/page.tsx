import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "策略 · 盯盤哨兵" };

export default function StrategyPage() {
  return (
    <main>
      <h1>鎖定規則</h1>
      <p className="lead">
        規則代號 <code>P12_z278</code>。只做幣安現貨 USDT。每根 1 分 K 收盤評估。
        下面是目前鎖定、網站訊號頁在用的門檻。Telegram／worker 還沒切換到這套，即時頁仍是線上那台 worker 的狀態。
      </p>

      <h2>進場（全部要過）</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr><th className="left">項目</th><th className="left">條件</th></tr>
          </thead>
          <tbody>
            <tr><td className="left">市場</td><td className="left">幣安現貨 USDT，且有對應 U 本位永續（才能讀 OI 與資金費率）。沒有現貨的永續不進宇宙。槓桿代幣不在這份現貨掃描裡。</td></tr>
            <tr><td className="left">節奏</td><td className="left">每根 1 分 K 收盤就評估。不等 15 分走完。</td></tr>
            <tr><td className="left">放量 z</td><td className="left">z =（log 這一分鐘 quote volume − μ）／σ，μ／σ 來自先前最多 43200 根已完成 1 分（約 30 日，不含當根；略過 ≤0）。z ≥ 2.78。樣本不夠就不觸發。</td></tr>
            <tr><td className="left">轉強</td><td className="left">1 分收盤相對前一根已完成 15 分收盤 ≥ +1%，而且這一分鐘不收跌（收盤 ≥ 前一分收盤）。</td></tr>
            <tr><td className="left">首次過線</td><td className="left">前 120 根 1 分不能已經同時滿足 z、轉強與 OI。單獨 z 過線不佔位。</td></tr>
            <tr><td className="left">OI</td><td className="left">同一 ticker 的 5 分持倉張數。近 1 小時變化 &gt; 0，且這段 OI 變化的 z ≥ 1.2（至少約 600 根有效 5 分變化）。1000 倍合約改讀對應的合約代號。</td></tr>
            <tr><td className="left">還沒跑遠</td><td className="left">前 24 小時漲幅 ≤ +12%。這條只擋進場，不改「首次過線」的佔位。</td></tr>
            <tr><td className="left">ATR</td><td className="left">形成中的 15 分 Wilder ATR(14) 占價格 0.8%～2.5%（含上下限）。太安靜或已經太劇烈都不進。同樣只擋進場。</td></tr>
            <tr><td className="left">資金費率</td><td className="left">進場前最後一筆已結算 funding ≥ −0.10% 才留。更低就跳過。沒有 funding 紀錄的不因此刪除。1000 倍合約用合約代號去對。</td></tr>
            <tr><td className="left">冷卻</td><td className="left">同一幣 24 小時（1440 分）內不重複進場。冷卻只在真的進場之後起算。</td></tr>
          </tbody>
        </table>
      </div>

      <h2>這份清單怎麼來的</h2>
      <ul className="clean">
        <li>掃描起點台北 2026-09-01，資料收到 2026-10-04 00:43（台北）。第一筆落在 9/5。</li>
        <li>通過 ATR 與 funding 之後再套 24 小時同幣冷卻，留下 <strong>432</strong> 筆、<strong>245</strong> 檔，約 <strong>14.8 筆／日</strong>。</li>
        <li>清單是在原掃描（內部冷卻 2 小時）的結果上再套 24 小時，不是把冷卻改成 24 小時後整段重掃。2 小時擋掉的單不會回來；24 小時內的後一筆會被拿掉。</li>
        <li>GTC 2026-09-30 15:31、SAGA 2026-09-10 21:39、SAND 2026-10-02 14:51 都還在。</li>
        <li>
          路徑用進場後 1 小時／4 小時／1 日的最大漲與最大跌，不是收盤。
          Score = 0.5×(1h 漲+1h 跌) + 0.3×(4h 漲+4h 跌) + 0.2×(1d 漲+1d 跌)。Score 是事後分數，不能拿來當線上濾網。
        </li>
      </ul>
      <p>
        <Link href="/signals">看 432 筆與各幣 K 線（箭頭標在發送時間） →</Link>
      </p>

      <h2>還沒做的</h2>
      <ul className="clean">
        <li>線上 worker 與 Telegram 仍是先前的 <code>quiet_surge_early</code>。這頁改的是網站說明與回測清單，沒有改資料庫規則、也沒有重部署 worker。</li>
        <li>1 分／5 分以上的 EMA 多頭排列測過，沒有讓回撤變淺，不納入。</li>
      </ul>
      <p className="note">不是投資建議。Score 中位約 +0.3，仍有約一成多的單在一日內最大跌到 −10% 或更深。</p>
    </main>
  );
}
