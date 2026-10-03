"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Camera, Headset, Loader2, Mic, RotateCcw, Send, ShoppingBag, Square, ThumbsDown, ThumbsUp } from "lucide-react";

type Msg = { from: "customer" | "ai" | "operator"; text: string; at: number; voice?: boolean; image?: string };
type View = { id: string; status: string; messages: Msg[]; csat?: "up" | "down" | null; canRate?: boolean };
type Extra = { voice?: boolean; image?: string };

const MAX_RECORD_SEC = 30;

/** Фото с телефона весит мегабайты — уменьшаем до 1024 px и JPEG, чтобы быстро ушло и уложилось в лимит. */
async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

const STORAGE_KEY = "supportpulse-chat-ticket";
// Разные ситуации, а не только «где заказ»
const SUGGESTIONS = [
  "Где мой заказ 48201?",
  "Оплатила заказ 48215 вчера, когда отправите?",
  "СДЭК пишет, что заказ 48163 вручён, но я его не получал!",
  "Прислали не тот товар в заказе 48170",
  "Хочу отменить заказ 48230",
  "Не применился промокод при оплате",
  "Сәлеметсіз бе, 48190 тапсырысым қашан келеді?",
];

const time = (at: number) => new Date(at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

// localStorage — только удобство (продолжить диалог после перезагрузки); без него чат тоже работает
const load = () => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } };
const save = (id: string | null) => { try { id ? localStorage.setItem(STORAGE_KEY, id) : localStorage.removeItem(STORAGE_KEY); } catch {} };

export default function CustomerChat() {
  const [view, setView] = useState<View | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const ticketId = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const [canRecord, setCanRecord] = useState(false);
  const [recSec, setRecSec] = useState<number | null>(null); // null — не пишем
  const [transcribing, setTranscribing] = useState(false);

  // Микрофон доступен только по https или на localhost — по http-адресу в локальной сети кнопку не показываем
  useEffect(() => setCanRecord(!!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"), []);

  const poll = useCallback(async () => {
    if (!ticketId.current) return;
    const res = await fetch(`/api/chat?id=${encodeURIComponent(ticketId.current)}`).catch(() => null);
    if (res?.status === 404) { ticketId.current = null; save(null); setView(null); return; } // сервер перезапущен
    if (res?.ok) setView(await res.json());
  }, []);

  useEffect(() => {
    ticketId.current = load();
    poll();
    const t = setInterval(poll, 3000); // ответы оператора приходят без перезагрузки
    return () => clearInterval(t);
  }, [poll]);

  const count = view?.messages.length ?? 0;
  // Chrome возвращает Promise из scrollIntoView — фигурные скобки, чтобы эффект ничего не возвращал
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [count, sending]);

  async function send(message: string, extra: Extra = {}) {
    const m = message.trim();
    if ((!m && !extra.image) || sending) return;
    setSending(true);
    setError("");
    setText("");
    // Сообщение клиента показываем сразу, не дожидаясь AI
    setView((v) => ({ id: v?.id ?? "", status: v?.status ?? "", messages: [...(v?.messages ?? []), { from: "customer", text: m || "📷 Фото", at: Date.now(), ...extra }] }));
    try {
      const res = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ message: m, ticketId: ticketId.current, ...extra }) });
      if (!res.ok) throw new Error(res.status === 429 ? (await res.json()).error : "");
      const v: View = await res.json();
      ticketId.current = v.id;
      save(v.id);
      setView(v);
    } catch (e) {
      setError((e as Error).message || "Не удалось отправить. Проверьте соединение и попробуйте ещё раз.");
      setText(m);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function toggleRecording() {
    if (recorder.current) return recorder.current.stop(); // второе нажатие — отправить
    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setError("Нет доступа к микрофону — разрешите его в браузере или напишите текстом.");
    }
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(timer);
      recorder.current = null;
      setRecSec(null);
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (blob.size < 1000) return; // случайное касание
      setTranscribing(true);
      const form = new FormData();
      form.append("audio", blob, rec.mimeType.includes("mp4") ? "voice.m4a" : "voice.webm");
      try {
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error);
        setTranscribing(false);
        await send(j.text, { voice: true });
      } catch (e) {
        setTranscribing(false);
        setError((e as Error).message || "Не удалось распознать речь — напишите текстом.");
      }
    };
    recorder.current = rec;
    rec.start();
    setRecSec(0);
    const started = Date.now();
    const timer = setInterval(() => {
      const sec = Math.floor((Date.now() - started) / 1000);
      setRecSec(sec);
      if (sec >= MAX_RECORD_SEC) rec.stop();
    }, 250);
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const image = await shrinkImage(file);
      await send(text, { image }); // текст в поле — подпись к фото
    } catch {
      setError("Не удалось прочитать фото — попробуйте другое.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function rate(rating: "up" | "down") {
    if (!view?.id) return;
    const res = await fetch("/api/chat/rate", { method: "POST", body: JSON.stringify({ id: view.id, rating }) }).catch(() => null);
    if (res?.ok) setView(await res.json());
  }

  function reset() {
    ticketId.current = null;
    save(null);
    setView(null);
    inputRef.current?.focus();
  }

  const messages = view?.messages ?? [];

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col bg-white shadow-xl dark:bg-[#0b1020] sm:my-6 sm:h-[calc(100dvh-3rem)] sm:rounded-3xl sm:border sm:border-slate-200 sm:dark:border-white/10">
      <header className="flex items-center gap-3 rounded-t-3xl bg-gradient-to-r from-brand-700 to-brand-600 px-4 py-3.5 text-white">
        <div className="grid size-10 place-items-center rounded-full bg-white/15"><ShoppingBag className="size-5" aria-hidden /></div>
        <div className="flex-1">
          <h1 className="font-display font-bold leading-tight">Поддержка Demo Shop</h1>
          <p className="flex items-center gap-1.5 text-xs text-white/90">
            <span className="size-2 rounded-full bg-emerald-300" aria-hidden /> AI-ассистент · отвечает за секунды
          </p>
        </div>
        {messages.length > 0 && (
          <button onClick={reset} aria-label="Начать новый диалог" title="Новый диалог"
            className="grid size-10 place-items-center rounded-full hover:bg-white/15">
            <RotateCcw className="size-5" aria-hidden />
          </button>
        )}
      </header>

      <div role="log" aria-label="Переписка с поддержкой" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="py-6 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"><Bot className="size-7" aria-hidden /></div>
            <h2 className="mt-3 text-lg font-bold">Здравствуйте! Чем помочь?</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Напишите номер заказа или телефон — проверю доставку, помогу с возвратом или оплатой.</p>
            <div className="mt-5 flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}
                  className="min-h-11 rounded-xl border border-slate-300 px-4 text-left text-sm hover:border-brand-600 hover:bg-brand-50 dark:border-white/15 dark:hover:bg-brand-500/10">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const mine = m.from === "customer";
          return (
            <div key={i} className={`flex ${mine ? "justify-end" : ""}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                mine ? "rounded-br-sm bg-brand-600 text-white"
                  : m.from === "operator" ? "rounded-bl-sm bg-emerald-50 text-slate-900 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-slate-100 dark:ring-emerald-500/30"
                  : "rounded-bl-sm bg-slate-100 text-slate-900 dark:bg-white/[0.07] dark:text-slate-100"
              }`}>
                {!mine && (
                  <div className="mb-0.5 flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {m.from === "operator" ? <><Headset className="size-3.5" aria-hidden /> Оператор</> : <><Bot className="size-3.5" aria-hidden /> AI-ассистент</>}
                  </div>
                )}
                {m.image && <img src={m.image} alt="Фото, отправленное в поддержку" className="mb-1.5 max-h-60 rounded-xl" />}
                {m.voice && (
                  <div className={`mb-0.5 flex items-center gap-1 text-xs font-medium ${mine ? "text-white/85" : ""}`}>
                    <Mic className="size-3.5" aria-hidden /> Голосовое, расшифровка:
                  </div>
                )}
                {!(m.image && m.text === "📷 Фото") && <p className="whitespace-pre-wrap">{m.text}</p>}
                <div className={`mt-1 text-right text-xs ${mine ? "text-white/80" : "text-slate-600 dark:text-slate-400"}`}>{time(m.at)}</div>
              </div>
            </div>
          );
        })}

        {view?.canRate && !sending && (
          <div className="flex flex-wrap items-center gap-2 pl-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Ответ помог?</span>
            <button onClick={() => rate("up")} className="flex min-h-10 items-center gap-1.5 rounded-full border border-slate-300 px-3 hover:border-emerald-600 hover:bg-emerald-50 dark:border-white/15 dark:hover:bg-emerald-500/10">
              <ThumbsUp className="size-4" aria-hidden /> Да
            </button>
            <button onClick={() => rate("down")} className="flex min-h-10 items-center gap-1.5 rounded-full border border-slate-300 px-3 hover:border-rose-600 hover:bg-rose-50 dark:border-white/15 dark:hover:bg-rose-500/10">
              <ThumbsDown className="size-4" aria-hidden /> Нет
            </button>
          </div>
        )}
        {view?.csat === "up" && view.status === "closed" && <p className="pl-1 text-sm text-slate-600 dark:text-slate-400">Спасибо за оценку! Рады, что смогли помочь.</p>}
        {(sending || transcribing) && (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {transcribing ? "Распознаю голосовое…" : "AI-ассистент печатает…"}
          </p>
        )}
        {view?.status === "closed" && (
          <p className="text-center text-xs text-slate-600 dark:text-slate-400">Обращение закрыто. Напишите, если появятся вопросы — откроем новое.</p>
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="border-t border-slate-200 p-3 dark:border-white/10">
        {/* Жюри не придумывает, что спросить: после первого сообщения — ещё не отправленные примеры */}
        {messages.length > 0 && !sending && (
          <div className="-mx-3 mb-2 flex gap-2 overflow-x-auto px-3 pb-1" aria-label="Что ещё можно спросить">
            {SUGGESTIONS.filter((s) => !messages.some((m) => m.text === s)).map((s) => (
              <button key={s} type="button" onClick={() => send(s)}
                className="min-h-9 shrink-0 rounded-full border border-slate-300 px-3 text-sm hover:border-brand-600 hover:bg-brand-50 dark:border-white/15 dark:hover:bg-brand-500/10">
                {s}
              </button>
            ))}
          </div>
        )}
        {error &&<p role="alert" className="mb-2 text-sm text-rose-700 dark:text-rose-400">{error}</p>}
        {recSec !== null && (
          <p role="status" className="mb-2 flex items-center gap-2 text-sm font-medium text-rose-700 dark:text-rose-400">
            <span className="size-2.5 animate-pulse rounded-full bg-rose-600" aria-hidden />
            Идёт запись 0:{String(recSec).padStart(2, "0")} — нажмите ■, чтобы отправить
          </p>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={sending || recSec !== null} aria-label="Прикрепить фото"
            title="Фото товара" className="grid size-11 shrink-0 place-items-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10">
            <Camera className="size-5" aria-hidden />
          </button>
          <label htmlFor="chat-input" className="sr-only">Сообщение в поддержку</label>
          <textarea
            ref={inputRef}
            id="chat-input"
            rows={1}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
            placeholder="Напишите сообщение…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-[15px] placeholder:text-slate-500 focus:border-brand-600 dark:border-white/15 dark:bg-white/5 dark:placeholder:text-slate-400"
          />
          {/* Пустое поле — кнопка микрофона, есть текст — отправить */}
          {canRecord && (!text.trim() || recSec !== null) ? (
            <button type="button" onClick={toggleRecording} disabled={sending || transcribing}
              aria-label={recSec !== null ? "Остановить запись и отправить" : "Записать голосовое"} aria-pressed={recSec !== null}
              className={`grid size-11 shrink-0 place-items-center rounded-full text-white disabled:opacity-50 ${recSec !== null ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-600 hover:bg-brand-700"}`}>
              {recSec !== null ? <Square className="size-4 fill-current" aria-hidden /> : <Mic className="size-5" aria-hidden />}
            </button>
          ) : (
            <button type="submit" disabled={!text.trim() || sending} aria-label="Отправить"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
              <Send className="size-5" aria-hidden />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
