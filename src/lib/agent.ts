// Движок AI-агента: классификация интента → вызов МойСклад/СДЭК/базы знаний → ответ или черновик.
import {
  knowledgeBase,
  type AgentInput,
  type CdekShipment,
  type KbArticle,
  type MsOrder,
} from "./mockData.ts";
import { findOrderById, findOrdersByPhone } from "./services/moyskladService.ts";
import { extendStorage, getShipment } from "./services/cdekService.ts";

export type Intent = "order_status_check" | "return_request" | "order_change" | "general_faq";
export type ActionId = "extend_storage" | "create_return_waybill" | "create_return_request" | "cancel_order" | "cdek_claim";

/** Клиент утверждает, что не получал посылку, которую СДЭК считает вручённой. */
const NOT_RECEIVED = /не получал|не получила|не забирал|не забирала|не получил|никто не приходил|мне не отдали/;
export type QuickAction = { id: ActionId; label: string };

export type Sentiment = "positive" | "neutral" | "negative";

export function sentimentRules(message: string): Sentiment {
  const m = message.toLowerCase();
  if (/!!|\?\?|третий день|до сих пор|сколько можно|ужас|безобраз|брак|сломан/.test(m)) return "negative";
  if (/спасибо|благодар|отлично|супер|класс/.test(m)) return "positive";
  return "neutral";
}

export type Classification = {
  intent: Intent;
  topic: string;
  urgency: "low" | "medium" | "high";
  confidence: number;
  sentiment: Sentiment;
};

export type AgentResult = Classification & {
  mode: "auto" | "draft"; // auto = deflection, draft = нужна проверка оператора
  reply: string;
  order: MsOrder | null;
  shipment: CdekShipment | null;
  kb: KbArticle[];
  actions: QuickAction[]; // кнопки для оператора
  performed?: string[]; // что агент уже сделал сам (видно оператору и на экране демо)
  lookup: string | null; // как нашли заказ
  engine: "groq" | "gemini" | "rules"; // кто разобрал обращение
  model?: string; // какая модель ответила
  replySource: "llm" | "template"; // кто написал текст ответа
};

const AUTO_THRESHOLD = 0.9;

export const fmtDate = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(iso)
    ? new Date(iso.slice(0, 10)).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
    : iso;

export function extractOrderId(text: string) {
  // «№48201», «заказ 48201», а если нет — отдельное 5–6-значное число (подходит и для «Тапсырыс 48201»; телефоны длиннее)
  return text.match(/(?:№|#|заказ\D{0,3})\s*(\d{5,})/i)?.[1] ?? text.match(/(?<![\d+])\b(\d{5,6})\b(?!\d)/)?.[1] ?? null;
}

export function extractPhone(text: string) {
  return text.match(/(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/)?.[0] ?? null;
}

export function classifyRules(message: string): Classification {
  return { ...classifyRulesBase(message), sentiment: sentimentRules(message) };
}

function classifyRulesBase(message: string): Omit<Classification, "sentiment"> {
  const m = message.toLowerCase();
  const angry = /!!|\?\?|третий день|до сих пор|сколько можно|ужас/.test(m);
  if (/не тот товар|прислали не то|прислали не тот|пришёл не тот|пришел не тот|перепутали|другую модель|другой модели|не тот цвет/.test(m))
    return { intent: "return_request", topic: "Ошибка комплектации", urgency: angry ? "high" : "medium", confidence: 0.9 };
  if (/брак|сломан|дефект|не работает|порван/.test(m))
    return { intent: "return_request", topic: "Бракованный товар", urgency: "high", confidence: 0.9 };
  if (/отмен|передумал|не нужен заказ/.test(m))
    return { intent: "order_change", topic: "Отмена заказа", urgency: "medium", confidence: 0.9 };
  if (/адрес|пвз|пункт выдачи/.test(m) && /смен|измен|поменя|другой|переадрес/.test(m))
    return { intent: "general_faq", topic: "Изменение заказа", urgency: "low", confidence: 0.85 };
  if (/верну|возврат|размер|не подош|обмен|поменя/.test(m))
    return { intent: "return_request", topic: "Возвраты", urgency: angry ? "high" : "medium", confidence: 0.88 };
  // «Оплатила, когда отправите?» — вопрос о статусе, а не об оплате: ловим только проблемы и способы оплаты
  if (/списал|дважды|двойн|оплатить|способ оплаты|как оплат|не прошла оплата|ошибка оплаты|чек|kaspi|рассрочк|промокод|скидк|купон/.test(m))
    return { intent: "general_faq", topic: "Вопросы по оплате", urgency: angry ? "high" : "low", confidence: 0.8 };
  if (NOT_RECEIVED.test(m)) return { intent: "order_status_check", topic: "Где заказ", urgency: "high", confidence: 0.9 };
  if (/где|когда|приед|придёт|придет|прийти|не пришё|не прише|не пришл|не доставил|жду|статус|отправ|трек|посылк|қашан|қайда|келеді|жіберіл/.test(m))
    return { intent: "order_status_check", topic: "Где заказ", urgency: angry ? "high" : "low", confidence: 0.9 };
  return { intent: "general_faq", topic: "Общие вопросы", urgency: "low", confidence: 0.7 };
}

const KB_INDEX = knowledgeBase.map((a) => `- ${a.id}: ${a.title}. ${a.text}`).join("\n");

/** id статей от модели → статьи; неизвестные id отбрасываются. */
export function kbByIds(ids: unknown): KbArticle[] {
  if (!Array.isArray(ids)) return [];
  return ids.flatMap((id) => knowledgeBase.filter((a) => a.id === id)).slice(0, 2);
}

const SYSTEM_PROMPT =
  "Ты AI-ассистент поддержки интернет-магазина. Разбери обращение клиента и напиши ему ответ. Верни только JSON без пояснений: " +
  '{"intent":"order_status_check"|"return_request"|"order_change"|"general_faq",' +
  '"topic":"Где заказ"|"Возвраты"|"Бракованный товар"|"Ошибка комплектации"|"Отмена заказа"|"Изменение заказа"|"Вопросы по оплате"|"Общие вопросы",' +
  '"urgency":"low"|"medium"|"high","confidence":число 0..1,"sentiment":"positive"|"neutral"|"negative",' +
  '"kb_ids":[id статей базы знаний, которые отвечают на вопрос клиента, до 2, самая релевантная первой; [] если ни одна не подходит],' +
  '"reply":"ответ клиенту"}\n' +
  "Клиенты пишут с опечатками и разговорно («размерчик не тот» = возврат по размеру).\n" +
  "Правила ответа (reply):\n" +
  "- Отвечай на языке клиента: написал по-казахски — отвечай по-казахски, по-русски — по-русски. " +
  "2–4 предложения, обращайся по имени, если оно есть в фактах.\n" +
  "- Используй ТОЛЬКО данные из блока ФАКТЫ и базы знаний. Не придумывай даты, адреса, номера, суммы и сроки.\n" +
  "- Номер заказа и трек-номер пиши ровно как в фактах. Если для ответа не хватает данных — попроси номер заказа или телефон.\n" +
  "- Тон по настроению: negative — начни с искреннего извинения и признай неудобство, без канцелярита; " +
  "neutral — дружелюбно и по делу; positive — тепло, можно поблагодарить.\n" +
  "- Не обещай того, чего нет в фактах (компенсации, скидки, конкретные сроки решения).\n" +
  "База знаний:\n" +
  KB_INDEX;

// ponytail: кэш в памяти процесса — у бесплатных тарифов LLM жёсткие лимиты, а демо при каждой загрузке шлёт 4 сценария.
const llmCache = new Map<string, Awaited<ReturnType<typeof analyzeLlm>>>();

/** Факты о заказе для промпта: модель пишет ответ только по ним. */
function factsText(order: MsOrder | null, shipment: CdekShipment | null, phoneOrders: number) {
  if (!order) return "Заказ не найден: клиент не указал номер заказа или телефон, либо по ним ничего нет.";
  const lines = [
    `Клиент: ${order.customerName}`,
    `Заказ №${order.id} (МойСклад: ${order.status}, оформлен ${fmtDate(order.createdAt)}): ` +
      order.items.map((i) => `${i.name} × ${i.qty} — ${i.price} ₸`).join("; ") + `; итого ${order.total} ₸`,
  ];
  if (phoneOrders > 1) lines.push(`По телефону найдено ${phoneOrders} заказа, это последний.`);
  if (shipment) {
    lines.push(
      `СДЭК, трек ${shipment.track}: ${shipment.statusText}; сейчас: ${shipment.location}; ` +
        `ПВЗ: ${shipment.pvzAddress}; плановая дата доставки: ${fmtDate(shipment.plannedDate)}` +
        (shipment.storageUntil ? `; хранение в ПВЗ до ${fmtDate(shipment.storageUntil)}` : ""),
      `События СДЭК: ${shipment.events.map((e) => `${e.date} ${e.city} — ${e.status}`).join("; ")}`,
    );
  }
  return lines.join("\n");
}

/**
 * Ответ модели принимается, только если в нём нет «выдуманных» чисел: каждое число от 3 цифр
 * (номер заказа, трек, сумма, год) должно встречаться в фактах. Иначе — шаблонный ответ.
 */
export function replyIsGrounded(reply: string, facts: string, orderId?: string) {
  const r = normDigits(reply);
  if (r.length < 20 || r.length > 1500) return false;
  if (orderId && !r.includes(orderId)) return false;
  return ungrounded(reply, facts).length === 0;
}

// «38 900» → «38900», «+7 707 123 45 67» → «+77071234567»: сравниваем числа без пробелов
const normDigits = (s: string) => s.replace(/(\d)[\s -](?=\d)/g, "$1");

/** Числа из ответа (от 3 цифр), которых нет в источнике. */
function ungrounded(reply: string, source: string) {
  const f = normDigits(source);
  return (normDigits(reply).match(/\d{3,}/g) ?? []).filter((n) => !f.includes(n));
}

// Цепочка LLM: Groq (быстрый, щедрый бесплатный лимит) → Gemini → правила.
// У каждой модели своя квота: исчерпанная или упавшая модель пропускается до сброса, запрос уходит следующей.
type Provider = "groq" | "gemini";
type Llm = { provider: Provider; model: string };

const list = (v: string | undefined, def: string) => (v || def).split(",").map((m) => m.trim()).filter(Boolean);
const llmChain = (): Llm[] => [
  ...(process.env.GROQ_API_KEY
    ? list(process.env.GROQ_MODEL, "qwen/qwen3.8-27b,openai/gpt-oss-120b").map((model) => ({ provider: "groq" as const, model }))
    : []),
  ...(process.env.GEMINI_API_KEY
    ? list(process.env.GEMINI_MODEL, "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite").map((model) => ({ provider: "gemini" as const, model }))
    : []),
];
const blockedUntil = new Map<string, number>(); // "provider:model" → когда снова пробовать

function callModel({ provider, model }: Llm, system: string, user: string): Promise<Response> {
  const signal = AbortSignal.timeout(8000); // на демо лучше следующая модель или шаблон, чем зависший чат
  if (provider === "groq") {
    return fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
      signal,
    });
  }
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
    }),
    signal,
  });
}

async function textOf(provider: Provider, res: Response): Promise<string> {
  const d = await res.json();
  return provider === "groq"
    ? (d.choices?.[0]?.message?.content ?? "")
    : (d.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "");
}

/** JSON-ответ первой доступной модели из цепочки. */
export async function completeJson(system: string, user: string): Promise<{ json: any; llm: Llm }> {
  let lastError = "LLM не настроен (нет GROQ_API_KEY / GEMINI_API_KEY)";
  for (const llm of llmChain()) {
    const id = `${llm.provider}:${llm.model}`;
    if ((blockedUntil.get(id) ?? 0) > Date.now()) continue;
    let res: Response;
    try {
      res = await callModel(llm, system, user);
    } catch (e) {
      // таймаут или сеть — минута паузы и следующая модель
      blockedUntil.set(id, Date.now() + 60_000);
      lastError = `${id}: ${(e as Error).message}`;
      console.warn(`LLM: ${id} не ответила (${(e as Error).message}) — пробую следующую`);
      continue;
    }
    if (res.ok) {
      try {
        const text = await textOf(llm.provider, res);
        return { json: JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? ""), llm };
      } catch {
        lastError = `${id}: ответ не JSON`;
        continue;
      }
    }
    const body = await res.text();
    lastError = `${id} ${res.status}: ${body.slice(0, 160)}`;
    if (res.status === 429 || res.status >= 500) {
      // Groq отдаёт retry-after в заголовке, Gemini — retryDelay в теле
      const delay = Math.ceil(Number(res.headers.get("retry-after") ?? body.match(/"retryDelay":\s*"([\d.]+)s"/)?.[1] ?? 60));
      blockedUntil.set(id, Date.now() + delay * 1000);
      console.warn(`LLM: ${id} недоступна (${res.status}), пауза ${delay} с — пробую следующую`);
    }
  }
  throw new Error(lastError);
}

// Один вызов LLM: интент, настроение, статьи базы знаний и текст ответа с тоном под настроение клиента.
/**
 * Модель иногда ставит верную тему, но «общий вопрос» как интент — и возврат уходил бы в автоответ.
 * Для тем, где нужен оператор или своя логика, интент выводим из темы.
 */
export function intentForTopic(topic: unknown): Intent | undefined {
  if (topic === "Возвраты" || topic === "Бракованный товар" || topic === "Ошибка комплектации") return "return_request";
  if (topic === "Отмена заказа") return "order_change";
  return undefined;
}

async function analyzeLlm(message: string, facts: string): Promise<Classification & { kb: KbArticle[]; reply: string; llm: Llm }> {
  const { json, llm } = await completeJson(SYSTEM_PROMPT, `Сообщение клиента:\n${message}\n\nФАКТЫ (МойСклад, СДЭК):\n${facts}`);
  const rules = classifyRules(message);
  return {
    intent: intentForTopic(json.topic) ?? (["order_status_check", "return_request", "order_change", "general_faq"].includes(json.intent) ? json.intent : rules.intent),
    topic: typeof json.topic === "string" ? json.topic : rules.topic,
    urgency: ["low", "medium", "high"].includes(json.urgency) ? json.urgency : rules.urgency,
    confidence: Math.min(1, Math.max(0, Number(json.confidence) || rules.confidence)),
    sentiment: ["positive", "neutral", "negative"].includes(json.sentiment) ? json.sentiment : rules.sentiment,
    kb: kbByIds(json.kb_ids),
    reply: typeof json.reply === "string" ? json.reply.trim() : "",
    llm,
  };
}

// ponytail: RAG = поиск по ключевым словам в JSON; эмбеддинги — когда статей станет сотни.
export function searchKb(message: string, limit = 2) {
  const m = message.toLowerCase();
  return knowledgeBase
    // длина совпавших слов: «промокод» специфичнее, чем «оплат», — при равном числе совпадений побеждает точное
    .map((a) => ({ a, score: a.keywords.filter((k) => m.includes(k)).reduce((s, k) => s + k.length, 0) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.a);
}

export async function runAgent(input: AgentInput): Promise<AgentResult> {
  const message = input.message.trim();

  // Поиск заказа: явный order_id → номер в тексте → телефон (поле или текст)
  let order: MsOrder | null = null;
  let lookup: string | null = null;
  const orderId = input.order_id || extractOrderId(message);
  if (orderId) {
    order = await findOrderById(orderId);
    if (order) lookup = `МойСклад: заказ №${orderId}`;
  }
  const phone = input.phone || extractPhone(message);
  let phoneOrders = 0;
  if (!order && phone) {
    const found = await findOrdersByPhone(phone);
    order = found[0] ?? null;
    phoneOrders = found.length;
    if (order) lookup = `МойСклад: поиск по телефону ${phone} → ${found.length} заказ(а), взят последний`;
  }
  const shipment = order?.cdekTrack ? await getShipment(order.cdekTrack) : null;

  // Агент сам выполняет безопасное действие: доставка задерживается → заранее продлеваем хранение в ПВЗ.
  // Один раз на отправление: если срок уже продлён, повторно не трогаем.
  const performed: string[] = [];
  if (shipment?.status === "delayed" && !shipment.storageUntil) {
    try {
      shipment.storageUntil = (await extendStorage(shipment.track)).storageUntil;
      performed.push(`Продлил бесплатное хранение в ПВЗ до ${fmtDate(shipment.storageUntil)}`);
    } catch (e) {
      console.warn("Не удалось продлить хранение автоматически:", (e as Error).message);
    }
  }
  const facts =
    factsText(order, shipment, phoneOrders) +
    (performed.length ? `\nУже сделано автоматически (сообщи клиенту): ${performed.join("; ")}` : "");

  let engine: AgentResult["engine"] = "rules";
  let model: string | undefined;
  let cls = classifyRules(message);
  let llmKb: KbArticle[] = [];
  let llmReply = "";
  if (process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY) {
    try {
      const key = `${message}\n${facts}`;
      const hit = llmCache.get(key) ?? (await analyzeLlm(message, facts));
      llmCache.set(key, hit);
      const { kb, reply, llm, ...c } = hit;
      cls = c;
      llmKb = kb;
      llmReply = reply;
      engine = llm.provider;
      model = llm.model;
    } catch (e) {
      console.warn("LLM недоступен, работают правила:", (e as Error).message);
    }
  }
  // Страховка поверх LLM: «вручён, но не получал» — возможная потеря или мошенничество, решает только человек
  if (NOT_RECEIVED.test(message.toLowerCase()) && shipment?.status === "delivered") {
    cls = { ...cls, intent: "order_status_check", topic: "Где заказ", urgency: "high" };
  }
  // Недовольный клиент — срочность на ступень выше: SLA строже, тикет выше в очереди
  if (cls.sentiment === "negative" && cls.urgency !== "high") cls = { ...cls, urgency: cls.urgency === "low" ? "medium" : "high" };
  // Выбор LLM приоритетнее; если он ничего не выбрал или недоступен — поиск по ключевым словам
  const kb = llmKb.length ? llmKb : searchKb(message);

  const result = { ...decide(cls, { order, shipment, kb, lookup, engine, phoneOrders, message }), model, performed };
  // Числа можно брать из фактов, базы знаний и из сообщения самого клиента (его телефон, номер заказа)
  const source = `${facts}\n${kb.map((a) => a.text).join("\n")}\n${message}`;
  // Номер заказа обязателен только в ответе о статусе — там без него клиент не поймёт, о какой посылке речь
  if (llmReply && replyIsGrounded(llmReply, source, cls.intent === "order_status_check" ? order?.id : undefined)) {
    return { ...result, reply: llmReply, replySource: "llm" };
  }
  if (llmReply) console.warn(`LLM reply rejected — не подтверждается фактами: ${ungrounded(llmReply, source).join(", ") || "нет номера заказа/длина"}`);
  return result;
}

type DecideCtx = {
  order: MsOrder | null;
  shipment: CdekShipment | null;
  kb: KbArticle[];
  lookup: string | null;
  engine: AgentResult["engine"];
  phoneOrders: number;
  message: string;
};

/** Режим (авто/черновик), действия и шаблонный ответ — детерминированно по классификации и данным заказа. */
function decide(cls: Classification, { order, shipment, kb, lookup, engine, phoneOrders, message }: DecideCtx): AgentResult {
  const m = message.toLowerCase();
  const base = { ...cls, order, shipment, kb, lookup, engine, replySource: "template" as const };
  const hi = order ? `Здравствуйте, ${order.customerName}!` : "Здравствуйте!";

  if (cls.intent === "order_status_check") {
    if (order && !shipment) {
      return {
        ...base, confidence: Math.max(cls.confidence, 0.93), mode: "auto", actions: [],
        reply: `${hi} Заказ №${order.id} (${order.items.map((i) => i.name).join(", ")}) ещё не отправлен: статус — «${order.status}». ` +
          `Как только передадим его в СДЭК, пришлём трек-номер, и вы сможете следить за доставкой.`,
      };
    }
    if (!order || !shipment) {
      return {
        ...base,
        confidence: Math.min(cls.confidence, 0.55),
        mode: "draft",
        reply: `${hi} Подскажите, пожалуйста, номер заказа или телефон, указанный при оформлении — проверим статус доставки.`,
        actions: [],
      };
    }
    const confidence = Math.max(cls.confidence, 0.96);
    const items = order.items.map((i) => i.name).join(", ");
    const multi = phoneOrders > 1 ? ` (нашли ${phoneOrders} заказа, показываем последний)` : "";
    switch (shipment.status) {
      case "in_transit":
        return {
          ...base, confidence, mode: "auto", actions: [],
          reply: `${hi} Ваш заказ №${order.id}${multi} (${items}) в пути — сейчас посылка: ${shipment.location}. ` +
            `Плановая дата доставки — ${fmtDate(shipment.plannedDate)}. Пункт выдачи СДЭК: ${shipment.pvzAddress}. ` +
            `Трек-номер СДЭК: ${shipment.track}.`,
        };
      case "at_pvz":
        return {
          ...base, confidence, mode: "auto",
          actions: [{ id: "extend_storage", label: "Продлить хранение в ПВЗ" }],
          reply: `${hi} Ваш заказ №${order.id}${multi} (${items}) уже ждёт вас в пункте выдачи СДЭК: ${shipment.pvzAddress}. ` +
            `Срок хранения — до ${fmtDate(shipment.storageUntil!)}. При получении назовите трек-номер ${shipment.track} и покажите документ.`,
        };
      case "delivered":
        if (NOT_RECEIVED.test(m)) {
          const lost = kb.find((a) => a.id === "kb-lost")?.text ?? "";
          return {
            ...base, confidence: 0.85, urgency: "high", mode: "draft",
            actions: [{ id: "cdek_claim", label: "Открыть претензию в СДЭК" }],
            reply: `${hi} Очень жаль, что так вышло. По данным СДЭК заказ №${order.id} вручён ${shipment.events.at(-1)?.date} в ПВЗ: ${shipment.pvzAddress}. ` +
              (lost ? `${lost} ` : "") + `Мы уже разбираемся и вернёмся с ответом.`,
          };
        }
        return {
          ...base, confidence, mode: "auto", actions: [],
          reply: `${hi} По данным СДЭК заказ №${order.id}${multi} уже вручён (${shipment.events.at(-1)?.date}). ` +
            `Если вы его не получали — ответьте на это сообщение, мы сразу подключим оператора.`,
        };
      case "delayed":
        // Хранение продлено — AI отвечает сам; не вышло продлить — черновик и кнопка оператору
        if (shipment.storageUntil) {
          return {
            ...base, confidence: 0.93, urgency: "high", mode: "auto", actions: [],
            reply: `${hi} Приносим извинения за задержку: заказ №${order.id} задержался в пути (${shipment.location}). ` +
              `Новая плановая дата — ${fmtDate(shipment.plannedDate)}, ПВЗ: ${shipment.pvzAddress}. ` +
              `Мы уже продлили бесплатное хранение в ПВЗ до ${fmtDate(shipment.storageUntil)}, чтобы вы забрали посылку без спешки, и держим доставку на контроле.`,
          };
        }
        return {
          ...base, confidence: 0.82, urgency: "high", mode: "draft",
          actions: [{ id: "extend_storage", label: "Продлить хранение в ПВЗ" }],
          reply: `${hi} Приносим извинения за задержку: заказ №${order.id} задержался в пути (${shipment.location}). ` +
            `Новая плановая дата — ${fmtDate(shipment.plannedDate)}, ПВЗ: ${shipment.pvzAddress}. ` +
            `Продлим срок хранения в ПВЗ, чтобы вам было удобно забрать посылку, и держим доставку на контроле.`,
        };
    }
  }

  if (cls.intent === "return_request") {
    const policy = kb.find((a) => a.category === "returns" || a.category === "warranty");
    const defect = cls.topic === "Бракованный товар";
    const wrongItem = cls.topic === "Ошибка комплектации";
    const item = order?.items[0]?.name ?? "товар";
    const policyText = policy ? ` ${policy.text}` : "";
    return {
      ...base,
      mode: "draft",
      actions: [
        { id: "create_return_waybill", label: "Оформить накладную на возврат" },
        { id: "create_return_request", label: "Создать заявку на возврат" },
      ],
      reply: wrongItem
        ? `${hi} Простите, это наша ошибка при сборке заказа${order ? ` №${order.id}` : ""}. Заберём товар бесплатно через СДЭК и отправим ${item}. ` +
          `Сейчас оформим накладную на возврат и пришлём её номер.`
        : defect
        ? `${hi} Очень жаль, что ${item} пришёл с дефектом. Пришлите, пожалуйста, фото — и мы оформим возврат.${policyText}`
        : `${hi} Жаль, что ${item} не подошёл по размеру — поможем с возвратом.${policyText} ` +
          `Сейчас оформим накладную СДЭК и пришлём её номер: товар можно сдать в любом ПВЗ.`,
    };
  }

  if (cls.intent === "order_change") {
    const policy = kb.find((a) => a.id === "kb-cancel")?.text ?? "";
    if (!order) {
      return {
        ...base, confidence: Math.min(cls.confidence, 0.6), mode: "draft", actions: [],
        reply: `${hi} Подскажите, пожалуйста, номер заказа, который нужно отменить. ${policy}`.trim(),
      };
    }
    if (!shipment) {
      return {
        ...base, mode: "draft",
        actions: [{ id: "cancel_order", label: "Отменить заказ" }],
        reply: `${hi} Заказ №${order.id} ещё не передан в доставку, поэтому отменим его бесплатно. ` +
          `Деньги — ${order.total.toLocaleString("ru-RU")} ₸ — вернутся на карту в течение 3–5 рабочих дней.`,
      };
    }
    return {
      ...base, confidence: Math.max(cls.confidence, 0.92), mode: "auto", actions: [],
      reply: `${hi} Заказ №${order.id} уже передан в СДЭК, поэтому отменить его в системе нельзя. ` +
        `Вы можете отказаться от посылки при получении в ПВЗ (${shipment.pvzAddress}) — деньги вернём после возврата посылки на склад.`,
    };
  }

  // general_faq
  const top = kb[0];
  const confidence = top ? Math.max(cls.confidence, 0.92) : 0.5;
  return {
    ...base,
    confidence,
    mode: top && confidence > AUTO_THRESHOLD ? "auto" : "draft",
    actions: [],
    reply: top ? `${hi} ${top.text}` : `${hi} Спасибо за вопрос! Уточните, пожалуйста, детали — оператор ответит в ближайшее время.`,
  };
}
