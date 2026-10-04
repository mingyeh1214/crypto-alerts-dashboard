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
        舊的 quiet_surge、箱型與量價訊號已從這頁拿掉。
      </p>
      <LockedBoard />
    </main>
  );
}
