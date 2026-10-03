import type { NextConfig } from "next";

const config: NextConfig = {
  // Dev-сервер по умолчанию не отдаёт ресурсы чужим хостам — разрешаем туннель для демо с телефонов жюри
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default config;
