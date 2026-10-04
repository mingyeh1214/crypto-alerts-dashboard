import type { Metadata } from "next";
import { LockedBoard } from "./LockedBoard";

export const metadata: Metadata = { title: "訊號紀錄 · 盯盤哨兵" };

export default function SignalsPage() {
  return (
    <main>
      <h1>鎖定訊號</h1>
      <p className="lead">
        只列 P12_z278：z ≥ 2.78、轉強 ≥ +1% 且這一分鐘不收跌、前 24 小時 ≤ +12%、
        嚴格 OI（1 小時增倉且 OI-z ≥ 1.2）、合格首次過線、15 分 ATR 0.8%～2.5%、
        進場前最後一筆資金費率不低於 −0.10%、同幣冷卻 24 小時。
        這頁列出 9 月起全部鎖定規則回測，也包含寫進資料庫但沒送 Telegram 的補庫。之後新送到 Telegram 的進場每 5 秒併進同一張表。每一筆另有當下位置、當下建議，以及一小時手冊：進場只在訊號當下（起漲四條、上影不長、止損距離 0.45%～3.2%），否則等待只會改判放棄；停利 1.5R 一次全出，否則 12 小時走。只描述訊號當時怎麼處理，不預測後面，也不自動開空。
      </p>
      <LockedBoard />
    </main>
  );
}
