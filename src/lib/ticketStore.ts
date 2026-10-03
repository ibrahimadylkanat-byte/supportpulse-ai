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
const g = globalThis as unknown as { __tickets?: Db; __ticketsTimer?: ReturnType<typeof setTimeout> };
const db = () => (g.__tickets ??= load());

/** Сохранить на диск (с задержкой — пачка изменений пишется одним разом). */
export function persist() {
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
export function saveTicket(t: Omit<Ticket, "id">, dedupeKey?: string): Ticket {
  const d = db();
  const prevId = dedupeKey ? d.byKey.get(dedupeKey) : undefined;
  const id = prevId ?? `L-${String(++d.seq).padStart(3, "0")}`;
  const ticket = { ...t, id };
  d.byId.set(id, ticket);
  if (dedupeKey) d.byKey.set(dedupeKey, id);
  persist();
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
export function clearTickets() {
  const d = db();
  d.byId.clear();
  d.byKey.clear();
  d.seq = 0;
  persist();
}
