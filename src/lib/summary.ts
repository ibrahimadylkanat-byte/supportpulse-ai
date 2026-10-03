// Сводка для руководителя: факты из метрик и живых обращений → LLM пишет выводы и рекомендации.
import { completeJson } from "./agent.ts";
import { SLA_TARGET, analyticsRaw, dashboardRaw, shipments, slaPolicy, type Period } from "./mockData.ts";
import { allTickets } from "./ticketStore.ts";

export type Summary = { headline: string; insights: string[]; actions: string[]; source: string; at: number };

const PERIOD_LABEL: Record<Period, string> = { week: "неделя", month: "месяц", quarter: "квартал" };
const pct = (x: number) => Math.round(x * 100);

/** Факты одним текстом — единственный источник цифр для модели (и для проверки её ответа). */
export function summaryFacts(period: Period) {
  const raw = analyticsRaw[period];
  const dash = dashboardRaw[period];
  const topics = Object.entries(raw.topics).sort((a, b) => b[1] - a[1]);
  const s = dash.sentiment.reduce((a, d) => ({ pos: a.pos + d.positive, neu: a.neu + d.neutral, neg: a.neg + d.negative }), { pos: 0, neu: 0, neg: 0 });
  const sTotal = s.pos + s.neu + s.neg;

  const live = allTickets().filter((t) => t.channel !== "demo");
  const rated = live.filter((t) => t.csat);
  const negative = live.filter((t) => t.result.sentiment === "negative");
  const waiting = live.filter((t) => t.status === "needs_review");
  const autoDone = live.filter((t) => t.messages.some((m) => m.text.startsWith("🤖 AI выполнил")));
  const delayed = shipments.filter((x) => x.status === "delayed");

  return [
    `Период: ${PERIOD_LABEL[period]}. Обращений: ${raw.totalTickets}. AI закрыл без оператора: ${pct(raw.deflectionRate)}%.`,
    `Темы: ${topics.map(([k, v]) => `${k} — ${v} (${pct(v / raw.totalTickets)}%)`).join("; ")}.`,
    `SLA, цель ${pct(SLA_TARGET)}% в срок: ` +
      Object.entries(dash.sla).map(([p, r]) => `${slaPolicy[p as keyof typeof slaPolicy].label.toLowerCase()} приоритет — ${pct(r.met)}% (${r.tickets} тикетов)`).join("; ") + ".",
    `Настроение клиентов: позитив ${pct(s.pos / sTotal)}%, нейтрально ${pct(s.neu / sTotal)}%, негатив ${pct(s.neg / sTotal)}%. ` +
      `Негативных обращений по отрезкам периода: ${dash.sentiment.map((d) => `${d.label}: ${d.negative}`).join(", ")}.`,
    `Сегодня в живых каналах (чат на сайте, Telegram): ${live.length} обращений, ждут оператора ${waiting.length}, ` +
      `негативных ${negative.length}, оценок клиентов ${rated.length} (из них «помогло» ${rated.filter((t) => t.csat === "up").length}), ` +
      `AI сам выполнил действий: ${autoDone.length}.`,
    negative.length ? `Примеры недовольных клиентов: ${negative.slice(0, 3).map((t) => `«${t.input.message.slice(0, 80)}»`).join("; ")}.` : "",
    delayed.length ? `Задержки СДЭК сейчас: ${delayed.map((x) => `${x.location} (заказ задержан, новая дата ${x.plannedDate})`).join("; ")}.` : "",
  ].filter(Boolean).join("\n");
}

/** Каждое число от двух цифр в сводке должно встречаться в фактах — иначе это выдумка модели. */
function numbersGrounded(text: string, facts: string) {
  const norm = (x: string) => x.replace(/(\d)[\s ](?=\d{3}\b)/g, "$1");
  const f = norm(facts);
  return (norm(text).match(/\d{2,}/g) ?? []).every((n) => f.includes(n));
}

const SYSTEM =
  "Ты аналитик службы поддержки интернет-магазина. По данным напиши короткую сводку для руководителя на русском. " +
  'Верни только JSON: {"headline": "одно предложение — самое важное", "insights": ["2–4 вывода, в каждом цифра из данных"], ' +
  '"actions": ["2–3 конкретных действия на завтра"]}. ' +
  "Сначала — проблемы: приоритет, где SLA ниже цели (обязательно назови его), рост негатива, задержки доставки; потом — что работает хорошо. " +
  "Используй только цифры из данных, ничего не придумывай и не пересчитывай. Пиши просто и по делу, без канцелярита.";

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, 4) : []);

export async function generateSummary(period: Period): Promise<Summary> {
  const facts = summaryFacts(period);
  try {
    const { json, llm } = await completeJson(SYSTEM, `ДАННЫЕ:\n${facts}`);
    const out = { headline: String(json.headline ?? "").trim(), insights: strings(json.insights), actions: strings(json.actions) };
    const text = [out.headline, ...out.insights, ...out.actions].join("\n");
    if (out.headline && out.insights.length && out.actions.length && numbersGrounded(text, facts)) {
      return { ...out, source: `${llm.provider === "groq" ? "Groq" : "Gemini"} · ${llm.model}`, at: Date.now() };
    }
    console.warn("Сводка LLM отклонена: цифры не подтверждаются данными или пустые поля");
  } catch (e) {
    console.warn("Сводка: LLM недоступен —", (e as Error).message);
  }
  return { ...templateSummary(period), source: "шаблон (LLM недоступен)", at: Date.now() };
}

/** Запасная сводка без LLM — по тем же данным, детерминированно. */
export function templateSummary(period: Period) {
  const raw = analyticsRaw[period];
  const dash = dashboardRaw[period];
  const [topTopic, topCount] = Object.entries(raw.topics).sort((a, b) => b[1] - a[1])[0];
  const worst = Object.entries(dash.sla).sort((a, b) => a[1].met - b[1].met)[0];
  const worstLabel = slaPolicy[worst[0] as keyof typeof slaPolicy].label.toLowerCase();
  const delayed = shipments.filter((x) => x.status === "delayed");
  const insights = [
    `Самая частая тема — «${topTopic}»: ${topCount} обращений из ${raw.totalTickets}.`,
    `SLA хуже всего на ${worstLabel} приоритете: ${pct(worst[1].met)}% в срок при цели ${pct(SLA_TARGET)}%.`,
  ];
  const actions = [
    worst[1].met < SLA_TARGET ? `Поставить дежурного на ${worstLabel} приоритет, пока SLA ниже цели.` : "Сохранить текущую смену — SLA в норме.",
    `Дописать статьи базы знаний по теме «${topTopic}», чтобы AI закрывал больше без оператора.`,
  ];
  if (delayed.length) actions.push(`Связаться со СДЭК по задержке: ${delayed[0].location}.`);
  return { headline: `AI закрыл ${pct(raw.deflectionRate)}% из ${raw.totalTickets} обращений без оператора.`, insights, actions };
}
