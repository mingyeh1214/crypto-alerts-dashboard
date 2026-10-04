import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>全市場現貨監控</h1>
      <p className="lead">
        目前鎖定的是 <code>P12_z278</code>：幣安現貨 USDT，1 分 K 收盤看放量 z ≥ 2.78、轉強、合約 OI，
        再加上 15 分 ATR 0.8%～2.5%，以及最近一筆資金費率不低於 −0.10%。同一幣 24 小時只發一次。
      </p>
      <div className="banner">
        網站上的規則與訊號表已對齊這套鎖定口徑。Telegram 與 Railway worker 尚未切換，即時頁看到的仍是舊的 quiet_surge_early。
      </div>
      <div className="cards">
        <div className="card"><b>432</b><span>9 月至今鎖定訊號</span><em>245 檔現貨</em></div>
        <div className="card"><b>14.8</b><span>平均筆數／日</span><em>同幣冷卻 24 小時</em></div>
        <div className="card"><b>0.8–2.5</b><span>15 分 ATR%</span><em>含上下限</em></div>
        <div className="card"><b>−0.10%</b><span>資金費率地板</span><em>更低就跳過</em></div>
      </div>

      <div className="grid2">
        <section>
          <h2>進場要過什麼</h2>
          <ul className="clean">
            <li>現貨 1 分成交額的 log z ≥ 2.78（回看最多 30 日），而且相對前一根 15 分收盤已漲 ≥ 1%、這一分鐘不收跌。</li>
            <li>U 本位 5 分 OI：近 1 小時增倉，且 OI 變化 z ≥ 1.2。前 24 小時漲幅 ≤ +12%。</li>
            <li>形成中的 15 分 ATR% 落在 0.8 到 2.5。最後一筆 funding ≥ −0.10%。</li>
            <li>同一幣 24 小時內不重複。參考單 GTC 9/30、SAGA 9/10、SAND 10/02 都還在。</li>
          </ul>
          <p><Link href="/strategy">看完整規則 →</Link></p>
        </section>
        <section>
          <h2>怎麼看一筆好不好</h2>
          <ul className="clean">
            <li>看進場後 1 小時、4 小時、1 日的最大漲與最大跌，不看收盤。</li>
            <li>Score 把三段的「上檔＋下檔」做成 0.5／0.3／0.2 加權。中位約 +0.35，≥ +5 有 98 筆。</li>
            <li>任一時窗最大跌 ≤ −10% 有 53 筆，表上標成紅旗。</li>
            <li>K 線在訊號頁，箭頭標在發送那一根。</li>
          </ul>
          <p><Link href="/signals">打開訊號與 K 線 →</Link></p>
        </section>
      </div>
      <p className="note">不是投資建議。這是回測清單，還沒接到下單。</p>
    </main>
  );
}
