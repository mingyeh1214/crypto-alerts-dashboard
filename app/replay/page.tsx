import type { Metadata } from "next";
import { ReplayLab } from "./ReplayLab";

export const metadata: Metadata = { title: "參數回測 · 盯盤哨兵" };

export default function ReplayPage() {
  return (
    <main>
      <h1>參數回測</h1>
      <p className="lead">
        用資料庫裡的現貨 1 分 K，加上已寫入的 5 分合約 OI，依你調的門檻重跑安靜後放量。
        價格仍是逐分鐘；OI 沒有 1 分歷史，所以 z 與 1 小時方向用「剛走完的那根 5 分」，
        而且只記在該 5 分的最後一分鐘，避免用到未來的張數。
      </p>
      <ReplayLab />
    </main>
  );
}
