import type { Metadata } from "next";
import { SignalLog } from "./SignalLog";

export const metadata: Metadata = { title: "訊號紀錄 · 盯盤哨兵" };

export default function SignalsPage() {
  return (
    <main>
      <h1>訊號／紀錄</h1>
      <p className="lead">
        安靜後放量初期（quiet_surge_early，含合約 OI）從台北 2026-09-01 到現在的每一筆。
        9 月到回測截止日來自全市場模擬；之後 worker 寫進資料庫的進場會每分鐘併進來，不用重新部署。
      </p>
      <SignalLog />
    </main>
  );
}
