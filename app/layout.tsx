import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "盯盤哨兵",
  description: "幣安 USDT 永續：交接手冊研究規則（5 分 K 爆量十項條件＋未平倉 Mann-Kendall 確認）的訊號與即時狀態。僅供參考。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <div className="shell">
          <Nav />
          {children}
        </div>
      </body>
    </html>
  );
}
