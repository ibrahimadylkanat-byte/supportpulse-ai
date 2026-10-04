import { operatorReply } from "@/lib/inbox";
import { allTickets, clearTickets, withTickets } from "@/lib/ticketStore";

// Очередь для панели оператора (опрашивается раз в 3 сек)
export const GET = withTickets(async () => Response.json(allTickets()));

// Ответ оператора: { id, text?, resolved } — закрыть тикет, только если проблема решена
export const POST = withTickets(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!body || typeof body.id !== "string" || typeof body.resolved !== "boolean" || text.length > 4000 || (!text && !body.resolved)) {
    return Response.json({ error: "id (string), resolved (boolean) and text (if not resolved) are required" }, { status: 400 });
  }
  const t = await operatorReply(body.id, text, body.resolved);
  if (!t) return Response.json({ error: "ticket not found" }, { status: 404 });
  if (t === "duplicate") return Response.json({ error: "Этот ответ уже отправлен клиенту" }, { status: 409 });
  return Response.json({ id: t.id, status: t.status });
});

// Сброс перед новым показом (тикеты сохраняются на диск или в Redis и переживают перезапуск)
export async function DELETE() {
  await clearTickets();
  return Response.json({ ok: true });
}
