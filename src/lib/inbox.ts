// Входящие из любого канала (демо, чат на сайте, Telegram) → агент → тикет; ответы оператора → обратно клиенту.
import { runAgent } from "./agent.ts";
import { sendTelegram } from "./telegram.ts";
import { FIRST_RESPONSE_TEXT, findOpenTicket, getTicket, persist, saveTicket, type Channel, type Ticket, type TicketMsg } from "./ticketStore.ts";

type Incoming = {
  channel: Channel;
  message: string;
  order_id?: string;
  phone?: string;
  ticketId?: string; // продолжение диалога в чате на сайте
  externalId?: string; // chat_id в Telegram
  customerName?: string;
  dedupeKey?: string;
  at?: number;
  voice?: boolean; // текст — расшифровка голосового
  image?: string; // фото от клиента
  agentMessage?: string; // что разбирает агент, если отличается от показанного текста (например, + описание фото)
};

export async function handleCustomerMessage(p: Incoming): Promise<Ticket> {
  const at = p.at ?? Date.now();
  let t = p.ticketId ? getTicket(p.ticketId) : p.externalId ? findOpenTicket(p.channel, p.externalId) : undefined;
  if (t?.status === "closed") t = undefined; // после закрытия — новое обращение

  // В продолжении диалога заказ уже известен: «а когда приедет?» не требует номер заново
  const input = { message: p.agentMessage ?? p.message, order_id: p.order_id ?? t?.result.order?.id, phone: p.phone };
  const result = await runAgent(input);
  const status = result.mode === "auto" ? "auto_resolved" : "needs_review";

  const msgs: TicketMsg[] = [{ from: "customer", text: p.message, at, ...(p.voice && { voice: true }), ...(p.image && { image: p.image }) }];
  const repliedAt = p.at ?? Date.now(); // реальное время ответа AI — для «ответил за N сек» на экране
  for (const action of result.performed ?? []) msgs.push({ from: "system", text: `🤖 AI выполнил: ${action}`, at: repliedAt });
  if (result.mode === "auto") msgs.push({ from: "ai", text: result.reply, at: repliedAt });
  // Клиенту в живом канале не молчим, пока оператор проверяет черновик
  else if (p.channel !== "demo")
    msgs.push({ from: "ai", text: `Спасибо! Передал ваш вопрос оператору — он ответит в течение ${FIRST_RESPONSE_TEXT[result.urgency]}.`, at: repliedAt, ack: true });

  const customer = result.order?.customerName ?? t?.customer ?? p.customerName ?? "Новый клиент";
  if (t) {
    // Тикет уже ждёт оператора, а уточнение AI закрыл сам — ответ отправлен, но исходный вопрос остаётся в очереди
    const keepOpen = t.status === "needs_review" && result.mode === "auto";
    Object.assign(
      t,
      keepOpen
        ? { input, customer }
        : { input, result, status, customer, responded: false, waitingSince: at },
    );
    t.messages.push(...msgs);
    persist();
    return t;
  }
  return saveTicket(
    { channel: p.channel, externalId: p.externalId, customer, input, result, status, responded: false, messages: msgs, createdAt: at, waitingSince: at },
    p.dedupeKey,
  );
}

/** Ответ оператора. Тикет закрывается, только если проблема решена; иначе остаётся открытым с отметкой «ответ дан». */
export async function operatorReply(id: string, text: string, resolved: boolean): Promise<Ticket | "duplicate" | null> {
  const t = getTicket(id);
  if (!t) return null;
  // Два оператора в одном тикете (или двойной клик): тот же текст повторно клиенту не отправляем
  // (повтор = совпадает с последним ответом оператора, и клиент с тех пор ничего не писал)
  const lastHuman = [...t.messages].reverse().find((m) => m.from === "operator" || m.from === "customer");
  if (text && lastHuman?.from === "operator" && lastHuman.text === text) return "duplicate";
  const at = Date.now();
  if (text) {
    t.messages.push({ from: "operator", text, at });
    t.responded = true;
  }
  t.messages.push({ from: "system", text: resolved ? "Проблема решена — тикет закрыт" : "Ответ отправлен — тикет остаётся открытым до решения", at });
  if (resolved) t.status = "closed";

  if (t.channel === "telegram" && t.externalId) {
    try {
      if (text) await sendTelegram(t.externalId, text);
      if (resolved) await sendTelegram(t.externalId, "Рады были помочь! Если появятся вопросы — просто напишите сюда.");
    } catch (e) {
      t.messages.push({ from: "system", text: `Не удалось доставить в Telegram: ${(e as Error).message}`, at });
    }
  }
  persist();
  return t;
}

export function addSystemMessage(id: string, text: string) {
  getTicket(id)?.messages.push({ from: "system", text, at: Date.now() });
  persist();
}

/** Последняя реплика по существу (AI или оператор), если она — последнее слово в диалоге. */
function lastAnswer(t: Ticket) {
  const last = [...t.messages].reverse().find((m) => m.from !== "system");
  return last && (last.from === "operator" || (last.from === "ai" && !last.ack)) ? last : undefined;
}

/** Оценить можно открытый тикет, где последнее слово — ответ, который клиент ещё не оценивал. */
const canRate = (t: Ticket) => {
  const a = lastAnswer(t);
  return t.status !== "closed" && !!a && a.at > (t.ratedAt ?? 0);
};

/**
 * Оценка клиента. «Помогло» — клиент сам подтвердил, что вопрос решён: тикет закрывается.
 * «Не помогло» — тикет уходит оператору в очередь, клиенту — подтверждение.
 */
export function rateTicket(id: string, rating: "up" | "down"): Ticket | null {
  const t = getTicket(id);
  if (!t || !canRate(t)) return null;
  const at = Date.now();
  t.csat = rating;
  t.ratedAt = at;
  if (rating === "up") {
    t.status = "closed";
    t.messages.push({ from: "system", text: "Клиент: 👍 помогло — вопрос решён, тикет закрыт", at });
  } else {
    Object.assign(t, { status: "needs_review", responded: false, waitingSince: at });
    t.messages.push(
      { from: "system", text: "Клиент: 👎 не помогло — тикет передан оператору", at },
      { from: "ai", text: `Понял, что ответ не помог. Подключаю оператора — он ответит в течение ${FIRST_RESPONSE_TEXT[t.result.urgency]}.`, at, ack: true },
    );
  }
  persist();
  return t;
}

/** То, что видит клиент: без внутренних системных заметок и разбора агента. */
export const customerView = (t: Ticket) => ({
  id: t.id,
  status: t.status,
  csat: t.csat ?? null,
  canRate: canRate(t),
  messages: t.messages.filter((m) => m.from !== "system"),
});
