"use client";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Bot, Camera, Frown, Headset, Meh, MessageCircle, Mic, PiggyBank, Play, RotateCcw, Send, Smile, Sparkles, Square, ThumbsUp, Timer, Zap } from "lucide-react";
import type { Ticket } from "@/lib/ticketStore";
import { AHT_WITH_AI_SEC, AHT_WITHOUT_AI_SEC } from "@/lib/mockData";

// Экономия на одном обращении, закрытом AI без оператора: (4,5 мин − 25 сек) работы оператора
const OPERATOR_COST_PER_HOUR = 350_000 / 168; // ₸: зарплата 350 тыс. / 168 рабочих часов
const SAVED_SEC_PER_AUTO = AHT_WITHOUT_AI_SEC - AHT_WITH_AI_SEC;

// Запасное демо: если жюри молчит или пропал интернет у зала
// Каждое сообщение — другая ситуация: ответ сам, действие агента, оператор, отмена, казахский
const AUTO_DEMO = [
  "Здравствуйте! Где мой заказ 48201?",
  "Заказ 48190 должен был прийти вчера!! Сколько можно ждать?",
  "Прислали не тот товар в заказе 48170 — чёрные кеды вместо белых",
  "СДЭК пишет, что заказ 48163 вручён, но я его не получал!",
  "Хочу отменить заказ 48230, передумал",
  "Тапсырыс 48215 қашан жіберіледі?",
];
const AUTO_DEMO_GAP_MS = 7000;

// Экран для проектора на питче: QR на чат + живая лента обращений жюри с ответами AI.

type FeedItem = {
  key: string;
  channel: Ticket["channel"];
  customer: string;
  question: string;
  answer?: { from: "ai" | "operator"; text: string; seconds: number };
  sentiment: Ticket["result"]["sentiment"];
  auto: boolean;
  at: number;
  voice?: boolean;
  image?: string;
  performed?: string; // действие, которое AI выполнил сам
};

const URL_KEY = "supportpulse-live-url";
const SENTIMENT = {
  positive: { icon: Smile, label: "позитив", cls: "bg-sky-400/15 text-sky-200" },
  neutral: { icon: Meh, label: "нейтрально", cls: "bg-white/10 text-slate-200" },
  negative: { icon: Frown, label: "негатив", cls: "bg-rose-400/15 text-rose-200" },
} as const;

/** Каждое сообщение клиента из живых каналов + следующий за ним ответ (AI или оператор). */
function toFeed(tickets: Ticket[]): FeedItem[] {
  return tickets
    .filter((t) => t.channel !== "demo")
    .flatMap((t) =>
      t.messages.flatMap((m, i) => {
        if (m.from !== "customer") return [];
        const reply = t.messages.slice(i + 1).find((r) => r.from !== "system");
        const answer =
          reply && reply.from !== "customer"
            ? { from: reply.from as "ai" | "operator", text: reply.text, seconds: Math.max(0, (reply.at - m.at) / 1000) }
            : undefined;
        return [{
          key: `${t.id}-${i}`,
          channel: t.channel,
          customer: t.customer,
          question: m.text,
          answer,
          sentiment: t.result.sentiment,
          auto: answer?.from === "ai" && !answer.text.startsWith("Спасибо! Передал"),
          at: m.at,
          voice: m.voice,
          performed: t.messages.slice(i + 1).find((r) => r.from === "system" && r.text.startsWith("🤖 AI выполнил:"))?.text.replace("🤖 AI выполнил: ", ""),
          image: m.image,
        }];
      }),
    )
    .sort((a, b) => b.at - a.at);
}

const readUrl = () => { try { return localStorage.getItem(URL_KEY) ?? ""; } catch { return ""; } };
const saveUrl = (v: string) => { try { v ? localStorage.setItem(URL_KEY, v) : localStorage.removeItem(URL_KEY); } catch {} };

export default function LiveWall() {
  const [base, setBase] = useState("");
  const [lan, setLan] = useState<string[]>([]);
  const [qr, setQr] = useState("");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [ratings, setRatings] = useState({ up: 0, total: 0 });
  const [demoStep, setDemoStep] = useState<number | null>(null); // null — автодемо не идёт

  // Адрес: свой (сохранённый) → PUBLIC_URL с сервера → текущий, если открыт не с localhost → IP в локальной сети
  useEffect(() => {
    fetch("/api/public-url").then((r) => r.json()).then((d: { configured: string | null; lan: string[] }) => {
      setLan(d.lan);
      const here = location.origin;
      const isLocal = /localhost|127\.0\.0\.1/.test(here);
      setBase(readUrl() || d.configured || (isLocal ? d.lan[0] ?? here : here));
    }).catch(() => setBase(location.origin));
  }, []);

  const chatUrl = base ? `${base.replace(/\/$/, "")}/chat` : "";
  useEffect(() => {
    if (!chatUrl) return;
    QRCode.toString(chatUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b1020", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [chatUrl]);

  const poll = useCallback(async () => {
    const res = await fetch("/api/tickets").catch(() => null);
    if (!res?.ok) return;
    const tickets: Ticket[] = await res.json();
    setFeed(toFeed(tickets));
    const rated = tickets.filter((t) => t.channel !== "demo" && t.csat);
    setRatings({ up: rated.filter((t) => t.csat === "up").length, total: rated.length });
  }, []);
  useEffect(() => {
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, [poll]);

  // Автодемо: сообщения уходят по одному с паузой, лента оживает сама
  useEffect(() => {
    if (demoStep === null) return;
    if (demoStep >= AUTO_DEMO.length) return setDemoStep(null);
    const t = setTimeout(async () => {
      await fetch("/api/chat", { method: "POST", body: JSON.stringify({ message: AUTO_DEMO[demoStep] }) }).catch(() => {});
      poll();
      setDemoStep((s) => (s === null ? null : s + 1));
    }, demoStep === 0 ? 0 : AUTO_DEMO_GAP_MS);
    return () => clearTimeout(t);
  }, [demoStep, poll]);

  async function resetDemo() {
    if (!confirm("Удалить все обращения и начать демо с чистого экрана?")) return;
    await fetch("/api/tickets", { method: "DELETE" }).catch(() => {});
    poll();
  }

  const answered = feed.filter((f) => f.answer?.from === "ai");
  const autoCount = feed.filter((f) => f.auto).length;
  const savedMin = (autoCount * SAVED_SEC_PER_AUTO) / 60;
  const savedTenge = Math.round((savedMin / 60) * OPERATOR_COST_PER_HOUR);
  const avgAi = answered.length ? answered.reduce((a, f) => a + f.answer!.seconds, 0) / answered.length : 0;
  const autoShare = feed.length ? Math.round((feed.filter((f) => f.auto).length / feed.length) * 100) : 0;
  const isLocalOnly = /^http:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|localhost|127\.)/.test(base);

  return (
    <div className="min-h-screen bg-[#070b17] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60rem_40rem_at_0%_0%,rgba(37,99,235,0.35),transparent),radial-gradient(50rem_30rem_at_100%_100%,rgba(14,165,233,0.18),transparent)]" />
      <div className="relative mx-auto grid min-h-screen max-w-[1800px] gap-8 p-8 lg:h-screen lg:grid-cols-[minmax(380px,0.8fr)_1.2fr] lg:p-10">
        {/* QR */}
        <section aria-labelledby="qr-title" className="flex flex-col justify-center">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/40"><Sparkles className="size-6" aria-hidden /></div>
            <span className="font-display text-2xl font-bold">SupportPulse <span className="text-sky-300">AI</span></span>
          </div>
          <h1 id="qr-title" className="mt-6 font-display text-4xl font-extrabold leading-tight tracking-tight xl:text-5xl">
            Напишите в поддержку прямо сейчас
          </h1>
          <p className="mt-3 text-lg text-slate-300">
            Наведите камеру на код, спросите про заказ <b className="text-white">48201</b>, телефон <b className="text-white">+77071234567</b> или про возврат — и смотрите ответ AI на экране.
          </p>

          <div className="mt-6 w-fit rounded-3xl bg-white p-4 shadow-2xl shadow-brand-600/30">
            {qr ? (
              <div className="size-[min(60vw,340px,38vh)] [&>svg]:size-full" role="img" aria-label={`QR-код: ${chatUrl}`} dangerouslySetInnerHTML={{ __html: qr }} />
            ) : (
              <div className="grid size-[min(60vw,340px,38vh)] place-items-center text-slate-500">Готовим QR…</div>
            )}
          </div>
          <p className="mt-4 break-all font-mono text-lg text-sky-200">{chatUrl}</p>
          {isLocalOnly && (
            <p className="mt-2 max-w-md text-sm text-amber-200">
              Это адрес в локальной сети — откроется только с телефонов в том же Wi-Fi. Для доступа из интернета запустите туннель и укажите его адрес.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              onClick={() => setDemoStep((s) => (s === null ? 0 : null))}
              className={`flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold ${demoStep === null ? "bg-white/10 hover:bg-white/15" : "bg-rose-600 hover:bg-rose-500"}`}
            >
              {demoStep === null ? <><Play className="size-4" aria-hidden /> Автодемо</> : <><Square className="size-3.5 fill-current" aria-hidden /> Стоп ({demoStep}/{AUTO_DEMO.length})</>}
            </button>
            {editing ? (
              <form
                className="flex max-w-md gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = String(new FormData(e.currentTarget).get("url") ?? "").trim().replace(/\/$/, "");
                  saveUrl(v);
                  setBase(v || lan[0] || location.origin);
                  setEditing(false);
                }}
              >
                <label htmlFor="live-url" className="sr-only">Адрес сайта для QR-кода</label>
                <input id="live-url" name="url" defaultValue={base} placeholder="https://….trycloudflare.com"
                  className="h-10 flex-1 rounded-lg border border-white/20 bg-white/10 px-3 text-sm text-white placeholder:text-slate-400" />
                <button className="rounded-lg bg-brand-600 px-3 text-sm font-medium hover:bg-brand-500">OK</button>
              </form>
            ) : (
              <button onClick={() => setEditing(true)} className="rounded text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline">
                Изменить адрес для QR
              </button>
            )}
            <button onClick={resetDemo} className="flex items-center gap-1 rounded text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline">
              <RotateCcw className="size-3.5" aria-hidden /> Сбросить демо
            </button>
          </div>
        </section>

        {/* Лента */}
        <section aria-labelledby="feed-title" className="flex min-h-0 flex-col lg:overflow-hidden">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Stat icon={MessageCircle} label="Обращений" value={String(feed.length)} />
            <Stat icon={Timer} label="Среднее время ответа AI" value={answered.length ? `${avgAi.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} сек` : "—"} />
            <Stat icon={Zap} label="AI решил сам" value={feed.length ? `${autoShare}%` : "—"} />
            <Stat icon={ThumbsUp} label="Ответ помог" value={ratings.total ? `${Math.round((ratings.up / ratings.total) * 100)}% из ${ratings.total}` : "—"} />
          </div>

          {/* Деньги на глазах у жюри: каждое обращение, закрытое AI, экономит время оператора */}
          <div className="mt-4 flex items-center gap-4 rounded-3xl bg-gradient-to-r from-emerald-600/30 to-brand-600/20 p-5 ring-1 ring-emerald-400/30">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-500/25"><PiggyBank className="size-6 text-emerald-200" aria-hidden /></div>
            <div>
              <div className="text-sm text-emerald-100">AI сэкономил магазину за этот питч</div>
              <div className="font-display text-4xl font-extrabold tabular-nums tracking-tight">
                {savedTenge.toLocaleString("ru-RU")} ₸
                <span className="ml-3 text-lg font-semibold text-emerald-100">· {savedMin.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} мин работы операторов</span>
              </div>
              <div className="text-xs text-emerald-100/80">{autoCount} обращ. закрыто без оператора × 4 мин сэкономлено на каждом</div>
            </div>
          </div>

          <h2 id="feed-title" className="mt-8 flex items-center gap-2 text-lg font-semibold text-slate-200">
            <span className="relative flex size-2.5" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
            </span>
            Живая лента
          </h2>

          <ol aria-live="polite" className="mt-4 flex-1 space-y-4 overflow-hidden">
            {feed.length === 0 && (
              <li className="rounded-3xl border border-dashed border-white/20 p-10 text-center text-xl text-slate-400">
                Ждём первое сообщение… Отсканируйте QR-код 📱
              </li>
            )}
            {feed.slice(0, 5).map((f) => {
              const S = SENTIMENT[f.sentiment];
              return (
                <li key={f.key} className="animate-[feed-in_400ms_ease-out] rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-white">{f.customer === "Новый клиент" ? "Гость" : f.customer}</span>
                    <span className="text-slate-400">· {f.channel === "telegram" ? "Telegram" : "чат на сайте"} · {new Date(f.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className={`ml-auto flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${S.cls}`}>
                      <S.icon className="size-3.5" aria-hidden /> {S.label}
                    </span>
                  </div>
                  <div className="mt-2 flex items-start gap-3">
                    {f.image && <img src={f.image} alt="Фото от клиента" className="size-20 shrink-0 rounded-xl object-cover ring-1 ring-white/20" />}
                    <p className="text-xl leading-snug text-white">
                      {f.voice && <span className="mr-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 align-middle text-xs font-medium text-sky-200"><Mic className="size-3.5" aria-hidden /> голосом</span>}
                      {f.image && f.question === "📷 Фото"
                        ? <span className="inline-flex items-center gap-1.5 text-slate-200"><Camera className="size-5" aria-hidden /> Фото товара</span>
                        : <>«{f.question}»</>}
                    </p>
                  </div>
                  {f.answer ? (
                    <div className={`mt-3 rounded-2xl p-4 ${f.answer.from === "operator" ? "bg-emerald-400/10" : "bg-brand-600/25"}`}>
                      <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-sky-200">
                        {f.answer.from === "operator" ? <Headset className="size-4" aria-hidden /> : <Bot className="size-4" aria-hidden />}
                        {f.answer.from === "operator" ? "Оператор" : f.auto ? "AI ответил сам" : "AI передал оператору"}
                        <span className="ml-auto font-normal text-slate-300">за {f.answer.seconds.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} сек</span>
                      </div>
                      {f.performed && (
                        <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-sm font-semibold text-emerald-200">
                          <Zap className="size-3.5" aria-hidden /> AI сам: {f.performed}
                        </p>
                      )}
                      <p className="line-clamp-3 text-base leading-relaxed text-slate-100">{f.answer.text}</p>
                    </div>
                  ) : (
                    <p className="mt-3 flex items-center gap-2 text-slate-300"><Send className="size-4 animate-pulse" aria-hidden /> AI печатает…</p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
      <style>{`@keyframes feed-in { from { opacity: 0; transform: translateY(-12px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Zap; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
      <div className="flex items-center gap-1.5 text-sm text-slate-300"><Icon className="size-4" aria-hidden /> {label}</div>
      <div className="mt-1 font-display text-3xl font-bold">{value}</div>
    </div>
  );
}
