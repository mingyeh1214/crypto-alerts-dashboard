import type { Metadata } from "next";
import { LiveBoard } from "./LiveBoard";

export const metadata: Metadata = { title: "即時 · 盯盤哨兵" };

export default function LivePage() {
  return (
    <main>
      <h1>即時狀態</h1>
      <p className="lead">
        Railway worker 只跑研究規則：每 5 分鐘在合約 5 分 K 收盤後掃一次有現貨的永續，第一層過了就等主動買賣比公布再確認，
        爆量收盤後 15 分鐘用未平倉觀察窗判斷，通過才發 Telegram。K 線、未平倉、多空比、溢價指數和資金費率照常寫進資料庫。
        這頁每 10 秒更新，不負責下單。
      </p>
      <LiveBoard />
    </main>
  );
}
