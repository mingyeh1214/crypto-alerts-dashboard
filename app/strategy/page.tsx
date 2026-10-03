import type { Metadata } from "next";

export const metadata: Metadata = { title: "策略 · 盯盤哨兵" };

export default function StrategyPage() {
  return (
    <main>
      <h1>正式規則</h1>
      <p className="lead">
        規則代號 <code>quiet_surge_early</code>。只在現貨 15 分 K 走完的那一分鐘評估。
        合約持倉用來確認，不拿來單獨進場。下面是線上 worker 實際使用的門檻。
      </p>

      <h2>進場（全部要過）</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr><th className="left">項目</th><th className="left">條件</th></tr>
          </thead>
          <tbody>
            <tr><td className="left">節奏</td><td className="left">只在 15 分收盤評估。1 分 K 不是觸發條件。</td></tr>
            <tr><td className="left">成交額</td><td className="left">當根 15 分的 quote。即時用 1 分 close×volume 加總；暖機用 REST quoteAssetVolume。</td></tr>
            <tr><td className="left">基準</td><td className="left">先前正好 8640 根已完成 15 分（約 90 日）的平均成交額。不滿 90 日不觸發。</td></tr>
            <tr><td className="left">放量</td><td className="left">當根成交額 ≥ 基準的 10 倍。</td></tr>
            <tr><td className="left">安靜</td><td className="left">前 4 根（1 小時）與前 16 根（4 小時）成交額中位，都 ≤ 基準的 3 倍。</td></tr>
            <tr><td className="left">轉強</td><td className="left">當根收漲 ≥ +1%（相對前一根收盤）。</td></tr>
            <tr><td className="left">還沒跑遠</td><td className="left">前 24 小時漲幅（前一根收盤 vs 再往前 96 根）≤ +8%。</td></tr>
            <tr><td className="left">OI 方向</td><td className="left">USDT-M 持倉張數（sumOpenInterest，不是 USDT 名目）。近 1 小時（4 根）變化 &gt; 0。</td></tr>
            <tr><td className="left">OI 異常</td><td className="left">當根 15 分 OI 變化百分比，相對前 7 日（672 根，不含當根）的 z ≥ 1。至少要 200 個有效樣本，否則不算。</td></tr>
            <tr><td className="left">OI 時效</td><td className="left">對到該根收盤的快照不能舊於 30 分鐘。</td></tr>
            <tr><td className="left">冷卻</td><td className="left">同一幣 60 分鐘內不重複發進場。追蹤進行中也不發新的進場。</td></tr>
          </tbody>
        </table>
      </div>

      <h2>誰在宇宙裡</h2>
      <ul className="clean">
        <li>幣安現貨 USDT，狀態交易中，且有同名（或對應）U 本位永續，才能即時拉 OI。</li>
        <li>槓桿代幣、穩定幣排除。純現貨沒有永續的不進這套線上規則。</li>
        <li>目前啟用約 360 檔。其中約 356 檔 15 分歷史滿 90 日；其餘規則在，但基準不夠，不會響。</li>
        <li>1 分 K 不再逐筆寫進資料庫，避免全市場寫入量。警報與追蹤仍寫入。</li>
      </ul>

      <h2>進場之後</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr><th className="left">時點</th><th className="left">做什麼</th></tr>
          </thead>
          <tbody>
            <tr><td className="left">進場當下</td><td className="left">記下 15 分開盤時間、收盤價、當根成交額、90 日基準、進場 OI 張數。Telegram 標題為「安靜後放量初期」，severity = critical。</td></tr>
            <tr><td className="left">下一根 15 分走完</td><td className="left">有效：收盤高於警報價，且成交額 ≥ 警報當根的 35%。觀察：沒跌破但量縮或持平，追蹤繼續。失效撤銷：收盤仍低於警報價且量 &lt; 35%，結束。收盤跌破但量沒縮，也視為失效並結束。</td></tr>
            <tr><td className="left">之後每一根 15 分</td><td className="left">收盤 &lt; 警報價 → 只發一次失效，結束追蹤，不再發 +4 小時／+1 日。</td></tr>
            <tr><td className="left">+4 小時、+1 日</td><td className="left">各一則摘要：相對警報價的報酬、這一根成交額相對 90 日基準、OI 相對進場是增倉或減倉。+1 日送出後狀態改 completed。</td></tr>
          </tbody>
        </table>
      </div>
      <p className="note">
        追蹤訊息另寫入 <code>alerts</code>（alert_type = quiet_surge_watch，rule_id 空），不拉長進場冷卻。
        重啟後用已暖機的 15 分補發還沒送過的里程碑，每個只記一次。
      </p>

      <h2>OI 從哪來</h2>
      <ul className="clean">
        <li>即時：<code>openInterest</code>（www.binance.com，fapi.binance.com 備援）。部分雲端 IP 對 fapi 會回 HTTP 451。</li>
        <li>歷史 15 分：<code>openInterestHist</code>，可帶 endTime 翻頁。data.binance.vision 沒有這兩個合約 OI 端點，所以即時監控不靠日檔。</li>
        <li>回測批次可以先下 vision 日檔，再把尾端用 live hist 補到最新。網站上的全市場表就是這樣做到 2026-10-03。</li>
      </ul>
    </main>
  );
}
