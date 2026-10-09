"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "規則" },
  { href: "/signals", label: "訊號" },
  { href: "/live", label: "即時" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="top">
      <div className="brand">
        <strong>盯盤哨兵</strong>
        <span>研究規則 · 合約 5 分 K 爆量＋未平倉確認</span>
      </div>
      <nav>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={path === l.href ? "active" : ""}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
