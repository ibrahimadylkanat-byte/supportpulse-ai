// Next вызывает register() один раз при старте сервера — здесь запускается Telegram-бот.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.TELEGRAM_BOT_TOKEN) return;
  const { startTelegramPolling } = await import("./lib/telegram");
  const { handleCustomerMessage } = await import("./lib/inbox");
  startTelegramPolling(async (chatId, text, firstName) => {
    const t = await handleCustomerMessage({ channel: "telegram", externalId: chatId, customerName: firstName, message: text });
    const last = t.messages.at(-1);
    return last?.from === "ai" ? last.text : null;
  });
}
