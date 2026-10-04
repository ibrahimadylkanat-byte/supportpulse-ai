// Проактивная поддержка: AI сам находит проблемные заказы и пишет клиенту раньше, чем тот спросит.
// ponytail: обходит демо-заказы из mockData; с реальным МойСклад — выборка «Отгружен» за последние 2 недели.
import { fmtDate, type AgentResult } from "./agent.ts";
import { orders } from "./mockData.ts";
import { extendStorage, getShipment } from "./services/cdekService.ts";
import { saveTicket, type Ticket } from "./ticketStore.ts";

export async function runProactive(): Promise<Ticket[]> {
  const out: Ticket[] = [];
  for (const order of orders) {
    if (!order.cdekTrack) continue;
    const s = await getShipment(order.cdekTrack);
    if (!s) continue;
    const name = order.customerName.split(" ")[0];
    let text = "";
    let performed: string | undefined;

    if (s.status === "delayed") {
      // Хранение продлеваем один раз — повторный запуск (или агент на вопрос клиента) дату дальше не сдвигает
      if (!s.storageUntil) await extendStorage(s.track);
      performed = `продлил хранение в ПВЗ до ${fmtDate(s.storageUntil!)}`;
      text = `Здравствуйте, ${name}! Заказ №${order.id} задержался в пути, сейчас — ${s.location}. Мы уже продлили хранение в пункте выдачи до ${fmtDate(s.storageUntil!)} — ничего делать не нужно. Новая плановая дата — ${fmtDate(s.plannedDate)}. Извините за ожидание!`;
    } else if (s.status === "at_pvz" && s.storageUntil) {
      text = `Здравствуйте, ${name}! Заказ №${order.id} ждёт вас в пункте выдачи: ${s.pvzAddress}. Хранение — до ${fmtDate(s.storageUntil)}. Не успеваете? Ответьте на это сообщение — продлим.`;
    } else if (s.status === "in_transit") {
      text = `Здравствуйте, ${name}! Заказ №${order.id} в пути, сейчас — ${s.location}. Плановая дата доставки — ${fmtDate(s.plannedDate)}, пункт выдачи: ${s.pvzAddress}.`;
    } else continue;

    const at = Date.now();
    const result: AgentResult = {
      intent: "order_status_check", topic: "Проактивное уведомление", urgency: "low", confidence: 1, sentiment: "neutral",
      mode: "auto", reply: text, order, shipment: s, kb: [], actions: [], performed: performed ? [performed] : [],
      lookup: "AI нашёл сам", engine: "rules", replySource: "template",
    };
    out.push(await saveTicket(
      {
        channel: "proactive", customer: order.customerName, input: { message: "", order_id: order.id }, result,
        status: "auto_resolved", responded: true, createdAt: at, waitingSince: at,
        messages: [
          ...(performed ? [{ from: "system" as const, text: `🤖 AI выполнил: ${performed}`, at }] : []),
          { from: "ai", text, at },
        ],
      },
      `proactive:${order.id}`,
    ));
  }
  return out;
}
