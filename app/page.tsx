import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>全市場即時監控</h1>
      <p className="lead">
        正式規則是 <code>quiet_surge_early</code>：現貨 15 分 K 收盤時，抓長期相對安靜後的突然放量，
        並用 U 本位永續的持倉張數確認。只盯「有現貨、也有永續、OI 能即時更新」的幣。
        觸發與進場後追蹤寫入 Supabase，並送到 Telegram。
      </p>
      <div className="cards">
        <div className="card"><b>360</b><span>啟用中的 quiet_surge_early</span><em>現貨＋永續</em></div>
        <div className="card"><b>356</b><span>滿 90 日、可以觸發</span><em>其餘仍在暖機</em></div>
        <div className="card"><b>360</b><span>OI 已就緒</span><em>合約張數</em></div>
        <div className="card"><b>60 分</b><span>同幣進場冷卻</span><em>追蹤中不再發新進場</em></div>
      </div>
      <p className="note">數字是 2026-10-03 部署當下的 worker 心跳。即時心跳、警報與追蹤筆數以 <Link href="/live">即時狀態</Link> 為準。</p>

      <div className="grid2">
        <section>
          <h2>現在在盯什麼</h2>
          <ul className="clean">
            <li>宇宙：幣安現貨 USDT，且有對應 U 本位永續。槓桿代幣與穩定幣排除。約 360 檔，各一條規則。</li>
            <li>評估只在 <strong>15 分 K 收盤</strong>。1 分 K 只用來聚合成交額，本身不是進場條件。</li>
            <li>成交額用 1 分 <code>close × volume</code> 加總；暖機用 REST 15 分 <code>quoteAssetVolume</code>。</li>
            <li>參考驗證幣仍包含 SAGA、GTC、SAND、QNT（以及回測裡的 MANA），但線上不再只盯這四檔。</li>
          </ul>
          <p><Link href="/strategy">看完整規則 →</Link></p>
        </section>
        <section>
          <h2>進場後追蹤</h2>
          <ul className="clean">
            <li>每筆進場另開一筆 <code>alert_watches</code>。同一幣＋市場同時只允許一筆 <code>active</code>。</li>
            <li>下一根 15 分：價在警報收盤之上且量還在（≥ 警報當根 35%）算有效；量縮但沒跌破算觀察；跌破且量縮則撤銷。</li>
            <li>之後任一根收盤跌破警報價，只發一次失效並結束。</li>
            <li>+4 小時、+1 日各一則摘要（報酬、量相對 90 日基準、OI 增減）。+1 日送完結束，之後可再進場（仍受 60 分冷卻）。</li>
          </ul>
        </section>
      </div>

      <h2>回測快照（不是即時單）</h2>
      <p className="lead">
        模擬從台北 2026-09-01 起到資料當時最新一根 15 分 K。全市場主表 657 筆、356 檔歷史夠長。
        名義 $100、不含手續費。警報後最大漲／跌是路徑極值，不是出場價。
      </p>
      <div className="cards">
        <div className="card"><b>657</b><span>全市場訊號</span></div>
        <div className="card"><b>−$0.69</b><span>+4 小時中位（$100）</span></div>
        <div className="card"><b>−$1.26</b><span>+1 日中位（$100）</span></div>
        <div className="card"><b>+19%</b><span>警報後最大漲幅中位</span></div>
      </div>
      <p><Link href="/signals">9 月至今的訊號紀錄（持續更新） →</Link></p>
      <p><Link href="/backtests">回測頁與原始報告 →</Link></p>
      <p className="note">這不是投資建議。中位報酬偏弱，少數路徑漲幅很大；存活偏差：已下架的幣不在樣本裡。</p>
    </main>
  );
}
