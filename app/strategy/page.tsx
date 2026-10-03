import type { Metadata } from "next";

export const metadata: Metadata = { title: "策略 · 盯盤哨兵" };

export default function StrategyPage() {
  return (
    <main>
      <h1>正式規則</h1>
      <p className="lead">
        規則代號 <code>quiet_surge_early</code>。每根現貨 1 分 K 收盤就評估，不等 15 分走完。
        合約持倉用來確認，不拿來單獨進場。下面是線上 worker 實際使用的門檻。
      </p>

      <h2>進場（全部要過）</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr><th className="left">項目</th><th className="left">條件</th></tr>
          </thead>
          <tbody>
            <tr><td className="left">節奏</td><td className="left">每根 1 分收盤評估，當下就發 Telegram。5 分、15 分是進場之後的驗證，不是進場條件。</td></tr>
            <tr><td className="left">成交額</td><td className="left">這一分鐘的 close×volume。30 日基準仍用已完成 15 分的 quoteAssetVolume（即時不足時用 1 分累加）。</td></tr>
            <tr><td className="left">基準</td><td className="left">先前正好 2880 根已完成 15 分（約 30 日）的平均成交額。平常 1 分 = 這個平均 ÷ 15。不滿 30 日不觸發。</td></tr>
            <tr><td className="left">放量</td><td className="left">這一分鐘 ≥ 平常 1 分的 10 倍（大約是一整根 30 日 15 分均量的 67%）。門檻故意高，避免每根 1 分都在叫。</td></tr>
            <tr><td className="left">安靜</td><td className="left">已完成的 15 分：前 4 根（1 小時）與前 16 根（4 小時）成交額中位，都 ≤ 15 分基準的 3 倍。正在走的那根不算進去。</td></tr>
            <tr><td className="left">轉強</td><td className="left">1 分收盤相對前一根已完成 15 分收盤 ≥ +1%，而且這一分鐘本身不是收跌。</td></tr>
            <tr><td className="left">還沒跑遠</td><td className="left">前 24 小時漲幅（上一根 15 分收盤 vs 再往前 96 根）≤ +8%。</td></tr>
            <tr><td className="left">OI 方向</td><td className="left">USDT-M 持倉張數（sumOpenInterest，不是 USDT 名目）。即時張數相對約 1 小時前 &gt; 0。</td></tr>
            <tr><td className="left">OI 異常</td><td className="left">幣安 5 分 OI（官方最小框）。這一根 5 分的張數變化（即時 / 本根 5 分開盤 − 1），相對前 7 日相鄰 5 分 OI 變化（不含這一檔）的 z ≥ 1。至少約 600 根有效樣本（大約 2 日）。1 小時方向是 12 根 5 分。</td></tr>
            <tr><td className="left">OI 時效</td><td className="left">即時快照不能舊於 30 分鐘。量價沒過的分鐘不會去抓 OI。</td></tr>
            <tr><td className="left">冷卻</td><td className="left">同一幣 60 分鐘內不重複發進場。追蹤進行中也不發新的進場。</td></tr>
          </tbody>
        </table>
      </div>

      <h2>誰在宇宙裡</h2>
      <ul className="clean">
        <li>幣安現貨 USDT，狀態交易中，且有同名（或對應）U 本位永續，才能即時拉 OI。</li>
        <li>槓桿代幣、穩定幣排除。純現貨沒有永續的不進這套線上規則。</li>
        <li>目前啟用約 360 檔。基準是約 30 日（2880 根 15 分）。幣安 15 分歷史不夠的新上架幣規則在，但不會響。</li>
        <li>每根 1 分 K 與指標會寫進資料庫。警報與追蹤另外寫入。評估本身仍在記憶體，不必先讀庫。</li>
      </ul>

      <h2>進場之後</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr><th className="left">時點</th><th className="left">做什麼</th></tr>
          </thead>
          <tbody>
            <tr><td className="left">進場當下</td><td className="left">1 分收盤就發。記下這一分鐘、收盤價、成交額、30 日 15 分基準、進場 OI 張數。Telegram 標題「安靜後放量初期」，severity = critical。</td></tr>
            <tr><td className="left">+5 分</td><td className="left">進場後連續 5 根 1 分。有效：收盤高於警報價，且每分鐘成交額 ≥ 進場那一分的 35%。觀察：沒跌破但量縮或持平。失效撤銷：收盤仍低且量 &lt; 35%，結束。跌破但量沒縮也結束。</td></tr>
            <tr><td className="left">+15 分</td><td className="left">進場後連續 15 根 1 分，再用同一套有效／觀察／失效驗證一次。這不是進場訊號。</td></tr>
            <tr><td className="left">之後每一根 15 分</td><td className="left">收盤 &lt; 警報價 → 只發一次失效，結束追蹤，不再發 +4 小時／+1 日。</td></tr>
            <tr><td className="left">+4 小時、+1 日</td><td className="left">各一則摘要：相對警報價的報酬、該根 15 分成交額相對 30 日基準、OI 相對進場是增倉或減倉。+1 日送出後狀態改 completed。</td></tr>
          </tbody>
        </table>
      </div>
      <p className="note">
        追蹤訊息另寫入 <code>alerts</code>（alert_type = quiet_surge_watch，rule_id 空），不拉長進場冷卻。
        9 月回測表仍是舊的 15 分進場模擬，用來對照，不是現在的發送節奏。
        改版前已打開的追蹤若還在，第一檢仍是舊的 +15 分；新進場才是 +5 分然後 +15 分。
      </p>

      <h2>OI 從哪來</h2>
      <ul className="clean">
        <li>即時：<code>openInterest</code>（www.binance.com，fapi.binance.com 備援）。部分雲端 IP 對 fapi 會回 HTTP 451。</li>
        <li>歷史 5 分：<code>openInterestHist?period=5m</code>，可帶 endTime 翻頁，並寫進資料庫 <code>oi_5m</code>。幣安大約只留近 30 日。data.binance.vision 沒有這兩個合約 OI 端點。</li>
        <li>回測批次可以先下 vision 日檔，再把尾端用 live hist 補到最新。網站上的全市場表就是這樣做到 2026-10-03。</li>
      </ul>
    </main>
  );
}
