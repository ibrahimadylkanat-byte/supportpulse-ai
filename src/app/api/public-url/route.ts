import { networkInterfaces } from "node:os";

// Адрес для QR-кода: PUBLIC_URL (туннель/деплой), иначе IP компьютера в локальной сети
export async function GET(req: Request) {
  const port = new URL(req.url).port || "3000";
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i!.address}:${port}`);
  return Response.json({ configured: process.env.PUBLIC_URL?.replace(/\/$/, "") || null, lan });
}
