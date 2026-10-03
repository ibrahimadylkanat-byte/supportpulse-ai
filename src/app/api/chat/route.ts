import { customerView, handleCustomerMessage } from "@/lib/inbox";
import { clientIp, tooMany } from "@/lib/rateLimit";
import { getTicket } from "@/lib/ticketStore";
import { describePhoto, photoNote } from "@/lib/vision";

// Чат клиента на сайте: отправка сообщения (текст, голос, фото) и опрос новых ответов.
// Клиент видит только переписку, без разбора агента.
export async function POST(req: Request) {
  if (tooMany(clientIp(req))) return Response.json({ error: "Слишком много сообщений, подождите минуту" }, { status: 429 });
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const image = typeof body?.image === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(body.image) ? body.image : undefined;
  if (!body || (!message && !image) || message.length > 2000 || (image && image.length > 2_000_000)) {
    return Response.json({ error: "Нужен текст до 2000 символов или фото до 1,5 МБ" }, { status: 400 });
  }
  if (message.includes("\uFFFD")) {
    return Response.json({ error: "Сообщение пришло в неверной кодировке — отправьте его ещё раз" }, { status: 400 });
  }
  const ticketId = typeof body.ticketId === "string" ? body.ticketId : undefined;
  const t = await handleCustomerMessage({
    channel: "chat",
    ticketId,
    message: message || "📷 Фото",
    voice: body.voice === true,
    image,
    agentMessage: image ? photoNote(message, await describePhoto(image, message)) : undefined,
  });
  return Response.json(customerView(t));
}

export async function GET(req: Request) {
  const t = getTicket(new URL(req.url).searchParams.get("id") ?? "");
  if (!t || t.channel !== "chat") return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(customerView(t));
}
