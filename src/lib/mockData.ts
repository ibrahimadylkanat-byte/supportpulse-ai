// Демо-данные: заказы МойСклад, отправления СДЭК, база знаний, сценарии, аналитика.

export type OrderItem = { name: string; qty: number; price: number };

export type MsOrder = {
  id: string;
  status: string; // статус заказа в МойСклад
  createdAt: string;
  customerName: string;
  phone: string;
  items: OrderItem[];
  total: number;
  cdekTrack?: string;
};

export type CdekEvent = { date: string; city: string; status: string };

export type CdekShipment = {
  track: string;
  status: "in_transit" | "at_pvz" | "delayed" | "delivered";
  statusText: string;
  location: string;
  pvzAddress: string;
  plannedDate: string;
  storageUntil?: string;
  events: CdekEvent[];
};

export type KbArticle = {
  id: string;
  title: string;
  category: "returns" | "delivery" | "warranty" | "payment";
  keywords: string[];
  text: string;
};

export const orders: MsOrder[] = [
  {
    id: "48201",
    status: "Отгружен",
    createdAt: "2026-09-29",
    customerName: "Айгерим",
    phone: "+77011112233",
    items: [{ name: "Кроссовки Nova Run, 39", qty: 1, price: 38900 }],
    total: 38900,
    cdekTrack: "1106758432",
  },
  {
    id: "48155",
    status: "Доставлен",
    createdAt: "2026-09-20",
    customerName: "Дмитрий",
    phone: "+77019998877",
    items: [
      { name: "Свитер Merino Classic, M", qty: 1, price: 24500 },
      { name: "Шарф вязаный", qty: 1, price: 7900 },
    ],
    total: 32400,
    cdekTrack: "1106712290",
  },
  {
    id: "48177",
    status: "Отгружен",
    createdAt: "2026-09-26",
    customerName: "Асель",
    phone: "+77071234567",
    items: [{ name: "Рюкзак Urban 22L", qty: 1, price: 29900 }],
    total: 29900,
    cdekTrack: "1106733015",
  },
  {
    id: "48102",
    status: "Доставлен",
    createdAt: "2026-08-14",
    customerName: "Асель",
    phone: "+77071234567",
    items: [{ name: "Термокружка 450 мл", qty: 2, price: 6500 }],
    total: 13000,
    cdekTrack: "1106601877",
  },
  {
    id: "48190",
    status: "Отгружен",
    createdAt: "2026-09-24",
    customerName: "Тимур",
    phone: "+77055554411",
    items: [{ name: "Пуховик Alpine, L", qty: 1, price: 89900 }],
    total: 89900,
    cdekTrack: "1106740528",
  },
  {
    id: "48215",
    status: "Собирается на складе",
    createdAt: "2026-10-02",
    customerName: "Сауле",
    phone: "+77012223344",
    items: [{ name: "Платье льняное, S", qty: 1, price: 27500 }],
    total: 27500,
  },
  {
    id: "48163",
    status: "Доставлен",
    createdAt: "2026-09-22",
    customerName: "Ерлан",
    phone: "+77076667788",
    items: [{ name: "Наушники AirTone Pro", qty: 1, price: 45900 }],
    total: 45900,
    cdekTrack: "1106720011",
  },
  {
    id: "48170",
    status: "Доставлен",
    createdAt: "2026-09-23",
    customerName: "Марина",
    phone: "+77478889900",
    items: [{ name: "Кеды Street White, 38", qty: 1, price: 31900 }],
    total: 31900,
    cdekTrack: "1106725540",
  },
  {
    id: "48230",
    status: "Новый",
    createdAt: "2026-10-03",
    customerName: "Данияр",
    phone: "+77015556677",
    items: [
      { name: "Худи Basic, L", qty: 1, price: 19900 },
      { name: "Кепка Logo", qty: 1, price: 8900 },
    ],
    total: 28800,
  },
];

export const shipments: CdekShipment[] = [
  {
    track: "1106758432",
    status: "in_transit",
    statusText: "В пути",
    location: "Сортировочный центр Караганда",
    pvzAddress: "Алматы, пр. Абая 150, ПВЗ СДЭК «Абая-Розыбакиева»",
    plannedDate: "2026-10-05",
    events: [
      { date: "2026-09-30 10:12", city: "Астана", status: "Принят на склад отправителя" },
      { date: "2026-10-01 08:40", city: "Астана", status: "Отправлен в город-получатель" },
      { date: "2026-10-02 21:05", city: "Караганда", status: "Прибыл в сортировочный центр" },
    ],
  },
  {
    track: "1106712290",
    status: "delivered",
    statusText: "Вручён",
    location: "Алматы",
    pvzAddress: "Алматы, ул. Сатпаева 90, ПВЗ СДЭК «Сатпаева»",
    plannedDate: "2026-09-25",
    events: [
      { date: "2026-09-21 12:00", city: "Астана", status: "Принят на склад отправителя" },
      { date: "2026-09-24 09:30", city: "Алматы", status: "Прибыл в ПВЗ" },
      { date: "2026-09-25 18:14", city: "Алматы", status: "Вручён получателю" },
    ],
  },
  {
    track: "1106733015",
    status: "at_pvz",
    statusText: "Ожидает в ПВЗ",
    location: "Алматы",
    pvzAddress: "Алматы, мкр. Самал-2, 58, ПВЗ СДЭК «Самал»",
    plannedDate: "2026-10-01",
    storageUntil: "2026-10-08",
    events: [
      { date: "2026-09-27 11:20", city: "Астана", status: "Принят на склад отправителя" },
      { date: "2026-09-29 07:55", city: "Алматы", status: "Прибыл в город-получатель" },
      { date: "2026-10-01 14:02", city: "Алматы", status: "Прибыл в ПВЗ, готов к выдаче" },
    ],
  },
  {
    track: "1106601877",
    status: "delivered",
    statusText: "Вручён",
    location: "Алматы",
    pvzAddress: "Алматы, мкр. Самал-2, 58, ПВЗ СДЭК «Самал»",
    plannedDate: "2026-08-19",
    events: [{ date: "2026-08-19 16:40", city: "Алматы", status: "Вручён получателю" }],
  },
  {
    track: "1106740528",
    status: "delayed",
    statusText: "Задержка доставки",
    location: "Сортировочный центр Шымкент",
    pvzAddress: "Шымкент, пр. Тауке хана 31, ПВЗ СДЭК «Тауке хан»",
    plannedDate: "2026-10-06",
    events: [
      { date: "2026-09-25 09:10", city: "Астана", status: "Принят на склад отправителя" },
      { date: "2026-09-27 19:45", city: "Туркестан", status: "Прибыл в транзитный пункт" },
      { date: "2026-10-01 06:30", city: "Шымкент", status: "Задержка: перегруз сортировочного центра" },
    ],
  },
  {
    track: "1106720011",
    status: "delivered",
    statusText: "Вручён",
    location: "Астана",
    pvzAddress: "Астана, ул. Кенесары 40, ПВЗ СДЭК «Кенесары»",
    plannedDate: "2026-09-27",
    events: [
      { date: "2026-09-23 10:00", city: "Алматы", status: "Принят на склад отправителя" },
      { date: "2026-09-26 15:20", city: "Астана", status: "Прибыл в ПВЗ" },
      { date: "2026-09-27 19:02", city: "Астана", status: "Вручён получателю" },
    ],
  },
  {
    track: "1106725540",
    status: "delivered",
    statusText: "Вручён",
    location: "Караганда",
    pvzAddress: "Караганда, пр. Бухар-Жырау 59, ПВЗ СДЭК «Бухар-Жырау»",
    plannedDate: "2026-09-28",
    events: [
      { date: "2026-09-24 09:40", city: "Алматы", status: "Принят на склад отправителя" },
      { date: "2026-09-28 12:15", city: "Караганда", status: "Вручён получателю" },
    ],
  },
];

export const knowledgeBase: KbArticle[] = [
  {
    id: "kb-returns-14",
    title: "Возврат товара надлежащего качества",
    category: "returns",
    keywords: ["вернуть", "возврат", "размер", "не подош", "обмен", "свитер", "одежд"],
    text:
      "Товар надлежащего качества можно вернуть в течение 14 дней с момента получения, если сохранены товарный вид и ярлыки. " +
      "Возврат оформляется через ПВЗ СДЭК по накладной, которую мы присылаем. Доставка возврата — за счёт магазина при обмене размера. " +
      "Деньги возвращаются на карту в течение 3–5 рабочих дней после поступления товара на склад.",
  },
  {
    id: "kb-defect",
    title: "Бракованный товар",
    category: "warranty",
    keywords: ["брак", "сломан", "дефект", "не работает", "порван", "гаранти"],
    text:
      "Если товар оказался с дефектом, пришлите фото дефекта. Мы бесплатно заберём товар через СДЭК и вернём деньги или заменим товар " +
      "в течение 7 дней. Гарантия на обувь и одежду — 30 дней, на аксессуары — 6 месяцев.",
  },
  {
    id: "kb-delivery",
    title: "Сроки и условия доставки",
    category: "delivery",
    keywords: ["доставк", "сроки", "сколько идёт", "сколько идет", "пвз", "хранени", "курьер"],
    text:
      "Доставляем СДЭК до ПВЗ или курьером. Сроки: Алматы и Астана — 2–3 дня, остальные города — 3–7 дней. " +
      "Срок бесплатного хранения в ПВЗ — 7 дней, по запросу продлеваем ещё на 7 дней.",
  },
  {
    id: "kb-payment",
    title: "Оплата и возврат средств",
    category: "payment",
    keywords: ["оплат", "деньги", "списали", "чек", "карт", "kaspi", "рассрочк"],
    text:
      "Принимаем оплату картой, Kaspi и в рассрочку 0-0-12. Электронный чек приходит на e-mail сразу после оплаты. " +
      "Если деньги списались дважды, второе списание автоматически возвращается банком в течение 3 рабочих дней.",
  },
  {
    id: "kb-cancel",
    title: "Отмена заказа",
    category: "payment",
    keywords: ["отмен", "передумал", "не нужен заказ"],
    text:
      "Пока заказ не передан в доставку, его можно отменить бесплатно — деньги вернутся на карту в течение 3–5 рабочих дней. " +
      "Если заказ уже отправлен, от него можно отказаться при получении в ПВЗ СДЭК: деньги вернём после возврата посылки на склад.",
  },
  {
    id: "kb-promo",
    title: "Промокоды и скидки",
    category: "payment",
    keywords: ["промокод", "скидк", "купон", "акци"],
    text:
      "Промокод вводится в корзине до оплаты, на один заказ действует один промокод, со скидками на распродаже он не суммируется. " +
      "Если промокод не применился к уже оплаченному заказу, напишите номер заказа — оператор проверит и вернёт разницу.",
  },
  {
    id: "kb-address",
    title: "Изменить адрес или пункт выдачи",
    category: "delivery",
    keywords: ["адрес", "пвз", "пункт выдачи", "переадрес", "другой город"],
    text:
      "Адрес или пункт выдачи можно бесплатно изменить, пока заказ не передан в СДЭК. " +
      "После отправки посылку можно переадресовать через СДЭК по трек-номеру, срок доставки при этом может вырасти на 1–3 дня.",
  },
  {
    id: "kb-lost",
    title: "Посылка вручена, но не получена",
    category: "delivery",
    keywords: ["не получал", "не получила", "не забирал", "не забирала", "вручен", "вручён"],
    text:
      "Если по данным СДЭК посылка вручена, а вы её не получали, мы откроем претензию в СДЭК — ответ приходит в течение 10 рабочих дней. " +
      "Если вручение не подтвердится, отправим заказ заново или вернём деньги.",
  },
];

export type AgentInput = { order_id?: string; phone?: string; message: string };

export type DemoScenario = { id: string; label: string; customer: string; input: AgentInput };

export const demoScenarios: DemoScenario[] = [
  {
    id: "A",
    label: "A · Где заказ №48201",
    customer: "Айгерим",
    input: { message: "Здравствуйте! Заказ №48201 когда приедет?" },
  },
  {
    id: "B",
    label: "B · Возврат свитера",
    customer: "Дмитрий",
    // order_id приходит из виджета чата (клиент авторизован на сайте)
    input: { order_id: "48155", message: "Пришел свитер не того размера, хочу вернуть" },
  },
  {
    id: "C",
    label: "C · Поиск по телефону",
    customer: "Асель",
    input: { message: "Мой телефон +77071234567, где моё отправление?" },
  },
  {
    id: "D",
    label: "D · Задержка доставки",
    customer: "Тимур",
    input: { message: "Заказ 48190 должен был прийти ещё вчера, где он?? Жду уже третий день" },
  },
  {
    id: "E",
    label: "E · Ещё не отправлен",
    customer: "Сауле",
    input: { message: "Оплатила заказ 48215 вчера, когда отправите?" },
  },
  {
    id: "F",
    label: "F · «Вручён», но не получал",
    customer: "Ерлан",
    input: { message: "СДЭК пишет что заказ 48163 вручён, но я его не получал!" },
  },
  {
    id: "G",
    label: "G · Прислали не тот товар",
    customer: "Марина",
    input: { order_id: "48170", message: "Заказывала белые кеды, а прислали не тот товар — чёрные и другой модели" },
  },
  {
    id: "H",
    label: "H · Отменить заказ",
    customer: "Данияр",
    input: { message: "Хочу отменить заказ 48230, передумал" },
  },
  {
    id: "I",
    label: "I · Промокод",
    customer: "Гость",
    input: { message: "Не применился промокод AUTUMN10 при оплате, что делать?" },
  },
];

// Сырые счётчики для аналитики; производные метрики считает /api/analytics.
export type Period = "week" | "month" | "quarter";

export const analyticsRaw: Record<
  Period,
  { totalTickets: number; deflectionRate: number; topics: Record<string, number> }
> = {
  week: {
    totalTickets: 830,
    deflectionRate: 0.59,
    topics: { "Где заказ": 402, Возвраты: 188, "Бракованный товар": 96, "Вопросы по оплате": 144 },
  },
  month: {
    totalTickets: 3366,
    deflectionRate: 0.62,
    topics: { "Где заказ": 1615, Возвраты: 742, "Бракованный товар": 371, "Вопросы по оплате": 638 },
  },
  quarter: {
    totalTickets: 9870,
    deflectionRate: 0.64,
    topics: { "Где заказ": 4836, Возвраты: 2171, "Бракованный товар": 1086, "Вопросы по оплате": 1777 },
  },
};

export const AHT_WITHOUT_AI_SEC = 270; // 4.5 мин
export const AHT_WITH_AI_SEC = 25;
export const OPERATOR_HOURLY_COST_USD = 13;

// --- Дашборд: SLA, настроение клиентов, последние тикеты ---

export type Priority = "high" | "medium" | "low";
export type SentimentPoint = { label: string; positive: number; neutral: number; negative: number };

export const SLA_TARGET = 0.95; // доля тикетов, закрытых в срок
export const slaPolicy: Record<Priority, { label: string; firstResponse: string; resolution: string }> = {
  high: { label: "Высокий", firstResponse: "15 мин", resolution: "4 ч" },
  medium: { label: "Средний", firstResponse: "1 ч", resolution: "24 ч" },
  low: { label: "Низкий", firstResponse: "4 ч", resolution: "72 ч" },
};

export const dashboardRaw: Record<
  Period,
  {
    openNow: number;
    sla: Record<Priority, { tickets: number; met: number; medianFirstResponse: string }>;
    sentiment: SentimentPoint[];
  }
> = {
  week: {
    openNow: 37,
    sla: {
      high: { tickets: 118, met: 0.92, medianFirstResponse: "6 мин" },
      medium: { tickets: 402, met: 0.97, medianFirstResponse: "11 мин" },
      low: { tickets: 310, met: 0.99, medianFirstResponse: "24 мин" },
    },
    sentiment: [
      { label: "27.09", positive: 41, neutral: 62, negative: 21 },
      { label: "28.09", positive: 38, neutral: 55, negative: 19 },
      { label: "29.09", positive: 47, neutral: 71, negative: 24 },
      { label: "30.09", positive: 44, neutral: 68, negative: 18 },
      { label: "01.10", positive: 39, neutral: 60, negative: 27 },
      { label: "02.10", positive: 45, neutral: 66, negative: 16 },
      { label: "03.10", positive: 23, neutral: 30, negative: 9 },
    ],
  },
  month: {
    openNow: 37,
    sla: {
      high: { tickets: 471, met: 0.9, medianFirstResponse: "7 мин" },
      medium: { tickets: 1655, met: 0.96, medianFirstResponse: "12 мин" },
      low: { tickets: 1240, met: 0.99, medianFirstResponse: "26 мин" },
    },
    sentiment: [
      { label: "1–7.09", positive: 248, neutral: 401, negative: 158 },
      { label: "8–14.09", positive: 262, neutral: 415, negative: 141 },
      { label: "15–21.09", positive: 281, neutral: 430, negative: 127 },
      { label: "22–28.09", positive: 296, neutral: 452, negative: 155 },
    ],
  },
  quarter: {
    openNow: 37,
    sla: {
      high: { tickets: 1382, met: 0.88, medianFirstResponse: "8 мин" },
      medium: { tickets: 4851, met: 0.95, medianFirstResponse: "14 мин" },
      low: { tickets: 3637, met: 0.98, medianFirstResponse: "31 мин" },
    },
    sentiment: [
      { label: "Июль", positive: 702, neutral: 1311, negative: 598 },
      { label: "Август", positive: 851, neutral: 1402, negative: 552 },
      { label: "Сентябрь", positive: 1087, neutral: 1698, negative: 581 },
    ],
  },
};

export type DashboardTicket = {
  id: string;
  customer: string;
  topic: string;
  priority: Priority;
  sentiment: "positive" | "neutral" | "negative";
  status: "auto_resolved" | "needs_review" | "closed";
  slaLeftMin: number; // < 0 — SLA нарушен
  live?: boolean; // тикет обработан агентом в этой сессии, а не из демо-истории
  responded?: boolean; // оператор ответил, но проблема ещё не решена — первый ответ по SLA дан
};

export const recentTickets: DashboardTicket[] = [
  { id: "T-10482", customer: "Тимур", topic: "Где заказ", priority: "high", sentiment: "negative", status: "needs_review", slaLeftMin: 6 },
  { id: "T-10481", customer: "Дмитрий", topic: "Возвраты", priority: "medium", sentiment: "neutral", status: "needs_review", slaLeftMin: 41 },
  { id: "T-10480", customer: "Асель", topic: "Где заказ", priority: "low", sentiment: "neutral", status: "auto_resolved", slaLeftMin: 240 },
  { id: "T-10479", customer: "Айгерим", topic: "Где заказ", priority: "low", sentiment: "positive", status: "auto_resolved", slaLeftMin: 240 },
  { id: "T-10478", customer: "Марат", topic: "Бракованный товар", priority: "high", sentiment: "negative", status: "needs_review", slaLeftMin: -12 },
  { id: "T-10477", customer: "Жанна", topic: "Вопросы по оплате", priority: "medium", sentiment: "negative", status: "needs_review", slaLeftMin: 18 },
  { id: "T-10476", customer: "Ольга", topic: "Возвраты", priority: "medium", sentiment: "positive", status: "closed", slaLeftMin: 60 },
  { id: "T-10475", customer: "Ерлан", topic: "Вопросы по оплате", priority: "low", sentiment: "neutral", status: "closed", slaLeftMin: 240 },
];
