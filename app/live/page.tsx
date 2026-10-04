import type { Metadata } from "next";
import { LiveBoard } from "./LiveBoard";

export const metadata: Metadata = { title: "即時 · 盯盤哨兵" };

export default function LivePage() {
  return (
    <main>
      <h1>即時狀態</h1>
      <p className="lead">
        Railway worker 現在只跑鎖定規則 P12_z278（含 15 分 ATR 0.8–2.5、資金費率不低於 −0.10%、同幣 24 小時冷卻）。
        每分鐘把現貨 1 分 K 寫進資料庫，並持續更新 5 分 OI 與已結算資金費率。這頁的時鐘每秒走、警報每 5 秒更新，不負責下單。
      </p>
      <LiveBoard />
    </main>
  );
}
