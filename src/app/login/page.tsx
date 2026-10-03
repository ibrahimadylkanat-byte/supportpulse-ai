"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Bot, Eye, EyeOff, Loader2, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

type Errors = { email?: string; password?: string };

// ponytail: демо-вход без бэкенда — любая валидная пара пускает в панель. Реальная авторизация — NextAuth/Clerk.
export default function Login() {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwdRef = useRef<HTMLInputElement>(null);

  function validate(form: FormData): Errors {
    const e: Errors = {};
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email) e.email = "Введите рабочий e-mail";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Проверьте формат e-mail: например, name@company.kz";
    if (!password) e.password = "Введите пароль";
    else if (password.length < 6) e.password = "Пароль — не короче 6 символов";
    return e;
  }

  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const e = validate(new FormData(ev.currentTarget));
    setErrors(e);
    // Фокус на первое поле с ошибкой — экранный диктор сразу зачитает её текст
    if (e.email) return emailRef.current?.focus();
    if (e.password) return pwdRef.current?.focus();
    setLoading(true);
    router.push("/");
  }

  const input =
    "h-11 w-full rounded-xl border bg-white px-3.5 text-[15px] text-slate-900 placeholder:text-slate-500 transition " +
    "focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/15 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-400";
  const border = (bad?: string) => (bad ? "border-rose-600 dark:border-rose-400" : "border-slate-300 dark:border-white/15");

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Бренд-панель */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-sky-400/20 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-brand-400/20 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25"><Sparkles className="size-5" aria-hidden /></div>
          <span className="font-display text-lg font-bold">SupportPulse AI</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">Поддержка, которая отвечает раньше, чем клиент успеет занервничать</h2>
          <ul className="mt-8 space-y-4 text-white/90">
            {[
              { icon: Bot, text: "62% обращений AI закрывает сам — статус заказа, ПВЗ, сроки" },
              { icon: Zap, text: "Черновик ответа и действие в 1 клик для сложных случаев" },
              { icon: ShieldCheck, text: "SLA и настроение клиентов на одном дашборде" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/15"><Icon className="size-4" aria-hidden /></span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <figure className="relative max-w-md rounded-2xl bg-white/10 p-5 ring-1 ring-white/20 backdrop-blur">
          <blockquote className="text-sm leading-relaxed text-white/95">«Время ответа упало с 4,5 минут до 25 секунд. Операторы наконец занимаются сложными кейсами, а не трек-номерами.»</blockquote>
          <figcaption className="mt-3 text-xs text-white/80">Руководитель поддержки, fashion e-commerce · демо-отзыв</figcaption>
        </figure>
      </aside>

      {/* Форма */}
      <main className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 lg:invisible">
            <div className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white"><Sparkles className="size-5" aria-hidden /></div>
            <span className="font-display font-bold">SupportPulse AI</span>
          </div>
          <ThemeToggle />
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-bold tracking-tight">Вход для операторов</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">Войдите, чтобы открыть панель обращений.</p>

          <form noValidate onSubmit={onSubmit} className="mt-8 space-y-5" aria-describedby="demo-hint">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Рабочий e-mail</label>
              <input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                required
                placeholder="name@company.kz"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
                className={`${input} ${border(errors.email)}`}
              />
              {errors.email && (
                <p id="email-error" className="mt-1.5 flex items-center gap-1.5 text-sm text-rose-700 dark:text-rose-400">
                  <AlertCircle className="size-4 shrink-0" aria-hidden /> {errors.email}
                </p>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">Пароль</label>
                <a href="mailto:admin@supportpulse.demo?subject=Сброс пароля" className="rounded text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                  Забыли пароль?
                </a>
              </div>
              <div className="relative">
                <input
                  ref={pwdRef}
                  id="password"
                  name="password"
                  type={showPwd ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "password-error" : undefined}
                  className={`${input} ${border(errors.password)} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label="Показать пароль"
                  aria-pressed={showPwd}
                  className="absolute right-0.5 top-0.5 grid size-10 place-items-center rounded-lg text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  {showPwd ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="mt-1.5 flex items-center gap-1.5 text-sm text-rose-700 dark:text-rose-400">
                  <AlertCircle className="size-4 shrink-0" aria-hidden /> {errors.password}
                </p>
              )}
            </div>

            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
              <input type="checkbox" name="remember" className="size-4 rounded accent-brand-600" />
              Запомнить меня на этом устройстве
            </label>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 font-semibold text-white shadow-md shadow-brand-600/25 transition hover:bg-brand-700 disabled:opacity-70"
            >
              {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {loading ? "Входим…" : "Войти"}
            </button>
          </form>

          <p id="demo-hint" className="mt-6 rounded-xl bg-brand-50 p-3 text-sm text-brand-900 dark:bg-brand-500/10 dark:text-brand-200">
            Демо-режим: подойдёт любой e-mail и пароль от 6 символов.
          </p>
        </div>

        <p className="text-center text-xs text-slate-600 dark:text-slate-400">© 2026 SupportPulse AI</p>
      </main>
    </div>
  );
}
