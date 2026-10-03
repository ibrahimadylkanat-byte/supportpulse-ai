import { cancelOrder, createReturnRequest } from "@/lib/services/moyskladService";
import { createClaim, createReturnWaybill, extendStorage } from "@/lib/services/cdekService";
import { addSystemMessage } from "@/lib/inbox";

export async function POST(req: Request) {
  const { action, order_id, track, ticket_id } = await req.json().catch(() => ({}));
  const res = await run(action, order_id, track);
  // Результат действия — в переписку тикета, чтобы его видели все операторы
  if (typeof ticket_id === "string") {
    const j = await res.clone().json();
    addSystemMessage(ticket_id, res.ok ? `✓ ${j.message}` : `Ошибка: ${j.error}`);
  }
  return res;
}

async function run(action: unknown, order_id: unknown, track: unknown): Promise<Response> {
  // Возврат без найденного заказа давал «накладная №NaN» — сначала нужен номер заказа
  if ((action === "create_return_waybill" || action === "create_return_request" || action === "cancel_order") && !/^\d+$/.test(String(order_id ?? ""))) {
    return Response.json({ error: "Заказ не найден — уточните у клиента номер заказа или телефон" }, { status: 422 });
  }
  if ((action === "extend_storage" || action === "cdek_claim") && !track) {
    return Response.json({ error: "У заказа нет отправления СДЭК" }, { status: 422 });
  }
  try {
    switch (action) {
      case "extend_storage": {
        const r = await extendStorage(String(track));
        return Response.json({ ...r, message: `Хранение в ПВЗ продлено до ${r.storageUntil}` });
      }
      case "create_return_waybill": {
        const r = await createReturnWaybill(String(order_id));
        return Response.json({ ...r, message: `Накладная СДЭК на возврат №${r.waybill} создана` });
      }
      case "cancel_order": {
        const r = await cancelOrder(String(order_id));
        return Response.json({ ...r, message: `Заказ №${order_id} отменён в МойСклад, возврат ${r.refund.toLocaleString("ru-RU")} ₸` });
      }
      case "cdek_claim": {
        const r = await createClaim(String(track));
        return Response.json({ ...r, message: `Претензия ${r.claimId} открыта в СДЭК, ответ до ${r.answerWithinDays} рабочих дней` });
      }
      case "create_return_request": {
        const r = await createReturnRequest(String(order_id));
        return Response.json({ ...r, message: `Заявка на возврат ${r.returnId} создана в МойСклад` });
      }
      default:
        return Response.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 422 });
  }
}
