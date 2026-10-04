import type { Metadata } from "next";
import { SimBoard } from "./SimBoard";

export const metadata: Metadata = { title: "模擬帳戶 · 盯盤哨兵" };

export default function SimPage() {
  return (
    <main>
      <h1>模擬帳戶</h1>
      <p className="lead">
        從 2026 年 9 月的鎖定訊號開始，本金 1000 USDT，只做多。上面兩套是把九月整個月看完之後才挑出來的樣本內做法，用來對帳，不是事前就定死的規則。最下面保留原先那套當下選樣，那套不是事後挑出來的。三套都沒有用 Score，也沒有用後來才知道的最大漲跌。這不是實盤。
      </p>
      <SimBoard />
    </main>
  );
}
