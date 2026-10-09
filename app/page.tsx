import type { Metadata } from "next";
import Link from "next/link";
import { CONDITIONS } from "@/lib/research";

export const metadata: Metadata = { title: "規則 · 盯盤哨兵" };

export default function HomePage() {
  return (
    <main>
      <h1>研究規則：5 分 K 爆量＋未平倉確認</h1>
      <p className="lead">
        網站、Railway worker 與 Telegram 現在只用交接手冊的研究規則。舊的 P12_z278 已經下線，不再發訊號。
        掃描範圍是同時有現貨和 U 本位永續的幣，K 線和成交量看合約，成交量一律用幣數，不用 USDT。
        訊號只是參考，不是投資建議，也不會自動下單。
      </p>
      <div className="banner">
        判斷分兩層：第一層在 5 分 K 收盤時看十項條件，同一個幣 90 分鐘內只算第一次；
        第二層等爆量後 15 分鐘，用 13 個未平倉數字做單側 Mann-Kendall 檢定，p &lt; 0.05 才發 Telegram。
      </div>
      <div className="cards">
        <div className="card"><b>10</b><span>第一層條件</span><em>全部要過</em></div>
        <div className="card"><b>90 分</b><span>同幣去重</span><em>只留第一根</em></div>
        <div className="card"><b>13 點</b><span>未平倉觀察窗</span><em>爆量前 45 分到後 15 分</em></div>
        <div className="card"><b>p &lt; 0.05</b><span>單側 Mann-Kendall</span><em>趨勢用 Theil-Sen</em></div>
      </div>

      <div className="copy">
        <h2>第一層：5 分 K 收盤的十項條件</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr><th>#</th><th>條件</th><th>怎麼算</th></tr>
            </thead>
            <tbody>
              {CONDITIONS.map((c) => (
                <tr key={c.n}>
                  <td>{c.n}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{c.label}</td>
                  <td>{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          十項都過的 5 分 K 叫候選。同一個幣，距離上一根留下來的爆量不到 90 分鐘的候選會被去掉，剩下的才是爆量訊號。
        </p>

        <h2>第二層：未平倉觀察窗</h2>
        <p>
          以爆量那根的開盤時間 T 為準，取 T−45 分到 T+15 分、每 5 分鐘一個，共 13 個未平倉幣數。
          用單側 Mann-Kendall 檢定看是不是在上升，p &lt; 0.05 算通過。趨勢幅度用 Theil-Sen：78 條兩點斜率取中位數，乘上 12 段，再除以第一個點，得到這 60 分鐘的趨勢漲跌幅。
          另外會列出訊號窗（T−60 到 T）的同一套數字，只是參考，不拿來決定。
        </p>
        <p>
          觀察窗最後一個點是 T+15 那根，要等它在 T+20 收盤、也就是爆量收盤後 15 分鐘才能判斷。
          幣安大約在整點後 30 秒公布這個未平倉數字，所以 Telegram 通常在爆量收盤後 15 到 16 分鐘送出。
          13 個數字裡有相同值時，精確檢定不適用，這筆會標成「資料不足」，不發訊號。
        </p>

        <h2>資料與時間</h2>
        <p>
          合約和現貨 5 分 K 直接向幣安取。主動買賣比用幣安 5 分鐘主動買賣量資料，時間戳就是 K 線開盤；
          這份資料通常在收盤後 1.5 到 4 分鐘才公布，第一層會等它出來再判斷。
          未平倉量用幣安 5 分鐘未平倉歷史，資料庫 <code>oi_5m</code> 的時間比官方晚 5 分鐘，計算時會先減回來。
        </p>
        <p>
          手冊的數字已經核對過：GTC 候選 21、爆量 16、通過 13；RLC 13／10；SAND 10／8；SAGA 15／14；BTW 沒有現貨所以是 0；
          AERO 12／12；OGN 10／9。worker 用同一套程式逐根重播，結果完全一致。
        </p>
        <p>
          爆量後 30 分鐘內的量能、基差等後續觀察條件，樣本外驗證都沒有效果，所以沒有加進規則。
          事後 1、4、8 小時報酬只是對照，不是進場條件。
        </p>
        <p>
          <Link href="/signals">看訊號列表與 5 分 K 圖 →</Link>
          {" · "}
          <Link href="/live">看 worker 即時狀態 →</Link>
        </p>
      </div>
    </main>
  );
}
