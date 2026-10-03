"use client";
import { useEffect, useState } from "react";
import {
  AlertTriangle, Bot, Calculator, CheckCircle2, Lightbulb, ListChecks, Loader2, Sparkles, Clock, Frown, Inbox, Meh, PiggyBank, ShieldCheck, Smile, Timer, TrendingUp,
} from "lucide-react";
import type { DashboardTicket, Period, SentimentPoint } from "@/lib/mockData";
import { roi } from "@/lib/roi";

type Stats = {
  totalTickets: number;
  deflectionRate: number;
  deflected: number;
  savedHours: number;
  savedUsd: number;
  topics: Record<string, number>;
  aht: { withoutAi: number; withAi: number };
  openNow: number;
  live: { count: number; open: number };
  sla: {
    target: number;
    met: number;
    breaches: number;
    byPriority: { priority: string; label: string; firstResponse: string; resolution: string; tickets: number; met: number; medianFirstResponse: string }[];
  };
  sentiment: { series: SentimentPoint[]; share: Record<Sentiment, number>; index: number };
  tickets: DashboardTicket[];
  csat: { up: number; total: number };
};
type Sentiment = "positive" | "neutral" | "negative";

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "quarter", label: "Квартал" },
];
const PERIOD_TEXT: Record<Period, string> = { week: "за эту неделю", month: "за этот месяц", quarter: "за этот квартал" };
const TOPIC_COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)"];

const SENTIMENT: Record<Sentiment, { label: string; color: string; icon: typeof Smile; text: string }> = {
  positive: { label: "Позитив", color: "var(--color-sentiment-pos)", icon: Smile, text: "text-brand-700 dark:text-brand-300" },
  neutral: { label: "Нейтрально", color: "var(--color-sentiment-neu)", icon: Meh, text: "text-slate-600 dark:text-slate-300" },
  negative: { label: "Негатив", color: "var(--color-sentiment-neg)", icon: Frown, text: "text-rose-700 dark:text-rose-400" },
};
const SENTIMENT_ORDER: Sentiment[] = ["negative", "neutral", "positive"]; // снизу вверх: негатив у базовой линии

const STATUS: Record<DashboardTicket["status"], { label: string; cls: string }> = {
  auto_resolved: { label: "AI Auto-resolved", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  needs_review: { label: "Нужна проверка", cls: "bg-amber-500/10 text-amber-800 dark:text-amber-400" },
  closed: { label: "Завершён", cls: "bg-slate-500/10 text-slate-700 dark:text-slate-300" },
};
const PRIORITY_LABEL = { high: "Высокий", medium: "Средний", low: "Низкий" } as const;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => x.toLocaleString("ru-RU");

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("month");
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    // Живые обращения из панели оператора подтягиваются без перезагрузки страницы
    const load = () => fetch(`/api/analytics?period=${period}`).then((r) => r.json()).then(setS).catch(() => {});
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [period]);

  if (!s) return <p role="status" className="p-10 text-center text-slate-500">Загрузка…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Дашборд поддержки</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">{num(s.totalTickets)} обращений {PERIOD_TEXT[period]}</p>
        </div>
        <div role="group" aria-label="Период" className="flex rounded-xl bg-slate-200/70 p-1 dark:bg-white/5">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              aria-pressed={period === p.id}
              className={`min-h-9 rounded-lg px-3 text-sm font-medium transition ${
                period === p.id ? "bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <SummaryCard period={period} />

      {/* Hero-метрики */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-labelledby="saved" className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 p-6 text-white shadow-lg shadow-brand-700/20 lg:col-span-2">
          <div className="absolute -right-16 -top-16 size-64 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <div className="relative">
            <h2 id="saved" className="flex items-center gap-2 text-sm font-medium text-white/90"><PiggyBank className="size-4" aria-hidden /> Сэкономлено средств</h2>
            <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
              <span className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl">${s.savedUsd.toLocaleString("en-US")}</span>
              <span className="pb-2 text-xl font-medium text-white/90">/ {s.savedHours} часов {PERIOD_TEXT[period]}</span>
            </div>
            <p className="mt-4 max-w-xl text-sm text-white/90">
              {num(s.deflected)} тикетов закрыто AI без оператора × ({s.aht.withoutAi / 60} мин − {s.aht.withAi} сек) экономии на тикет.
            </p>
          </div>
        </section>

        <section aria-labelledby="deflection" className="card p-6">
          <h2 id="deflection" className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400"><Bot className="size-4" aria-hidden /> Deflection Rate</h2>
          <div className="mt-4 flex items-center gap-5">
            <div
              role="img"
              aria-label={`${pct(s.deflectionRate)} тикетов закрыто автоматически`}
              className="relative grid size-28 shrink-0 place-items-center rounded-full"
              style={{ background: `conic-gradient(#059669 ${s.deflectionRate * 360}deg, rgba(148,163,184,0.25) 0deg)` }}
            >
              <div className="grid size-20 place-items-center rounded-full bg-white dark:bg-[#0d1220]">
                <span className="font-display text-2xl font-bold">{pct(s.deflectionRate)}</span>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              тикетов закрыты автоматически, без участия оператора
              <span className="mt-2 flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400"><TrendingUp className="size-4" aria-hidden /> {num(s.deflected)} тикетов</span>
            </p>
          </div>
        </section>
      </div>

      {/* Плитки: тикеты и SLA */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile icon={Inbox} label="Тикетов за период" value={num(s.totalTickets)} />
        <Tile icon={Clock} label="Открыто сейчас" value={num(s.openNow)} />
        <Tile
          icon={s.sla.met >= s.sla.target ? ShieldCheck : AlertTriangle}
          label="Решено в рамках SLA"
          value={pct(s.sla.met)}
          note={s.sla.met >= s.sla.target ? `цель ${pct(s.sla.target)} · в норме` : `цель ${pct(s.sla.target)} · ниже цели`}
          tone={s.sla.met >= s.sla.target ? "good" : "warn"}
        />
        <Tile icon={AlertTriangle} label="Нарушений SLA" value={num(s.sla.breaches)} tone={s.sla.breaches > 0 ? "bad" : "good"} />
      </div>

      <RoiCard aht={s.aht} defaultDeflection={s.deflectionRate} />

      <div className="grid gap-4 lg:grid-cols-2">
        <SlaCard sla={s.sla} />
        <SentimentCard sentiment={s.sentiment} live={s.live.count} csat={s.csat} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TopicsCard topics={s.topics} />
        <AhtCard aht={s.aht} />
      </div>

      <TicketsTable tickets={s.tickets} />
    </div>
  );
}

function Tile({ icon: Icon, label, value, note, tone }: { icon: typeof Inbox; label: string; value: string; note?: string; tone?: "good" | "warn" | "bad" }) {
  const toneCls = { good: "text-emerald-700 dark:text-emerald-400", warn: "text-amber-800 dark:text-amber-400", bad: "text-rose-700 dark:text-rose-400" };
  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-sans text-sm font-medium text-slate-600 dark:text-slate-400">
        <Icon className={`size-4 ${tone ? toneCls[tone] : ""}`} aria-hidden /> {label}
      </h2>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
      {note && <p className={`mt-1 text-xs font-medium ${tone ? toneCls[tone] : ""}`}>{note}</p>}
    </section>
  );
}

type Summary = { headline: string; insights: string[]; actions: string[]; source: string; at: number };

function SummaryCard({ period }: { period: Period }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/summary", { method: "POST", body: JSON.stringify({ period }) }).catch(() => null);
    setLoading(false);
    if (!res?.ok) return setError(res?.status === 429 ? "Слишком часто — подождите минуту" : "Не удалось получить сводку");
    setSummary(await res.json());
  }

  return (
    <section aria-labelledby="summary-title" className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-brand-50 to-transparent px-6 py-4 dark:border-white/10 dark:from-brand-500/10">
        <h2 id="summary-title" className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-brand-600 dark:text-brand-400" aria-hidden /> Сводка для руководителя от AI
        </h2>
        <button onClick={generate} disabled={loading}
          className="flex min-h-9 items-center gap-2 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-70">
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {loading ? "Анализирую…" : summary ? "Обновить" : "Что случилось за период?"}
        </button>
      </div>
      <div aria-live="polite" className="px-6 py-4">
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
        {!summary && !error && (
          <p className="text-sm text-slate-600 dark:text-slate-400">AI прочитает метрики, SLA, настроение и сегодняшние обращения — и напишет, что важно и что делать завтра.</p>
        )}
        {summary && (
          <>
            <p className="font-display text-lg font-bold">{summary.headline}</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-1.5 flex items-center gap-1.5 font-sans text-sm font-semibold text-slate-700 dark:text-slate-300"><Lightbulb className="size-4" aria-hidden /> Что видим</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm">{summary.insights.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
              <div>
                <h3 className="mb-1.5 flex items-center gap-1.5 font-sans text-sm font-semibold text-slate-700 dark:text-slate-300"><ListChecks className="size-4" aria-hidden /> Что сделать</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm">{summary.actions.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
              {summary.source} · {new Date(summary.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} · цифры проверены по данным дашборда
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function RoiCard({ aht, defaultDeflection }: { aht: Stats["aht"]; defaultDeflection: number }) {
  const [tickets, setTickets] = useState(3000);
  const [salary, setSalary] = useState(350_000);
  const [deflection, setDeflection] = useState(Math.round(defaultDeflection * 100));
  const [aiCost, setAiCost] = useState(2); // ₸ за обращение, с запасом: LLM-запрос стоит доли тенге
  const r = roi({ ticketsPerMonth: tickets, deflection: deflection / 100, salaryPerMonth: salary, ahtWithoutSec: aht.withoutAi, ahtWithSec: aht.withAi, aiCostPerTicket: aiCost });
  const field = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-semibold focus:border-brand-600 dark:border-white/15 dark:bg-white/5";
  const tenge = (n: number) => n.toLocaleString("ru-RU") + " ₸";
  return (
    <section aria-labelledby="roi-title" className="card p-6">
      <h2 id="roi-title" className="flex items-center gap-2 font-semibold"><Calculator className="size-4 text-brand-600 dark:text-brand-400" aria-hidden /> Калькулятор ROI для вашего магазина</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">Подставьте свои цифры. Считаем консервативно — только тикеты, которые AI закрывает без оператора.</p>
      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <div>
            <label htmlFor="roi-tickets" className="mb-1.5 block text-sm font-medium">Обращений в месяц</label>
            <input id="roi-tickets" type="number" inputMode="numeric" min={0} step={100} value={tickets}
              onChange={(e) => setTickets(Math.max(0, Number(e.target.value) || 0))} className={field} />
          </div>
          <div>
            <label htmlFor="roi-salary" className="mb-1.5 block text-sm font-medium">Зарплата оператора, ₸ в месяц</label>
            <input id="roi-salary" type="number" inputMode="numeric" min={0} step={10_000} value={salary}
              onChange={(e) => setSalary(Math.max(0, Number(e.target.value) || 0))} className={field} />
          </div>
          <div>
            <label htmlFor="roi-deflection" className="mb-1.5 flex justify-between text-sm font-medium">
              <span>Доля обращений, закрытых AI</span><span>{deflection}%</span>
            </label>
            <input id="roi-deflection" type="range" min={20} max={85} value={deflection} aria-valuetext={`${deflection}%`}
              onChange={(e) => setDeflection(Number(e.target.value))} className="w-full accent-brand-600" />
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Сейчас у SupportPulse — {Math.round(defaultDeflection * 100)}%</p>
          </div>
          <div>
            <label htmlFor="roi-aicost" className="mb-1.5 block text-sm font-medium">Расход на AI, ₸ за обращение</label>
            <input id="roi-aicost" type="number" inputMode="decimal" min={0} step={0.5} value={aiCost}
              onChange={(e) => setAiCost(Math.max(0, Number(e.target.value) || 0))} className={field} />
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">LLM, распознавание голоса и сервер — с запасом. Считается по всем обращениям</p>
          </div>
        </div>
        <div aria-live="polite" className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-gradient-to-br from-brand-800 to-brand-600 p-5 text-white sm:col-span-2">
            <div className="text-sm text-white/90">Чистая экономия в месяц</div>
            <div className="font-display text-4xl font-extrabold tracking-tight">{tenge(r.moneySaved)}</div>
            <div className="mt-1 text-sm text-white/90">{tenge(r.moneySavedYear)} в год · уже за вычетом AI: {tenge(r.grossSaved)} − {tenge(r.aiCost)}</div>
          </div>
          <RoiStat label="Часов операторов освобождается" value={`${r.hoursSaved.toLocaleString("ru-RU")} ч`} />
          <RoiStat label="Это как ставка операторов" value={r.operatorsFreed.toLocaleString("ru-RU")} />
          <RoiStat label="Тикетов закрывает AI" value={r.deflected.toLocaleString("ru-RU")} />
          <RoiStat label="Ответ клиенту" value={`${aht.withAi} сек вместо ${aht.withoutAi / 60} мин`} />
        </div>
      </div>
    </section>
  );
}

const RoiStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/[0.04]">
    <div className="text-xs text-slate-600 dark:text-slate-400">{label}</div>
    <div className="mt-1 font-display text-xl font-bold">{value}</div>
  </div>
);

function SlaCard({ sla }: { sla: Stats["sla"] }) {
  return (
    <section aria-labelledby="sla-title" className="card p-6">
      <h2 id="sla-title" className="font-semibold">SLA по приоритетам</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">Доля тикетов, решённых в срок. Пунктир — цель {pct(sla.target)}.</p>
      <ul className="mt-5 space-y-5">
        {sla.byPriority.map((r) => {
          const ok = r.met >= sla.target;
          return (
            <li key={r.priority}>
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-medium">{r.label}</span>
                <span className={`flex items-center gap-1 font-semibold ${ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-400"}`}>
                  {ok ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}
                  {pct(r.met)} · {ok ? "в норме" : "ниже цели"}
                </span>
              </div>
              <div className="relative h-3 rounded-full bg-slate-100 dark:bg-white/5" role="img" aria-label={`${r.label} приоритет: ${pct(r.met)} в срок, цель ${pct(sla.target)}`}>
                <div className="h-full rounded-full bg-[var(--color-chart-1)]" style={{ width: pct(r.met) }} />
                <div className="absolute inset-y-[-3px] w-0 border-l-2 border-dashed border-slate-900 dark:border-white" style={{ left: pct(sla.target) }} />
              </div>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                {num(r.tickets)} тикетов · медиана первого ответа {r.medianFirstResponse} (норма {r.firstResponse}) · решение до {r.resolution}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SentimentCard({ sentiment, live, csat }: { sentiment: Stats["sentiment"]; live: number; csat: Stats["csat"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const series = sentiment.series;
  const idx = sentiment.index;
  return (
    <section aria-labelledby="sent-title" className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="sent-title" className="font-semibold">Настроение клиентов</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Тональность обращений по оценке AI</p>
        </div>
        <div className="text-right">
          <div className={`font-display text-2xl font-bold ${idx >= 0 ? "text-brand-700 dark:text-brand-300" : "text-rose-700 dark:text-rose-400"}`}>
            {idx > 0 ? "+" : ""}{idx}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">индекс настроения (−100…+100)</div>
          {csat.total > 0 && (
            <div className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              👍 ответ помог: {Math.round((csat.up / csat.total) * 100)}% из {csat.total} оценок
            </div>
          )}
        </div>
      </div>

      {/* Легенда: цвет никогда не несёт смысл один — рядом иконка и подпись */}
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {(["positive", "neutral", "negative"] as Sentiment[]).map((k) => {
          const S = SENTIMENT[k];
          return (
            <li key={k} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: S.color }} aria-hidden />
              <S.icon className={`size-4 ${S.text}`} aria-hidden />
              {S.label} <span className="text-slate-600 dark:text-slate-400">{pct(sentiment.share[k])}</span>
            </li>
          );
        })}
      </ul>

      {/* 100%-столбцы: негатив у базовой линии, чтобы его рост читался сразу */}
      <div className="relative mt-4 flex h-44 items-end gap-2" onMouseLeave={() => setHover(null)}>
        {series.map((d, i) => {
          const total = d.positive + d.neutral + d.negative;
          return (
            <button
              key={d.label}
              type="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${d.label}: позитив ${d.positive}, нейтрально ${d.neutral}, негатив ${d.negative}`}
              className="group flex h-full flex-1 flex-col-reverse gap-[2px] rounded-md"
            >
              {SENTIMENT_ORDER.map((k, j) => (
                <span
                  key={k}
                  className={`block w-full transition-opacity ${j === 0 ? "rounded-b-[4px]" : ""} ${j === 2 ? "rounded-t-[4px]" : ""} ${hover !== null && hover !== i ? "opacity-40" : ""}`}
                  style={{ height: `${(d[k] / total) * 100}%`, background: SENTIMENT[k].color }}
                />
              ))}
            </button>
          );
        })}
        {hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute -top-2 z-10 w-44 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-white/10 dark:bg-[#111827]"
            style={{ left: `${((hover + 0.5) / series.length) * 100}%` }}
          >
            <div className="mb-1 font-semibold">{series[hover].label}</div>
            {(["positive", "neutral", "negative"] as Sentiment[]).map((k) => (
              <div key={k} className="flex justify-between gap-2">
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: SENTIMENT[k].color }} />{SENTIMENT[k].label}</span>
                <span className="font-medium">{series[hover][k]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-2 flex gap-2 text-xs text-slate-600 dark:text-slate-400" aria-hidden>
        {series.map((d) => <span key={d.label} className={`flex-1 truncate text-center ${d.label === "Live" ? "font-semibold text-brand-700 dark:text-brand-300" : ""}`}>{d.label}</span>)}
      </div>
      {live > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          <span className="relative flex size-2" aria-hidden><span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-brand-600" /></span>
          «Live» — {live} {live === 1 ? "обращение" : live < 5 ? "обращения" : "обращений"}, тональность которых определил агент в панели оператора
        </p>
      )}

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer rounded text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Показать таблицей</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-xs text-slate-600 dark:text-slate-400">
            <tr><th scope="col" className="py-1 font-medium">Период</th><th scope="col" className="font-medium">Позитив</th><th scope="col" className="font-medium">Нейтрально</th><th scope="col" className="font-medium">Негатив</th></tr>
          </thead>
          <tbody>
            {series.map((d) => (
              <tr key={d.label} className="border-t border-slate-200 dark:border-white/10">
                <th scope="row" className="py-1 font-normal">{d.label}</th><td>{d.positive}</td><td>{d.neutral}</td><td>{d.negative}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function TopicsCard({ topics: t }: { topics: Record<string, number> }) {
  const topics = Object.entries(t);
  const total = topics.reduce((a, [, v]) => a + v, 0);
  let acc = 0;
  // 2px зазор цвета карточки между сегментами
  const conic = topics
    .map(([, v], i) => {
      const from = (acc / total) * 360;
      acc += v;
      const to = (acc / total) * 360;
      return `${TOPIC_COLORS[i]} ${from}deg ${to - 1}deg, transparent ${to - 1}deg ${to}deg`;
    })
    .join(", ");
  return (
    <section aria-labelledby="topics-title" className="card p-6">
      <h2 id="topics-title" className="font-semibold">Обращения по темам</h2>
      <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
        <div className="relative grid size-44 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${conic})` }} aria-hidden>
          <div className="grid size-28 place-items-center rounded-full bg-white text-center dark:bg-[#0d1220]">
            <div><div className="font-display text-xl font-bold">{num(total)}</div><div className="text-xs text-slate-600 dark:text-slate-400">тикетов</div></div>
          </div>
        </div>
        <ul className="w-full space-y-3">
          {topics.map(([name, v], i) => (
            <li key={name}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: TOPIC_COLORS[i] }} aria-hidden />{name}</span>
                <span className="text-slate-600 dark:text-slate-400">{num(v)} · {Math.round((v / total) * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${(v / total) * 100}%`, background: TOPIC_COLORS[i] }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AhtCard({ aht }: { aht: Stats["aht"] }) {
  return (
    <section aria-labelledby="aht-title" className="card p-6">
      <h2 id="aht-title" className="font-semibold">Среднее время обработки (AHT)</h2>
      <div className="mt-6 space-y-6">
        <AhtBar icon={<Clock className="size-4" aria-hidden />} label="Без AI" value={`${aht.withoutAi / 60} мин`} width={100} cls="bg-slate-400 dark:bg-slate-500" />
        <AhtBar icon={<Timer className="size-4" aria-hidden />} label="С SupportPulse AI" value={`${aht.withAi} сек`} width={(aht.withAi / aht.withoutAi) * 100} cls="bg-brand-600 dark:bg-brand-500" />
      </div>
      <p className="mt-6 rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-300">
        Обработка быстрее в <b>{(aht.withoutAi / aht.withAi).toFixed(1)}×</b> — оператор только проверяет черновик и нажимает действие.
      </p>
    </section>
  );
}

function AhtBar({ icon, label, value, width, cls }: { icon: React.ReactNode; label: string; value: string; width: number; cls: string }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300">{icon}{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="h-8 rounded-lg bg-slate-100 dark:bg-white/5" aria-hidden>
        <div className={`h-full rounded-r-[4px] rounded-l-lg ${cls}`} style={{ width: `${Math.max(width, 3)}%` }} />
      </div>
    </div>
  );
}

function TicketsTable({ tickets }: { tickets: DashboardTicket[] }) {
  return (
    <section aria-labelledby="tickets-title" className="card overflow-hidden">
      <div className="p-6 pb-3">
        <h2 id="tickets-title" className="font-semibold">Последние тикеты</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">Сортировка по времени до нарушения SLA · <span className="font-semibold text-brand-700 dark:text-brand-300">LIVE</span> — обработаны агентом сейчас, остальные из демо-истории</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600 dark:bg-white/[0.03] dark:text-slate-400">
            <tr>
              {["Тикет", "Клиент", "Тема", "Приоритет", "Настроение", "Статус", "SLA"].map((h) => (
                <th key={h} scope="col" className="px-6 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-white/10">
            {[...tickets].sort((a, b) => a.slaLeftMin - b.slaLeftMin).map((t) => {
              const S = SENTIMENT[t.sentiment];

              return (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                  <th scope="row" className="px-6 py-3 font-medium">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      {t.id}
                      {t.live && <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-wide text-white">live</span>}
                    </span>
                  </th>
                  <td className="px-6 py-3">{t.customer}</td>
                  <td className="px-6 py-3">{t.topic}</td>
                  <td className="px-6 py-3">{PRIORITY_LABEL[t.priority]}</td>
                  <td className={`px-6 py-3 ${S.text}`}><span className="flex items-center gap-1.5"><S.icon className="size-4" aria-hidden />{S.label}</span></td>
                  <td className="px-6 py-3"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span></td>
                  <td className="px-6 py-3"><SlaLeft min={t.slaLeftMin} status={t.status} responded={t.responded} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SlaLeft({ min, status, responded }: { min: number; status: DashboardTicket["status"]; responded?: boolean }) {
  if (status === "needs_review" && responded)
    return <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" aria-hidden />ответ дан, ждём клиента</span>;
  if (status !== "needs_review") return <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" aria-hidden />в срок</span>;
  if (min < 0) return <span className="flex items-center gap-1.5 font-semibold text-rose-700 dark:text-rose-400"><AlertTriangle className="size-4" aria-hidden />нарушен, {-min} мин</span>;
  if (min <= 15) return <span className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-400"><Clock className="size-4" aria-hidden />осталось {min} мин</span>;
  return <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300"><Clock className="size-4" aria-hidden />осталось {min} мин</span>;
}
