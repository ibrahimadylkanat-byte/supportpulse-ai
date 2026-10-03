"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Headset } from "lucide-react";

const links = [
  { href: "/", label: "Панель оператора", icon: Headset },
  { href: "/analytics", label: "Дашборд", icon: BarChart3 },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Основная навигация" className="flex gap-1">
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href ? "page" : undefined}
          aria-label={label}
          className={`flex items-center gap-2 min-h-10 rounded-xl px-3 py-2 text-sm font-medium transition ${
            path === href
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          }`}
        >
          <Icon className="size-4" aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
