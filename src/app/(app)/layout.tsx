import Link from "next/link";
import { LogOut, MessageCircle, Sparkles } from "lucide-react";
import { Nav } from "@/components/Nav";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow">
        Перейти к содержимому
      </a>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-[#070b17]/80">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg">
            <div className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-600/25">
              <Sparkles className="size-5" aria-hidden />
            </div>
            <div className="leading-tight">
              <div className="font-display font-bold">SupportPulse <span className="grad-text">AI</span></div>
              <div className="text-xs text-slate-500 dark:text-slate-400">E-commerce support copilot</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Nav />
            <a href="/chat" target="_blank" rel="noopener" aria-label="Открыть чат клиента (в новой вкладке)" title="Чат клиента"
              className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10">
              <MessageCircle className="size-4" aria-hidden />
            </a>
            <ThemeToggle />
            <Link href="/login" aria-label="Выйти" title="Выйти"
              className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10">
              <LogOut className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1600px] px-4 py-5">{children}</main>
    </>
  );
}
