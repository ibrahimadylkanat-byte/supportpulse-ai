// Самопроверка демо-сценариев: npm test
import assert from "node:assert/strict";
import { classifyRules, intentForTopic, kbByIds, replyIsGrounded, runAgent } from "./agent.ts";
import { demoScenarios } from "./mockData.ts";

delete process.env.GEMINI_API_KEY; // проверяем детерминированный rule-based путь
delete process.env.GROQ_API_KEY;
process.env.TICKETS_FILE = ""; // тесты не пишут в data/tickets.json
const [A, B, C, D] = await Promise.all(demoScenarios.map((s) => runAgent(s.input)));

assert.equal(A.intent, "order_status_check");
assert.equal(A.mode, "auto");
assert.ok(A.confidence > 0.9 && A.reply.includes("Абая 150") && A.reply.includes("5 октября"));

assert.equal(B.intent, "return_request");
assert.equal(B.mode, "draft");
assert.equal(B.kb[0].id, "kb-returns-14");
assert.ok(B.actions.some((a) => a.label === "Оформить накладную на возврат"));

assert.equal(C.order?.id, "48177"); // найден по телефону, последний из двух
assert.equal(C.mode, "auto");

// Задержка: агент сам продлил хранение в ПВЗ и ответил клиенту — не оставляет это оператору
assert.equal(D.mode, "auto");
assert.equal(D.performed?.length, 1);
assert.match(D.reply, /продлили бесплатное хранение/);
// Повторное обращение по той же посылке: срок уже продлён, второй раз не продлеваем
const D2 = await runAgent(demoScenarios[3].input);
assert.equal(D2.performed?.length, 0);
assert.equal(D2.shipment?.storageUntil, D.shipment?.storageUntil);
assert.equal(D.urgency, "high");
assert.equal(D.sentiment, "negative");
assert.equal(A.sentiment, "neutral");

// Без Gemini разговорная фраза о размере — всё равно возврат на проверку оператору, не автоответ
const E = await runAgent({ order_id: "48155", message: "размерчик не тот, можно поменять?" });
assert.equal(E.intent, "return_request");
assert.equal(E.mode, "draft");

// Выбор статей Gemini: мусор и выдуманные id отбрасываются
assert.deepEqual(kbByIds(["kb-returns-14", "kb-fake", 42]).map((a) => a.id), ["kb-returns-14"]);
assert.deepEqual(kbByIds("kb-returns-14"), []);

console.log("ok: 4 demo scenarios + kb selection");

// Входящие и тикеты: дедупликация демо, продолжение диалога, ответ оператора
import { handleCustomerMessage, operatorReply, customerView } from "./inbox.ts";
import { clearTickets, liveTickets, type Ticket } from "./ticketStore.ts";
clearTickets();
const t0 = Date.parse("2026-10-03T10:00:00Z");
const key = (i: { message: string }) => i.message;
const d1 = await handleCustomerMessage({ channel: "demo", ...demoScenarios[3].input, dedupeKey: key(demoScenarios[3].input), at: t0 });
const d2 = await handleCustomerMessage({ channel: "demo", ...demoScenarios[3].input, dedupeKey: key(demoScenarios[3].input), at: t0 + 60_000 });
assert.equal(d1.id, d2.id); // перезагрузка демо не плодит дубли
await handleCustomerMessage({ channel: "demo", ...demoScenarios[0].input, dedupeKey: key(demoScenarios[0].input), at: t0 });
let live = liveTickets(t0 + 21 * 60_000);
assert.equal(live.length, 2);
assert.equal(live.find((t) => t.id === d1.id)!.slaLeftMin, -5); // высокий приоритет: 15 мин с последнего сообщения клиента
console.log("ok: live tickets");

// Чат: клиенту сразу отвечаем, а вопрос с проверкой — подтверждаем и передаём оператору
const c1 = await handleCustomerMessage({ channel: "chat", message: "Пришел свитер не того размера, хочу вернуть", order_id: "48155", at: t0 });
assert.equal(c1.status, "needs_review");
assert.match(c1.messages.at(-1)!.text, /Передал ваш вопрос оператору/);
const c2 = await handleCustomerMessage({ channel: "chat", ticketId: c1.id, message: "а когда приедет курьер?", at: t0 + 1000 });
assert.equal(c2.id, c1.id);
assert.equal(c2.result.order?.id, "48155"); // заказ помним из начала диалога
assert.equal(c2.status, "needs_review"); // AI ответил на уточнение, но возврат всё ещё ждёт оператора
assert.equal(c2.messages.at(-1)!.from, "ai");
assert.equal(await operatorReply(c1.id, "Оформили возврат", false).then((t) => (t as Ticket).status), "needs_review");
assert.equal(await operatorReply(c1.id, "Оформили возврат", false), "duplicate"); // второй оператор / двойной клик
assert.equal(liveTickets().find((t) => t.id === c1.id)!.responded, true);
assert.equal(await operatorReply(c1.id, "", true).then((t) => (t as Ticket).status), "closed");
assert.equal(await operatorReply("L-404", "x", true), null);
assert.ok(customerView(c1).messages.every((m) => m.from !== "system")); // внутренние заметки клиенту не видны
const c3 = await handleCustomerMessage({ channel: "chat", ticketId: c1.id, message: "спасибо!", at: t0 + 2000 });
assert.notEqual(c3.id, c1.id); // закрытый тикет не переоткрывается — новое обращение
console.log("ok: chat flow + operator reply closes only resolved tickets");

// Негатив поднимает срочность: «где заказ» с раздражением — уже не low
const angry = await runAgent({ message: "Где мой заказ 48201?! Сколько можно ждать" });
assert.equal(angry.sentiment, "negative");
assert.notEqual(angry.urgency, "low");
// Номер заказа без «№»: казахский и короткие сообщения; телефон за номер заказа не принимается
import { extractOrderId } from "./agent.ts";
assert.equal(extractOrderId("Тапсырыс 48201 қашан келеді?"), "48201");
assert.equal(extractOrderId("Мой телефон +77071234567"), null);
assert.equal(extractOrderId("заказ №48190"), "48190");
// «не пришёл» — тоже вопрос о статусе: без Gemini правила должны ответить сами, а не отдать оператору
const late = await runAgent({ message: "Заказ 48201 до сих пор не пришёл!! Сколько можно ждать?" });
assert.equal(late.intent, "order_status_check");
assert.equal(late.mode, "auto");

// Ответ Gemini принимается, только если все числа подтверждаются фактами
const facts = "Заказ №48201, трек 1106758432, итого 38900 ₸";
assert.ok(replyIsGrounded("Айгерим, заказ №48201 в пути, трек 1106758432, сумма 38 900 ₸.", facts, "48201"));
assert.ok(!replyIsGrounded("Айгерим, заказ №48201 приедет, трек 1106758499.", facts, "48201")); // выдуманный трек
assert.ok(!replyIsGrounded("Ваш заказ в пути и скоро будет у вас.", facts, "48201")); // без номера заказа
// Телефон клиента из его же сообщения повторять можно (в любом формате записи)
assert.ok(replyIsGrounded("Асель, по номеру +7 707 123 45 67 нашли заказ №48177.", "Заказ №48177\nМой телефон +77071234567", "48177"));
console.log("ok: urgency bump + grounded replies");

// ROI: те же цифры, что и на дашборде за месяц
import { roi } from "./roi.ts";
const r = roi({ ticketsPerMonth: 3366, deflection: 0.62, salaryPerMonth: 350_000, ahtWithoutSec: 270, ahtWithSec: 25 });
assert.equal(r.deflected, 2087);
assert.equal(r.hoursSaved, 142);
assert.equal(r.moneySaved, 295_900);
assert.equal(r.operatorsFreed, 0.8);
const rc = roi({ ticketsPerMonth: 3000, deflection: 0.62, salaryPerMonth: 350_000, ahtWithoutSec: 270, ahtWithSec: 25, aiCostPerTicket: 2 });
assert.equal(rc.grossSaved, 263_715);
assert.equal(rc.aiCost, 6_000);
assert.equal(rc.moneySaved, 257_715);
assert.equal(roi({ ticketsPerMonth: -5, deflection: 2, salaryPerMonth: 1, ahtWithoutSec: 270, ahtWithSec: 25 }).deflected, 0);
console.log("ok: roi");

// Оценка клиента: «помогло» закрывает тикет, «не помогло» — в очередь оператору; повторно — только после нового ответа
import { rateTicket } from "./inbox.ts";
const auto = await handleCustomerMessage({ channel: "chat", message: "Где мой заказ 48201?", at: t0 });
assert.equal(customerView(auto).canRate, true);
assert.equal(rateTicket(auto.id, "up")!.status, "closed");
assert.equal(customerView(auto).canRate, false);
const neg = await handleCustomerMessage({ channel: "chat", message: "Где мой заказ 48201?", at: t0 });
const down = rateTicket(neg.id, "down")!;
assert.equal(down.status, "needs_review");
assert.equal(down.responded, false);
assert.match(down.messages.at(-1)!.text, /Подключаю оператора/);
assert.equal(customerView(neg).canRate, false); // подтверждение «подключаю» оценивать нечего
await new Promise((r) => setTimeout(r, 5));
await operatorReply(neg.id, "Посылка будет завтра, курьер позвонит", false);
assert.equal(customerView(neg).canRate, true); // ответ оператора можно оценить
assert.equal(rateTicket(neg.id, "up")!.status, "closed"); // клиент сам закрыл после ответа оператора
const waiting = await handleCustomerMessage({ channel: "chat", message: "Хочу вернуть свитер", order_id: "48155", at: t0 });
assert.equal(customerView(waiting).canRate, false); // пока ждёт оператора — оценивать нечего
assert.equal(rateTicket("L-404", "up"), null);
console.log("ok: csat closes or escalates");

// Сохранение на диск: тикеты переживают перезапуск сервера
import os from "node:os";
import nodePath from "node:path";
import { allTickets } from "./ticketStore.ts";
process.env.TICKETS_FILE = nodePath.join(os.tmpdir(), `supportpulse-test-${process.pid}.json`);
const before = allTickets().length;
await handleCustomerMessage({ channel: "chat", message: "Мой телефон +77071234567, где посылка?", at: t0 });
await new Promise((r) => setTimeout(r, 400)); // запись с задержкой
delete (globalThis as any).__tickets; // «перезапуск»
assert.equal(allTickets().length, before + 1);
assert.ok(allTickets().some((t) => t.messages[0]?.text.includes("+77071234567")));
console.log("ok: persistence");

// Сводка руководителю: без LLM — шаблон по тем же данным; цифры в нём берутся из фактов
import { generateSummary, summaryFacts } from "./summary.ts";
const sum = await generateSummary("month");
assert.equal(sum.source, "шаблон (LLM недоступен)");
assert.ok(sum.headline.includes("62%") && sum.insights.length >= 2 && sum.actions.length >= 2);
const facts2 = summaryFacts("month");
for (const n of [sum.headline, ...sum.insights].join(" ").match(/\d{2,}/g) ?? []) assert.ok(facts2.includes(n), `число ${n} не из данных`);
console.log("ok: summary");

// Разные ситуации — у каждой своя логика, а не одинаковый «где заказ»
const [, , , , sE, sF, sG, sH, sI] = await Promise.all(demoScenarios.map((s) => runAgent(s.input)));
assert.equal(sE.mode, "auto"); // заказ найден, но ещё не отправлен — не просим номер заново
assert.match(sE.reply, /ещё не отправлен/);
assert.equal(sF.mode, "draft"); // «вручён, но не получал» — спорный случай, только оператор
assert.equal(sF.urgency, "high");
assert.deepEqual(sF.actions.map((a) => a.id), ["cdek_claim"]);
assert.equal(sG.topic, "Ошибка комплектации"); // не тот товар — наша ошибка, а не «не подошёл размер»
assert.match(sG.reply, /наша ошибка/);
assert.equal(sH.intent, "order_change"); // отмена до отправки — кнопка оператору
assert.deepEqual(sH.actions.map((a) => a.id), ["cancel_order"]);
assert.equal(sI.kb[0].id, "kb-promo");
assert.equal(sI.mode, "auto");
// Регрессия: «оплатила … когда отправите» — это статус, а не вопрос об оплате; двойное списание — по-прежнему оплата
assert.equal(classifyRules("Оплатила заказ вчера, когда отправите?").intent, "order_status_check");
assert.equal(classifyRules("С карты списали два раза!!").topic, "Вопросы по оплате");
// Отмена уже отправленного заказа — объясняем отказ в ПВЗ, кнопки нет
const shipped = await runAgent({ message: "Хочу отменить заказ 48201" });
assert.equal(shipped.mode, "auto");
assert.equal(shipped.actions.length, 0);
// Казахский без LLM: правила понимают вопрос о статусе
assert.equal((await runAgent({ message: "Тапсырыс 48215 қашан жіберіледі?" })).intent, "order_status_check");
// Тема важнее интента от LLM: «ошибка комплектации» с интентом «общий вопрос» — всё равно возврат через оператора
assert.equal(intentForTopic("Ошибка комплектации"), "return_request");
assert.equal(intentForTopic("Отмена заказа"), "order_change");
assert.equal(intentForTopic("Где заказ"), undefined);
console.log("ok: varied situations");

// Whisper: повторы и «титры» на тишине — не сообщения клиента
import { looksLikeHallucination } from "./speech.ts";
assert.ok(looksLikeHallucination("Oh, oh, oh, oh, oh, oh, oh."));
assert.ok(looksLikeHallucination("Субтитры сделал DimaTorzok"));
assert.ok(!looksLikeHallucination("Где мой заказ 48201? Жду уже неделю"));
assert.ok(!looksLikeHallucination("да да"));
console.log("ok: whisper filter");
