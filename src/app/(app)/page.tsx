"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot, CheckCircle2, CircleAlert, Clock, Flame, Loader2, MapPin, MessageCircle, Mic, Package, Phone, Send,
  ShieldCheck, Sparkles, Truck, User, Wand2, Zap, BookOpen, Plus,
} from "lucide-react";
import type { AgentResult, QuickAction } from "@/lib/agent";
import type { Channel, Ticket } from "@/lib/ticketStore";
import { demoScenarios, type AgentInput } from "@/lib/mockData";

type Status = Ticket["status"];
type Msg = { from: "customer" | "ai" | "operator" | "system"; text: string; at: string; voice?: boolean; image?: string };
type Conversation = Omit<Ticket, "messages"> & {
  messages: Msg[];
  draft: string;
  done: string[]; // выполненные быстрые действия
  urgent: boolean;
};

const FILTERS: { id: Status | "all"; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "auto_resolved", label: "AI Auto-resolved" },
  { id: "needs_review", label: "Нужна проверка" },
  { id: "closed", label: "Завершён" },
];

const STATUS_BADGE: Record<Status, { label: string; cls: string }> = {
  auto_resolved: { label: "AI Auto-resolved", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  needs_review: { label: "Нужна проверка", cls: "bg-amber-500/10 text-amber-800 dark:text-amber-400" },
  closed: { label: "Завершён", cls: "bg-slate-500/10 text-slate-700 dark:text-slate-400" },
};

const CHANNEL_LABEL: Record<Channel, string> = { demo: "Демо", chat: "Чат на сайте", telegram: "Telegram" };

const URGENCY: Record<string, string> = {
  low: "text-emerald-700 dark:text-emerald-400",
  medium: "text-amber-800 dark:text-amber-400",
  high: "text-rose-700 dark:text-rose-400",
};

const URGENCY_LABEL: Record<string, string> = { low: "низкая", medium: "средняя", high: "высокая" };
const INTENT_LABEL: Record<string, string> = {
  order_status_check: "Статус заказа", return_request: "Возврат", order_change: "Изменение заказа", general_faq: "Общий вопрос",
};
const SENTIMENT_LABEL: Record<string, { label: string; cls: string }> = {
  positive: { label: "позитив", cls: "text-brand-700 dark:text-brand-300" },
  neutral: { label: "нейтрально", cls: "" },
  negative: { label: "негатив", cls: "text-rose-700 dark:text-rose-400" },
};

const time = (at: number) => new Date(at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const money = (n: number) => n.toLocaleString("ru-RU") + " ₸";

/** Срочно: ждёт оператора и клиент недоволен или срочность высокая. */
const isUrgent = (t: Ticket) => t.status === "needs_review" && !t.responded && (t.result.urgency === "high" || t.result.sentiment === "negative");

/** Очередь: срочные → остальные ждущие (кто дольше ждёт — выше) → обработанные (свежие выше). */
function byPriority(a: Ticket, b: Ticket) {
  const rank = (t: Ticket) => (isUrgent(t) ? 0 : t.status === "needs_review" ? 1 : 2);
  return rank(a) - rank(b) || (rank(a) < 2 ? a.waitingSince - b.waitingSince : b.waitingSince - a.waitingSince);
}

export default function Workspace() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, string[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [announce, setAnnounce] = useState("");
  const known = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const res = await fetch("/api/tickets").catch(() => null);
    if (!res?.ok) return;
    const list: Ticket[] = await res.json();
    // Объявляем скринридеру новые обращения из живых каналов
    const fresh = list.filter((t) => t.channel !== "demo" && !known.current.has(t.id));
    if (known.current.size && fresh.length) setAnnounce(`Новое обращение: ${fresh.map((t) => t.customer).join(", ")}`);
    list.forEach((t) => known.current.add(t.id));
    setTickets(list);
  }, []);

  const seeded = useRef(false); // StrictMode в dev запускает эффект дважды
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    // Демо-сценарии создаются один раз: перезагрузка панели не сбрасывает статусы и не тратит квоту LLM
    (async () => {
      const existing: Ticket[] = await fetch("/api/tickets").then((r) => r.json()).catch(() => []);
      // Создаём только те демо-сценарии, которых ещё нет — новые добавятся, старые не сбросятся
      const have = new Set(existing.filter((t) => t.channel === "demo").map((t) => t.messages[0]?.text));
      const missing = demoScenarios.filter((s) => !have.has(s.input.message));
      await Promise.all(missing.map((s) => fetch("/api/agent", { method: "POST", body: JSON.stringify(s.input) }).catch(() => {})));
      await refresh();
    })();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Черновик привязан к последнему сообщению клиента: на новое сообщение — новый черновик от AI
  const draftKey = (t: { id: string; waitingSince: number }) => `${t.id}:${t.waitingSince}`;
  const convs: Conversation[] = [...(tickets ?? [])].sort(byPriority).map((t) => ({
    ...t,
    messages: t.messages.map((m) => ({ ...m, at: time(m.at) })),
    draft: drafts[draftKey(t)] ?? (t.status === "needs_review" && !t.responded ? t.result.reply : ""),
    done: done[t.id] ?? [],
    urgent: isUrgent(t),
  }));

  const active = convs.find((c) => c.id === activeId) ?? convs[0];
  const visible = convs.filter((c) => filter === "all" || c.status === filter);
  const count = (s: Status | "all") => (s === "all" ? convs.length : convs.filter((c) => c.status === s).length);
  const setDraft = (c: Conversation, d: string) => setDrafts((x) => ({ ...x, [draftKey(c)]: d }));

  async function ingest(input: AgentInput) {
    const res = await fetch("/api/agent", { method: "POST", body: JSON.stringify(input) });
    const j = await res.json();
    await refresh();
    return res.ok ? (j.ticketId as string) : null;
  }

  // Ответ оператора: тикет закрывается, только если оператор отметил, что проблема решена
  async function sendDraft(resolved: boolean) {
    if (!active) return;
    const text = active.draft.trim();
    if (!text && !resolved) return;
    setDraft(active, "");
    const res = await fetch("/api/tickets", { method: "POST", body: JSON.stringify({ id: active.id, text, resolved }) });
    setAnnounce(
      res.ok ? (resolved ? "Тикет закрыт" : "Ответ отправлен, тикет открыт")
        : res.status === 409 ? "Этот ответ уже отправлен — возможно, другим оператором" : "Не удалось отправить ответ",
    );
    await refresh();
  }

  async function runAction(a: QuickAction) {
    if (!active) return;
    setBusyAction(a.id);
    const res = await fetch("/api/actions", {
      method: "POST",
      body: JSON.stringify({ action: a.id, order_id: active.result.order?.id, track: active.result.shipment?.track, ticket_id: active.id }),
    });
    setBusyAction(null);
    if (res.ok) setDone((x) => ({ ...x, [active.id]: [...(x[active.id] ?? []), a.id] }));
    await refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_360px]">
      {/* Список диалогов */}
      <section aria-labelledby="dialogs-title" className="card flex flex-col overflow-hidden lg:h-[calc(100vh-110px)]">
        <div className="flex items-center justify-between border-b border-slate-200/70 p-4 dark:border-white/10">
          <h2 id="dialogs-title" className="font-semibold">Диалоги</h2>
          <button
            onClick={() => setShowNew((v) => !v)}
            aria-expanded={showNew}
            aria-controls="new-ticket"
            className="flex min-h-9 items-center gap-1 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white shadow-md shadow-brand-600/25 hover:bg-brand-700"
          >
            <Plus className="size-4" aria-hidden /> Обращение
          </button>
        </div>
        {showNew && (
          <NewTicket
            onCancel={() => setShowNew(false)}
            onSubmit={async (_cust, input) => { setShowNew(false); setAnnounce("Обращение отправлено в AI"); const id = await ingest(input); if (id) setActiveId(id); }}
          />
        )}
        <p role="status" className="sr-only">{announce}</p>
        <div role="group" aria-label="Фильтр по статусу" className="flex flex-wrap gap-1.5 p-3">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`min-h-8 rounded-full px-3 text-xs font-medium transition ${
                filter === f.id ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              }`}
            >
              {f.label} <span className="opacity-60">{count(f.id)}</span>
            </button>
          ))}
        </div>
        <ul aria-label="Список диалогов" className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          {visible.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setActiveId(c.id)}
                aria-current={active?.id === c.id ? "true" : undefined}
                className={`w-full rounded-xl p-3 text-left transition ${c.urgent ? "border-l-4 border-rose-600 dark:border-rose-400 " : ""}${
                  active?.id === c.id ? "bg-brand-500/10 ring-1 ring-brand-500/40" : "hover:bg-slate-100 dark:hover:bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{c.customer}</span>
                    {c.urgent && (
                      <span className="flex shrink-0 items-center gap-0.5 rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
                        <Flame className="size-3" /> Срочно
                      </span>
                    )}
                  </span>
                  {c.status ? (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[c.status].cls}`}>
                      {STATUS_BADGE[c.status].label}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                      <Loader2 className="size-3.5 animate-spin text-brand-600" aria-hidden /> анализ
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{c.input.message}</p>
                {c.channel !== "demo" && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-brand-300">
                    <MessageCircle className="size-3" /> {CHANNEL_LABEL[c.channel]}
                  </p>
                )}
                {c.result && (
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span>{c.result.topic}</span><span aria-hidden>·</span><span className={URGENCY[c.result.urgency]}>срочность: {URGENCY_LABEL[c.result.urgency]}</span>
                  </div>
                )}
              </button>
            </li>
          ))}
          {visible.length === 0 && <li className="p-6 text-center text-sm text-slate-500">Нет диалогов</li>}
        </ul>
      </section>

      {/* Чат + AI черновик */}
      <section className="card flex flex-col overflow-hidden lg:h-[calc(100vh-110px)]">
        {!active ? (
          <div className="grid flex-1 place-items-center text-slate-500"><Loader2 className="animate-spin" /></div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-slate-200/70 p-4 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-full bg-slate-200 dark:bg-white/10"><User className="size-4" /></div>
                <div>
                  <div className="font-semibold">{active.customer}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">{CHANNEL_LABEL[active.channel]} · {active.result.lookup ?? "заказ не определён"}</div>
                </div>
              </div>
              {active.status && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[active.status].cls}`}>{STATUS_BADGE[active.status].label}</span>}
            </div>

            <div role="log" aria-label={`Переписка с клиентом ${active.customer}`} tabIndex={0} className="flex-1 space-y-3 overflow-y-auto p-4">
              {active.messages.map((m, i) => <Bubble key={i} m={m} />)}
              {!active.result && (
                <p role="status" className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"><Loader2 className="size-4 animate-spin" aria-hidden /> AI анализирует обращение…</p>
              )}
            </div>

            {active.result && <AiCard key={active.id} c={active} busy={busyAction} onDraft={(d) => setDraft(active, d)} onSend={sendDraft} onAction={runAction} />}
          </>
        )}
      </section>

      {/* Заказ */}
      <aside className="space-y-4 lg:col-span-2 xl:col-span-1 xl:h-[calc(100vh-110px)] xl:overflow-y-auto">
        <OrderPanel r={active?.result} />
      </aside>
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  if (m.from === "system")
    return <div className="mx-auto w-fit rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">{m.text}</div>;
  const mine = m.from !== "customer";
  return (
    <div className={`flex ${mine ? "justify-end" : ""}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
          mine
            ? m.from === "ai"
              ? "rounded-br-sm bg-brand-600 text-white"
              : "rounded-br-sm bg-slate-900 text-white dark:bg-white dark:text-slate-900"
            : "rounded-bl-sm bg-slate-100 dark:bg-white/[0.07]"
        }`}
      >
        {mine && (
          <div className="mb-1 flex items-center gap-1 text-xs font-semibold opacity-80">
            {m.from === "ai" ? <><Bot className="size-3" /> SupportPulse AI · авто-ответ</> : <><User className="size-3" /> Оператор</>}
          </div>
        )}
        {m.image && <img src={m.image} alt="Фото от клиента" className="mb-1.5 max-h-56 rounded-xl" />}
        {m.voice && <div className="mb-0.5 flex items-center gap-1 text-xs font-medium opacity-80"><Mic className="size-3" /> Голосовое, расшифровка Whisper:</div>}
        {!(m.image && m.text === "📷 Фото") && <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>}
        <div className="mt-1 text-right text-xs opacity-60">{m.at}</div>
      </div>
    </div>
  );
}

function AiCard({ c, busy, onDraft, onSend, onAction }: {
  c: Conversation; busy: string | null; onDraft: (d: string) => void; onSend: (resolved: boolean) => void; onAction: (a: QuickAction) => void;
}) {
  const [resolved, setResolved] = useState(false);
  const hasText = c.draft.trim().length > 0;
  const r = c.result!;
  const pct = Math.round(r.confidence * 100);
  const editable = c.status === "needs_review";
  return (
    <div className="border-t border-slate-200/70 bg-brand-50/60 dark:bg-brand-500/[0.06] p-4 dark:border-white/10">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1 font-semibold text-brand-700 dark:text-brand-300">
          <Sparkles className="size-3.5" /> AI-анализ ({r.engine === "rules" ? "правила" : `${r.engine === "groq" ? "Groq" : "Gemini"} · ${r.model}`})
          <span className="font-normal text-slate-600 dark:text-slate-400">· текст: {r.replySource === "llm" ? "AI, тон под настроение" : "шаблон"}</span>
        </span>
        <Chip>{INTENT_LABEL[r.intent] ?? r.intent}</Chip>
        <Chip>{r.topic}</Chip>
        <Chip><span className={URGENCY[r.urgency]}>срочность: {URGENCY_LABEL[r.urgency]}</span></Chip>
        <Chip><span className={SENTIMENT_LABEL[r.sentiment].cls}>настроение: {SENTIMENT_LABEL[r.sentiment].label}</span></Chip>
        <div className="ml-auto flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" aria-hidden>
            <div className={`h-full rounded-full ${pct > 90 ? "bg-emerald-500" : pct > 70 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${pct}%` }} />
          </div>
          <span><span className="sr-only">Уверенность AI: </span>{pct}%</span>
        </div>
      </div>

      {!!r.performed?.length && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {r.performed.map((p) => (
            <span key={p} className="flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-600/30 dark:text-emerald-300">
              <Zap className="size-3" /> AI выполнил: {p}
            </span>
          ))}
        </div>
      )}
      {r.kb.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {r.kb.map((a) => (
            <span key={a.id} title={a.text} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10">
              <BookOpen className="size-3" /> {a.title}
            </span>
          ))}
        </div>
      )}

      {editable ? (
        <>
          <label htmlFor={`draft-${c.id}`} className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300"><Wand2 className="size-3" /> Черновик ответа клиенту</label>
          <textarea
            id={`draft-${c.id}`}
            value={c.draft}
            onChange={(e) => onDraft(e.target.value)}
            rows={4}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm focus:border-brand-600 dark:border-white/10 dark:bg-white/5"
          />
        </>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          {c.status === "auto_resolved"
            ? <><ShieldCheck className="size-3.5 text-emerald-600" /> Ответ отправлен автоматически: confidence {pct}% &gt; 90%, оператор не требуется.</>
            : <><CheckCircle2 className="size-3.5" /> Диалог завершён оператором.</>}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {r.actions.map((a) => {
          const done = c.done.includes(a.id);
          // Без найденного заказа действие выполнить нельзя — подсказываем, что сделать
          const missing = a.id === "extend_storage" || a.id === "cdek_claim" ? !r.shipment : !r.order;
          return (
            <button
              key={a.id}
              disabled={done || missing || busy !== null}
              title={missing ? "Сначала уточните у клиента номер заказа или телефон" : undefined}
              onClick={() => onAction(a)}
              className="flex min-h-10 items-center gap-1.5 rounded-xl border border-brand-600/40 bg-brand-500/10 px-3 text-sm font-medium text-brand-800 transition hover:bg-brand-500/20 disabled:opacity-50 dark:text-brand-300"
            >
              {busy === a.id ? <Loader2 className="size-3.5 animate-spin" /> : done ? <CheckCircle2 className="size-3.5" /> : <Zap className="size-3.5" />}
              {a.label}
            </button>
          );
        })}
        {editable && (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={resolved} onChange={(e) => setResolved(e.target.checked)} className="size-4 rounded accent-emerald-600" />
              Проблема решена — закрыть тикет
            </label>
            <button
              onClick={() => onSend(resolved)}
              disabled={!hasText && !resolved}
              className={`flex min-h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-medium text-white shadow-md transition disabled:cursor-not-allowed disabled:opacity-50 ${
                resolved ? "bg-emerald-700 shadow-emerald-700/25 hover:bg-emerald-800" : "bg-brand-600 shadow-brand-600/25 hover:bg-brand-700"
              }`}
            >
              {resolved ? <CheckCircle2 className="size-4" /> : <Send className="size-4" />}
              {resolved ? (hasText ? "Отправить и закрыть" : "Закрыть тикет") : "Отправить клиенту"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-md bg-white px-2 py-0.5 text-xs ring-1 ring-slate-200 dark:bg-white/10 dark:ring-white/10">{children}</span>
);

function OrderPanel({ r }: { r?: AgentResult }) {
  const o = r?.order;
  const s = r?.shipment;
  if (!o)
    return (
      <div className="card p-5 text-sm text-slate-600 dark:text-slate-400">
        <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100"><Package className="size-4" /> Заказ</div>
        {r ? "Заказ не найден — AI попросит у клиента номер заказа или телефон." : "Выберите диалог"}
      </div>
    );
  const shipColor = { in_transit: "text-sky-700 dark:text-sky-400", at_pvz: "text-emerald-700 dark:text-emerald-400", delivered: "text-slate-600 dark:text-slate-400", delayed: "text-rose-700 dark:text-rose-400" };
  return (
    <>
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold"><Package className="size-4 text-brand-500" /> Заказ №{o.id}</div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-white/10">МойСклад · {o.status}</span>
        </div>
        <dl className="space-y-1.5 text-sm">
          <Row icon={<User className="size-3.5" />} k="Покупатель" v={o.customerName} />
          <Row icon={<Phone className="size-3.5" />} k="Телефон" v={o.phone} />
          <Row icon={<Clock className="size-3.5" />} k="Создан" v={o.createdAt} />
        </dl>
        <ul className="mt-3 divide-y divide-slate-200/70 rounded-xl border border-slate-200/70 text-sm dark:divide-white/10 dark:border-white/10">
          {o.items.map((i) => (
            <li key={i.name} className="flex justify-between gap-2 px-3 py-2"><span>{i.name} × {i.qty}</span><span className="shrink-0">{money(i.price)}</span></li>
          ))}
          <li className="flex justify-between px-3 py-2 font-semibold"><span>Итого</span><span>{money(o.total)}</span></li>
        </ul>
      </div>

      {s && (
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold"><Truck className="size-4 text-brand-500" /> СДЭК {s.track}</div>
            <span className={`flex items-center gap-1 text-xs font-semibold ${shipColor[s.status]}`}>
              {s.status === "delayed" && <CircleAlert className="size-3.5" />}{s.statusText}
            </span>
          </div>
          <dl className="mb-4 space-y-1.5 text-sm">
            <Row icon={<MapPin className="size-3.5" />} k="ПВЗ" v={s.pvzAddress} />
            <Row icon={<Clock className="size-3.5" />} k="Плановая дата" v={s.plannedDate} />
            {s.storageUntil && <Row icon={<Clock className="size-3.5" />} k="Хранение до" v={s.storageUntil} />}
          </dl>
          <ol className="relative ml-2 space-y-4 border-l border-slate-200 pl-5 dark:border-white/10">
            {s.events.map((e, i) => {
              const last = i === s.events.length - 1;
              return (
                <li key={i} className="relative">
                  <span className={`absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-white dark:ring-[#0b1020] ${last ? (s.status === "delayed" ? "bg-rose-500" : "bg-brand-500") : "bg-slate-300 dark:bg-slate-600"}`} />
                  <div className={`text-sm ${last ? "font-medium" : ""}`}>{e.status}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">{e.date} · {e.city}</div>
                </li>
              );
            })}
            {s.status !== "delivered" && (
              <li className="relative text-slate-600 dark:text-slate-400">
                <span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-dashed border-slate-400 bg-transparent" />
                <div className="text-sm">Доставка в ПВЗ</div>
                <div className="text-xs">план: {s.plannedDate}</div>
              </li>
            )}
          </ol>
        </div>
      )}
    </>
  );
}

const Row = ({ icon, k, v }: { icon: React.ReactNode; k: string; v: string }) => (
  <div className="flex gap-2">
    <dt className="flex shrink-0 items-center gap-1.5 text-slate-600 dark:text-slate-400">{icon}{k}:</dt>
    <dd className="min-w-0">{v}</dd>
  </div>
);

function NewTicket({ onSubmit, onCancel }: { onSubmit: (customer: string, input: AgentInput) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ message: "", order_id: "", phone: "" });
  const [error, setError] = useState(false);
  const msgRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { msgRef.current?.focus(); }, []);
  const input =
    "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-brand-600 " +
    "dark:bg-white/5 dark:text-white dark:placeholder:text-slate-400";
  const okBorder = "border-slate-300 dark:border-white/15";
  const label = "mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300";
  return (
    <form
      id="new-ticket"
      aria-label="Новое обращение"
      noValidate
      className="space-y-3 border-b border-slate-200/70 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.02]"
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.message.trim()) {
          setError(true);
          return msgRef.current?.focus();
        }
        onSubmit("Новый клиент", form);
      }}
    >
      <fieldset>
        <legend className={label}>Заполнить демо-сценарием</legend>
        <div className="flex flex-wrap gap-1.5">
          {demoScenarios.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => { setError(false); setForm({ message: s.input.message, order_id: s.input.order_id ?? "", phone: s.input.phone ?? "" }); }}
              className="min-h-8 rounded-md bg-white px-2.5 text-xs ring-1 ring-slate-300 hover:bg-slate-100 dark:bg-white/5 dark:ring-white/15 dark:hover:bg-white/10"
            >
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="nt-message" className={label}>
          Сообщение клиента <span aria-hidden className="text-rose-700 dark:text-rose-400">*</span>
        </label>
        <textarea
          ref={msgRef}
          id="nt-message"
          required
          aria-invalid={error}
          aria-describedby={error ? "nt-message-error" : undefined}
          rows={2}
          placeholder="Например: где мой заказ 48201?"
          className={`${input} ${error ? "border-rose-600 dark:border-rose-400" : okBorder}`}
          value={form.message}
          onChange={(e) => { setError(false); setForm({ ...form, message: e.target.value }); }}
        />
        {error && <p id="nt-message-error" className="mt-1 text-xs text-rose-700 dark:text-rose-400">Введите текст обращения</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="nt-order" className={label}>Номер заказа</label>
          <input id="nt-order" inputMode="numeric" autoComplete="off" placeholder="48201" className={`${input} ${okBorder}`}
            value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })} />
        </div>
        <div>
          <label htmlFor="nt-phone" className={label}>Телефон</label>
          <input id="nt-phone" type="tel" autoComplete="off" placeholder="+7 707 123 45 67" className={`${input} ${okBorder}`}
            value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel}
          className="min-h-10 rounded-lg px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100 dark:text-slate-300 dark:ring-white/15 dark:hover:bg-white/10">
          Отмена
        </button>
        <button type="submit"
          className="min-h-10 flex-1 rounded-lg bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
          Отправить в AI
        </button>
      </div>
    </form>
  );
}
