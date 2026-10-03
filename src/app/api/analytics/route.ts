import {
  AHT_WITH_AI_SEC,
  AHT_WITHOUT_AI_SEC,
  OPERATOR_HOURLY_COST_USD,
  SLA_TARGET,
  analyticsRaw,
  dashboardRaw,
  recentTickets,
  slaPolicy,
  type Period,
} from "@/lib/mockData";
import { allTickets, liveTickets } from "@/lib/ticketStore";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get("period") as Period;
  const period: Period = p in analyticsRaw ? p : "month";
  const raw = analyticsRaw[period];
  const dash = dashboardRaw[period];

  // Живые обращения, обработанные агентом, — последний столбец настроения и строки таблицы
  const live = liveTickets();
  const liveOpen = live.filter((t) => t.status === "needs_review");
  const count = (k: string) => live.filter((t) => t.sentiment === k).length;
  const series = live.length
    ? [...dash.sentiment, { label: "Live", positive: count("positive"), neutral: count("neutral"), negative: count("negative") }]
    : dash.sentiment;

  const deflected = Math.round(raw.totalTickets * raw.deflectionRate);
  const savedHours = Math.round((deflected * (AHT_WITHOUT_AI_SEC - AHT_WITH_AI_SEC)) / 3600);

  const slaRows = Object.values(dash.sla);
  const slaTickets = slaRows.reduce((a, r) => a + r.tickets, 0);
  const slaMet = slaRows.reduce((a, r) => a + r.tickets * r.met, 0) / slaTickets;
  const breaches =
    Math.round(slaRows.reduce((a, r) => a + r.tickets * (1 - r.met), 0)) + liveOpen.filter((t) => t.slaLeftMin < 0).length;

  const s = series.reduce(
    (a, d) => ({ positive: a.positive + d.positive, neutral: a.neutral + d.neutral, negative: a.negative + d.negative }),
    { positive: 0, neutral: 0, negative: 0 },
  );
  const sTotal = s.positive + s.neutral + s.negative;

  return Response.json({
    ...raw,
    deflected,
    savedHours,
    savedUsd: savedHours * OPERATOR_HOURLY_COST_USD,
    aht: { withoutAi: AHT_WITHOUT_AI_SEC, withAi: AHT_WITH_AI_SEC },
    openNow: dash.openNow + liveOpen.length,
    live: { count: live.length, open: liveOpen.length },
    sla: {
      target: SLA_TARGET,
      met: slaMet,
      breaches,
      byPriority: Object.entries(dash.sla).map(([k, r]) => ({ priority: k, ...slaPolicy[k as keyof typeof slaPolicy], ...r })),
    },
    sentiment: {
      series,
      share: { positive: s.positive / sTotal, neutral: s.neutral / sTotal, negative: s.negative / sTotal },
      // Индекс настроения: доля позитивных минус доля негативных, −100…+100
      index: Math.round(((s.positive - s.negative) / sTotal) * 100),
    },
    tickets: [...live, ...recentTickets],
    // Оценки клиентов из чата (👍/👎 после ответа)
    csat: (() => {
      const rated = allTickets().filter((t) => t.csat);
      return { up: rated.filter((t) => t.csat === "up").length, total: rated.length };
    })(),
  });
}
