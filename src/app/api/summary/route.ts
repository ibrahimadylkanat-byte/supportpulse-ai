import { analyticsRaw, type Period } from "@/lib/mockData";
import { clientIp, tooMany } from "@/lib/rateLimit";
import { generateSummary } from "@/lib/summary";
import { withTickets } from "@/lib/ticketStore";

// Сводка для руководителя по кнопке (не по таймеру — бережём квоту LLM)
export const POST = withTickets(async (req: Request) => {
  if (tooMany(`summary:${clientIp(req)}`, 5)) return Response.json({ error: "Слишком часто, подождите минуту" }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const period: Period = body?.period in analyticsRaw ? body.period : "month";
  return Response.json(await generateSummary(period));
});
