import type { Metadata } from "next";
import { ResearchBoard } from "./ResearchBoard";

export const metadata: Metadata = { title: "訊號 · 盯盤哨兵" };

export default function SignalsPage() {
  return (
    <main>
      <h1>研究規則訊號</h1>
      <p className="lead">
        表格把線上訊號（Railway worker 寫進資料庫，每 30 秒更新）和 9 月起的回測重算合併成一張，同一根爆量兩邊都有時以線上為準；「來源」欄標出出處。「市場」標註該幣是現貨＋合約還是只有合約（規則需要現貨資料，只有合約的幣不會產生訊號）。通過的訊號全部列出；Telegram 只推其中一部分（主動買賣比 ≥ 2、同幣 24 小時內不重複、全市場每 60 分鐘最多 1 則），有推的標「已推播」。
        上方 K 線預設顯示最新有訊號的幣別，可用幣別篩選切換；列表只顯示第二層通過（會發 Telegram）和還在觀察中的爆量，未過的不顯示；點一列 K 線就跳到那個時間。
        事後 4 小時報酬只是對照，不是投資建議。
      </p>
      <ResearchBoard />
    </main>
  );
}
