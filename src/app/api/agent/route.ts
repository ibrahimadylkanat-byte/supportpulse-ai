import { handleCustomerMessage } from "@/lib/inbox";

// Демо-обращения и «+ Обращение» из панели оператора
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.message !== "string" || !body.message.trim() || body.message.length > 4000) {
    return Response.json({ error: "message (string, 1..4000) is required" }, { status: 400 });
  }
  if (body.message.includes("\uFFFD")) {
    return Response.json({ error: "message has broken encoding (expected UTF-8)" }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const input = { message: body.message, order_id: str(body.order_id), phone: str(body.phone) };
  const t = await handleCustomerMessage({
    channel: "demo",
    ...input,
    dedupeKey: [input.message.trim(), input.order_id ?? "", input.phone ?? ""].join("|"),
  });
  return Response.json({ ...t.result, ticketId: t.id });
}
