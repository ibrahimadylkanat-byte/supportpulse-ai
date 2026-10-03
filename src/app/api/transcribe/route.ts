import { clientIp, tooMany } from "@/lib/rateLimit";
import { looksLikeHallucination } from "@/lib/speech";

// Голосовое сообщение из чата → текст (Groq Whisper). Дальше клиент отправляет текст как обычное сообщение.
export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) return Response.json({ error: "Голосовой ввод не настроен" }, { status: 503 });
  if (tooMany(`voice:${clientIp(req)}`)) return Response.json({ error: "Слишком много сообщений, подождите минуту" }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || audio.size === 0 || audio.size > 5_000_000) {
    return Response.json({ error: "Нужна аудиозапись до 5 МБ" }, { status: 400 });
  }
  const body = new FormData();
  body.append("file", audio, audio.name || "voice.webm");
  body.append("model", process.env.GROQ_WHISPER_MODEL || "whisper-large-v3");
  body.append("response_format", "json");
  // Подсказка словаря: номера заказов, СДЭК, ПВЗ распознаются точнее
  body.append("prompt", "Поддержка интернет-магазина: заказ 48201, трек-номер, СДЭК, ПВЗ, возврат, брак, промокод.");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body,
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res?.ok) {
    console.warn("Whisper:", res?.status, await res?.text().catch(() => ""));
    return Response.json({ error: "Не удалось распознать речь, попробуйте ещё раз или напишите текстом" }, { status: 502 });
  }
  const text = String((await res.json()).text ?? "").trim();
  if (!text || looksLikeHallucination(text)) return Response.json({ error: "Не расслышал — попробуйте ещё раз ближе к микрофону" }, { status: 422 });
  return Response.json({ text });
}
