import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "SupportPulse AI",
  description: "AI-ассистент клиентской поддержки для e-commerce",
};

// Тема ставится до рендера, чтобы не мигало: выбор пользователя, иначе системная.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning className={`${inter.variable} ${manrope.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_10%_-10%,rgba(37,99,235,0.10),transparent),radial-gradient(50rem_25rem_at_100%_0%,rgba(14,165,233,0.08),transparent)] dark:bg-[radial-gradient(60rem_30rem_at_10%_-10%,rgba(37,99,235,0.18),transparent),radial-gradient(50rem_25rem_at_100%_0%,rgba(14,165,233,0.10),transparent)]" />
        {children}
      </body>
    </html>
  );
}
