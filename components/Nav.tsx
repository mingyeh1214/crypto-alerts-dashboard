"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "總覽" },
  { href: "/strategy", label: "策略" },
  { href: "/backtests", label: "回測" },
  { href: "/live", label: "即時" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="top">
      <div className="brand">
        <strong>盯盤哨兵</strong>
        <span>安靜後放量初期 ＋ 合約 OI</span>
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
