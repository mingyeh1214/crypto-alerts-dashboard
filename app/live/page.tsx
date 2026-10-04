import type { Metadata } from "next";
import { LiveBoard } from "./LiveBoard";

export const metadata: Metadata = { title: "即時 · 盯盤哨兵" };

export default function LivePage() {
  return (
    <main>
      <h1>即時狀態</h1>
      <p className="lead">
        Railway 上的 worker 心跳、啟用規則數、進場後追蹤，以及最近寫入資料庫的警報。
        這台 worker 仍是 quiet_surge_early（1 分收盤，追蹤先 +5 分再 +15 分），還沒切到網站上的 P12_z278。
        這頁不負責下單，也不改規則。
      </p>
      <LiveBoard />
    </main>
  );
}
