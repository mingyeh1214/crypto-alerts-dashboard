import type { Metadata } from "next";
import { SimBoard } from "./SimBoard";

export const metadata: Metadata = { title: "模擬帳戶 · 盯盤哨兵" };

export default function SimPage() {
  return (
    <main>
      <h1>模擬帳戶</h1>
      <p className="lead">
        從 2026 年 9 月的鎖定訊號開始，用 1000 USDT 紙上做多。進場只看訊號當下和之後 3 根 1 分 K，不用 Score，也不看後來的最大漲跌。這不是實盤。
      </p>
      <SimBoard />
    </main>
  );
}
