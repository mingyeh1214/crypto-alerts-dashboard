"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "總覽" },
  { href: "/replay", label: "參數" },
  { href: "/signals", label: "訊號" },
  { href: "/live", label: "即時" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="top">
      <div className="brand">
        <strong>盯盤哨兵</strong>
        <span>P12_z278 · 現貨 USDT</span>
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
