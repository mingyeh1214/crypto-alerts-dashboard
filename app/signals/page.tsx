import type { Metadata } from "next";
import { ResearchBoard } from "./ResearchBoard";

export const metadata: Metadata = { title: "訊號 · 盯盤哨兵" };

export default function SignalsPage() {
  return (
    <main>
      <h1>研究規則訊號</h1>
      <p className="lead">
        「線上」是 Railway worker 寫進資料庫的訊號，每 30 秒更新；「回測」是 9 月起的歷史重算，包含手冊 6 個幣和另外 354 個有現貨的幣。
        上方 K 線預設顯示最新有訊號的幣別，可用幣別篩選切換；列表只顯示第二層通過（會發 Telegram）和還在觀察中的爆量，未過的不顯示；點一列 K 線就跳到那個時間。
        事後 4 小時報酬只是對照，不是投資建議。
      </p>
      <ResearchBoard />
    </main>
  );
}
