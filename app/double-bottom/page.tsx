import type { Metadata } from "next";
import { DoubleBottomBoard } from "./DoubleBottomBoard";

export const metadata: Metadata = { title: "雙底掃描 · 盯盤哨兵" };

export default function DoubleBottomPage() {
  return (
    <main>
      <h1>15 分 K 雙底掃描</h1>
      <p className="lead">
        每根 15 分 K 收盤後約 1–2 分鐘，Railway worker 用資料庫裡的合約 1 分 K（重採樣成 15 分 K）掃描全部 528 個 USDT 永續，找出最近 24 小時內的雙底形態，分成「已突破」和「形成中」兩份清單。
        這只是<b>形態偵測</b>，不是買進訊號，也沒有回測過準確率；請自行判斷。點一列可在上方看 15 分 K 線，標出 L1、H、L2、頸線和突破點。
      </p>
      <DoubleBottomBoard />
    </main>
  );
}
