// СДЭК API v2. Без CDEK_CLIENT_ID/SECRET работает на mockData.
import { shipments, type CdekShipment } from "../mockData.ts";

const API = process.env.CDEK_API_URL ?? "https://api.cdek.ru/v2";
const live = () => Boolean(process.env.CDEK_CLIENT_ID && process.env.CDEK_CLIENT_SECRET);

let cached: { token: string; exp: number } | null = null;

async function authToken() {
  if (cached && cached.exp > Date.now()) return cached.token;
  const q = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.CDEK_CLIENT_ID!,
    client_secret: process.env.CDEK_CLIENT_SECRET!,
  });
  const res = await fetch(`${API}/oauth/token?${q}`, { method: "POST" });
  if (!res.ok) throw new Error(`СДЭК auth ${res.status}`);
  const j = await res.json();
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return cached.token;
}

const STATUS_MAP: Record<string, CdekShipment["status"]> = {
  DELIVERED: "delivered",
  ACCEPTED_AT_PICK_UP_POINT: "at_pvz",
  POSTOMAT_POSTED: "at_pvz",
  NOT_DELIVERED: "delayed",
};

export async function getShipment(track: string): Promise<CdekShipment | null> {
  if (!live()) return shipments.find((s) => s.track === track) ?? null;
  const res = await fetch(`${API}/orders?cdek_number=${encodeURIComponent(track)}`, {
    headers: { Authorization: `Bearer ${await authToken()}` },
  });
  if (!res.ok) return null;
  const e = (await res.json()).entity;
  const statuses: any[] = e.statuses ?? []; // СДЭК отдаёт свежие первыми
  const last = statuses[0];
  return {
    track,
    status: STATUS_MAP[last?.code] ?? "in_transit",
    statusText: last?.name ?? "—",
    location: last?.city ?? "—",
    pvzAddress: e.delivery_point_address?.address ?? e.to_location?.address ?? "—",
    // ponytail: плановая дата берётся из planned_delivery_date, если тариф его отдаёт
    plannedDate: e.planned_delivery_date ?? "—",
    events: statuses
      .slice()
      .reverse()
      .map((s) => ({ date: String(s.date_time).replace("T", " ").slice(0, 16), city: s.city, status: s.name })),
  };
}

const addDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

// ponytail: действия ниже — mock в обоих режимах; в СДЭК это делается через заявки/личный кабинет.
export async function extendStorage(track: string, days = 7) {
  const s = shipments.find((x) => x.track === track);
  if (!s) throw new Error("Отправление не найдено");
  s.storageUntil = addDays(s.storageUntil ?? s.plannedDate, days);
  return { storageUntil: s.storageUntil };
}

export async function createClaim(track: string) {
  return { claimId: `ПР-${track.slice(-6)}`, answerWithinDays: 10 };
}

export async function createReturnWaybill(orderId: string) {
  return { waybill: `${1107000000 + Number(orderId)}`, pvzHint: "Любой ПВЗ СДЭК, по номеру накладной" };
}
