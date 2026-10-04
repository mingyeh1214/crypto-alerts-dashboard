import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "參數 · 盯盤哨兵" };

export default function ReplayPage() {
  return (
    <main>
      <h1>參數</h1>
      <p className="lead">
        舊的「安靜後放量」參數實驗室已關閉。線上不再接受那套門檻。
        鎖定規則是固定的 P12_z278，不在這頁重跑。
      </p>
      <p>
        <Link href="/signals">看鎖定訊號 →</Link>
      </p>
    </main>
  );
}
