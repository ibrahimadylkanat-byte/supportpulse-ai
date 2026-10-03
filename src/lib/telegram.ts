// Telegram-бот: транспорт (Bot API). Без TELEGRAM_BOT_TOKEN ничего не делает.
const api = (method: string) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendTelegram(chatId: string, text: string) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const res = await fetch(api("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 120)}`);
}

type OnText = (chatId: string, text: string, firstName?: string) => Promise<string | null>;

const GREETING =
  "Здравствуйте! Я AI-ассистент поддержки магазина. Напишите номер заказа или телефон — подскажу, где посылка, помогу с возвратом или отвечу на вопрос об оплате.";

// ponytail: long polling внутри процесса Next — работает локально и на VPS; на serverless (Vercel) нужен webhook.
export function startTelegramPolling(onText: OnText) {
  const g = globalThis as unknown as { __tgPolling?: boolean };
  if (g.__tgPolling || !process.env.TELEGRAM_BOT_TOKEN) return;
  g.__tgPolling = true;
  console.log("Telegram: бот запущен (long polling)");

  (async () => {
    await fetch(api("deleteWebhook")).catch(() => {}); // с активным webhook getUpdates отвечает 409
    let offset = 0;
    for (;;) {
      try {
        const res = await fetch(`${api("getUpdates")}?timeout=25&offset=${offset}`, { signal: AbortSignal.timeout(35_000) });
        const j = await res.json();
        if (!j.ok) throw new Error(j.description);
        for (const u of j.result) {
          offset = u.update_id + 1;
          const m = u.message;
          if (!m?.text) continue;
          const chatId = String(m.chat.id);
          try {
            const reply = m.text.startsWith("/start") ? GREETING : await onText(chatId, m.text, m.from?.first_name);
            if (reply) await sendTelegram(chatId, reply);
          } catch (e) {
            console.warn("Telegram: ошибка обработки сообщения:", (e as Error).message);
          }
        }
      } catch (e) {
        console.warn("Telegram polling:", (e as Error).message);
        await sleep(5000);
      }
    }
  })();
}
