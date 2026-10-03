import { customerView, rateTicket } from "@/lib/inbox";
import { getTicket } from "@/lib/ticketStore";

// Оценка ответа клиентом: { id, rating: "up" | "down" }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (typeof body?.id !== "string" || !["up", "down"].includes(body?.rating)) {
    return Response.json({ error: "id and rating (up|down) are required" }, { status: 400 });
  }
  if (getTicket(body.id)?.channel !== "chat") return Response.json({ error: "not found" }, { status: 404 });
  const t = rateTicket(body.id, body.rating);
  if (!t) return Response.json({ error: "Пока нечего оценивать" }, { status: 409 });
  return Response.json(customerView(t));
}
