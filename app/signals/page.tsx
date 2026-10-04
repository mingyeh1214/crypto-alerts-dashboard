import type { Metadata } from "next";
import { LockedBoard } from "./LockedBoard";
import { SignalLog } from "./SignalLog";

export const metadata: Metadata = { title: "訊號紀錄 · 盯盤哨兵" };

export default function SignalsPage() {
  return (
    <main>
      <h1>鎖定訊號</h1>
      <p className="lead">
        P12_z278 ＋ 15 分 ATR 0.8%～2.5% ＋ 資金費率不低於 −0.10% ＋ 同幣冷卻 24 小時。
        K 線用幣安現貨（1 分到 4 小時），琥珀色箭頭標在訊號那一根。
      </p>
      <LockedBoard />
      <details className="fold">
        <summary>舊版 quiet_surge_early 紀錄（線上 worker 仍是這套）</summary>
        <p className="lead">
          這段是改鎖定規則之前的 15 分模擬與即時進場，用來對照，不是現在這張 432 筆的口徑。
        </p>
        <SignalLog />
      </details>
    </main>
  );
}
