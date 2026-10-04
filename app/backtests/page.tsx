import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "回測 · 盯盤哨兵" };

export default function BacktestsPage() {
  return (
    <main>
      <h1>回測</h1>
      <p className="lead">
        舊的 quiet_surge 全市場模擬已從這個網站拿掉，不再當訊號展示。
        現在只保留鎖定規則的結果。
      </p>
      <p>
        <Link href="/signals">看 P12_z278 鎖定訊號 →</Link>
      </p>
    </main>
  );
}
