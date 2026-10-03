// МойСклад: заказы покупателей. Без MOYSKLAD_TOKEN работает на mockData.
import { orders, type MsOrder } from "../mockData.ts";

const API = "https://api.moysklad.ru/api/remap/1.2";
const token = () => process.env.MOYSKLAD_TOKEN;

export const normalizePhone = (p: string) => {
  const d = p.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("8") ? "7" + d.slice(1) : d;
};

async function ms(path: string) {
  const res = await fetch(API + path, {
    headers: { Authorization: `Bearer ${token()}`, "Accept-Encoding": "gzip" },
  });
  if (!res.ok) throw new Error(`МойСклад ${res.status}`);
  return res.json();
}

// ponytail: трек СДЭК берётся из доп. поля "Трек СДЭК" — переименуйте под свою учётку.
function mapOrder(o: any): MsOrder {
  return {
    id: o.name,
    status: o.state?.name ?? "—",
    createdAt: String(o.moment).slice(0, 10),
    customerName: o.agent?.name ?? "—",
    phone: o.agent?.phone ?? "",
    items: (o.positions?.rows ?? []).map((r: any) => ({
      name: r.assortment?.name ?? "Товар",
      qty: r.quantity,
      price: r.price / 100,
    })),
    total: o.sum / 100,
    cdekTrack: o.attributes?.find((a: any) => a.name === "Трек СДЭК")?.value,
  };
}

const EXPAND = "expand=state,agent,positions.assortment";

export async function findOrderById(id: string): Promise<MsOrder | null> {
  if (!token()) return orders.find((o) => o.id === id) ?? null;
  const data = await ms(`/entity/customerorder?filter=name=${encodeURIComponent(id)}&${EXPAND}`);
  return data.rows?.[0] ? mapOrder(data.rows[0]) : null;
}

/** Заказы покупателя по телефону, свежие первыми. */
export async function findOrdersByPhone(phone: string): Promise<MsOrder[]> {
  const p = normalizePhone(phone);
  if (!token()) {
    return orders
      .filter((o) => normalizePhone(o.phone) === p)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const cp = await ms(`/entity/counterparty?search=${p}`);
  const agent = cp.rows?.[0];
  if (!agent) return [];
  const data = await ms(`/entity/customerorder?filter=agent=${agent.meta.href}&order=moment,desc&${EXPAND}`);
  return (data.rows ?? []).map(mapOrder);
}

// ponytail: mock — в реальном режиме это смена статуса customerorder через PUT /entity/customerorder/{id}.
export async function cancelOrder(orderId: string) {
  const o = orders.find((x) => x.id === orderId);
  if (!o) throw new Error("Заказ не найден");
  if (o.cdekTrack) throw new Error("Заказ уже передан в СДЭК — отменить нельзя, только отказ при получении");
  o.status = "Отменён";
  return { status: o.status, refund: o.total };
}

export async function createReturnRequest(orderId: string) {
  // ponytail: в реальном режиме — POST /entity/salesreturn с позициями отгрузки; пока mock всегда.
  return { returnId: `ВЗ-${orderId}-${Math.floor(Math.random() * 900 + 100)}` };
}
