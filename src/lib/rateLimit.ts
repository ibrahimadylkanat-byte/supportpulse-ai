// ponytail: лимит в памяти процесса — защищает квоту LLM, когда чат открыт в интернет через туннель на демо.
const hits = new Map<string, number[]>();

export const clientIp = (req: Request) =>
  req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";

/** true — превышен лимит: не больше max запросов за windowMs с одного IP (по ключу). */
// 30, а не 8: всё жюри на одном Wi-Fi зала — это один IP
export function tooMany(key: string, max = 30, windowMs = 60_000, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}
