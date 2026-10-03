import { analyticsRaw, type Period } from "@/lib/mockData";
import { clientIp, tooMany } from "@/lib/rateLimit";
import { generateSummary } from "@/lib/summary";

// Сводка для руководителя по кнопке (не по таймеру — бережём квоту LLM)
export async function POST(req: Request) {
  if (tooMany(`summary:${clientIp(req)}`, 5)) return Response.json({ error: "Слишком часто, подождите минуту" }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const period: Period = body?.period in analyticsRaw ? body.period : "month";
  return Response.json(await generateSummary(period));
}
