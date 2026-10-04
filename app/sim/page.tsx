import type { Metadata } from "next";
import { SimBoard } from "./SimBoard";

export const metadata: Metadata = { title: "模擬帳戶 · 盯盤哨兵" };

export default function SimPage() {
  return (
    <main>
      <h1>模擬帳戶</h1>
      <p className="lead">
        從 2026 年 9 月的鎖定訊號開始，本金 1000 USDT，只做多。最上面是一小時手冊：只在訊號當下進場，等待只會改判放棄，停利 1.5R 一次全出，否則 12 小時走。接著是可以長期照著做的版本：訊號只是候補，環境、趨勢、結構過了才進。再下面兩套是把九月整個月看完才挑出來的樣本內做法，用來對帳。最後保留原先那套當下選樣。都沒有用 Score，也沒有用後來才知道的最大漲跌。這不是實盤。
      </p>
      <SimBoard />
    </main>
  );
}
