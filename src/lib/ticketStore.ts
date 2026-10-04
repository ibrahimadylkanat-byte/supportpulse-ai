// Тикеты с перепиской — общий источник правды для панели оператора, чата клиента, Telegram и дашборда.
import fs from "node:fs";
import path from "node:path";
import type { AgentInput, DashboardTicket, Priority } from "./mockData.ts";
import type { AgentResult } from "./agent.ts";

export type Channel = "demo" | "chat" | "telegram";
export type TicketMsg = {
  from: "customer" | "ai" | "operator" | "system";
  text: string;
  at: number;
  voice?: boolean; // клиент надиктовал, текст — расшифровка
  image?: string; // фото от клиента (data URL, уменьшенное)
  ack?: boolean; // «передал оператору» — подтверждение, а не ответ по существу
};

export type Ticket = {
  id: string;
  channel: Channel;
  externalId?: string; // chat_id в Telegram
  customer: string;
  input: AgentInput; // последнее сообщение клиента
  result: AgentResult; // разбор последнего сообщения агентом
  status: DashboardTicket["status"];
  responded: boolean; // оператор ответил на последнее сообщение клиента
  messages: TicketMsg[];
  createdAt: number;
  waitingSince: number; // время последнего сообщения клиента — от него считается SLA
  csat?: "up" | "down"; // последняя оценка клиента
  ratedAt?: number; // когда оценил — следующий ответ оператора можно оценить снова
};

const FIRST_RESPONSE_MIN: Record<Priority, number> = { high: 15, medium: 60, low: 240 };
export const FIRST_RESPONSE_TEXT: Record<Priority, string> = { high: "15 минут", medium: "часа", low: "4 часов" };

type Db = { byId: Map<string, Ticket>; byKey: Map<string, string>; seq: number };

// ponytail: JSON-файл вместо БД — переживает перезапуск сервера на демо; при нескольких инстансах нужен Postgres/Redis.
// TICKETS_FILE="" отключает запись (тесты).
const file = () => {
  const f = process.env.TICKETS_FILE ?? "data/tickets.json";
  return f ? path.resolve(/*turbopackIgnore: true*/ f) : null;
};

function load(): Db {
  const db: Db = { byId: new Map(), byKey: new Map(), seq: 0 };
  const f = file();
  if (!f || !fs.existsSync(f)) return db;
  try {
    const saved = JSON.parse(fs.readFileSync(f, "utf8"));
    // Тикеты с испорченной кодировкой (символы �) не загружаем — это мусор, а не обращения
    for (const t of saved.tickets as Ticket[]) {
      if (!t.messages.some((m) => m.text.includes("\uFFFD"))) db.byId.set(t.id, t);
    }
    db.byKey = new Map(saved.keys);
    db.seq = saved.seq;
  } catch (e) {
    console.warn("Тикеты: не удалось прочитать", f, (e as Error).message);
  }
  return db;
}

// globalThis — чтобы перезагрузка модулей в dev и фоновый Telegram-поллер видели одни и те же данные
const g = globalThis as unknown as { __tickets?: Db; __ticketsTimer?: ReturnType<typeof setTimeout>; __dirty?: Set<string> };
const db = () => (g.__tickets ??= load());
const dirty = () => (g.__dirty ??= new Set());

// На Vercel несколько копий сервера, у каждой своя память — общий источник правды в Upstash Redis (REST, без зависимостей).
// Переменные добавляет интеграция Upstash в Vercel. Без них — файл, как на ноутбуке.
const redisUrl = () => process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const T = "sp:tickets", K = "sp:keys", S = "sp:seq";

async function redis(...cmd: (string | number)[]) {
  const res = await fetch(redisUrl()!, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN}` },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  return (await res.json()).result;
}

const pairs = (flat: string[] | null) => Array.from({ length: (flat?.length ?? 0) / 2 }, (_, i) => [flat![2 * i], flat![2 * i + 1]]);

/** Подтянуть тикеты из Redis в память этой копии сервера — в начале каждого запроса. */
export async function syncTickets() {
  if (!redisUrl()) return;
  const [tickets, keys] = await Promise.all([redis("HGETALL", T), redis("HGETALL", K)]);
  const d = db();
  d.byId = new Map(pairs(tickets).map(([id, json]) => [id, JSON.parse(json) as Ticket]));
  d.byKey = new Map(pairs(keys) as [string, string][]);
}

/** Записать изменённые тикеты в Redis — до ответа клиенту, пока функция Vercel не заморожена. */
export async function flushTickets() {
  if (!redisUrl() || !dirty().size) return;
  const ids = [...dirty()].filter((id) => db().byId.has(id));
  dirty().clear();
  if (ids.length) await redis("HSET", T, ...ids.flatMap((id) => [id, JSON.stringify(db().byId.get(id))]));
}

/** Обёртка для API-маршрутов: свежие тикеты до обработчика, запись — после. */
export const withTickets = <A extends unknown[]>(h: (...a: A) => Promise<Response>) => async (...a: A) => {
  await syncTickets();
  try {
    return await h(...a);
  } finally {
    await flushTickets();
  }
};

/** Сохранить: в Redis — помечаем тикет (пишет flushTickets), иначе на диск с задержкой — пачка изменений одним разом. */
export function persist(id?: string) {
  if (redisUrl()) {
    if (id) dirty().add(id);
    return;
  }
  const f = file();
  if (!f) return;
  clearTimeout(g.__ticketsTimer);
  g.__ticketsTimer = setTimeout(() => {
    const d = db();
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, JSON.stringify({ seq: d.seq, keys: [...d.byKey], tickets: [...d.byId.values()] }));
    } catch (e) {
      console.warn("Тикеты: не удалось сохранить", (e as Error).message);
    }
  }, 200);
}

/** dedupeKey: одно и то же демо-обращение — один тикет, перезагрузка панели не плодит дубли. */
export async function saveTicket(t: Omit<Ticket, "id">, dedupeKey?: string): Promise<Ticket> {
  const d = db();
  const prevId = dedupeKey ? d.byKey.get(dedupeKey) : undefined;
  // Номер из Redis общий для всех копий сервера — иначе две копии выдадут один и тот же L-001
  const id = prevId ?? `L-${String(redisUrl() ? await redis("INCR", S) : ++d.seq).padStart(3, "0")}`;
  const ticket = { ...t, id };
  d.byId.set(id, ticket);
  if (dedupeKey) {
    d.byKey.set(dedupeKey, id);
    if (redisUrl()) await redis("HSET", K, dedupeKey, id);
  }
  persist(id);
  return ticket;
}

export const getTicket = (id: string) => db().byId.get(id);
export const allTickets = () => [...db().byId.values()];

export const findOpenTicket = (channel: Channel, externalId: string) =>
  allTickets().find((t) => t.channel === channel && t.externalId === externalId && t.status !== "closed");

export const slaLeftMin = (t: Ticket, now = Date.now()) =>
  FIRST_RESPONSE_MIN[t.result.urgency] - Math.floor((now - t.waitingSince) / 60000);

/** Строки для таблицы дашборда. */
export function liveTickets(now = Date.now()): DashboardTicket[] {
  return allTickets().map((t) => ({
    id: t.id,
    customer: t.customer,
    topic: t.result.topic,
    priority: t.result.urgency,
    sentiment: t.result.sentiment,
    status: t.status,
    responded: t.responded,
    live: true,
    slaLeftMin: slaLeftMin(t, now),
  }));
}

/** Сброс перед новым демо. */
export async function clearTickets() {
  const d = db();
  d.byId.clear();
  d.byKey.clear();
  d.seq = 0;
  dirty().clear();
  if (redisUrl()) await redis("DEL", T, K, S);
  else persist();
}
