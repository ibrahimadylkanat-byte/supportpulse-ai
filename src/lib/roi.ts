// ROI-калькулятор: консервативно — экономия только на тикетах, которые AI закрыл сам.
export type RoiInput = {
  ticketsPerMonth: number;
  deflection: number; // 0..1
  salaryPerMonth: number; // ₸ на оператора
  ahtWithoutSec: number;
  ahtWithSec: number;
  hoursPerMonth?: number; // рабочих часов оператора в месяц
  aiCostPerTicket?: number; // ₸ за обращение (LLM, Whisper, сервер) — через AI идут ВСЕ обращения
};

export function roi({ ticketsPerMonth, deflection, salaryPerMonth, ahtWithoutSec, ahtWithSec, hoursPerMonth = 168, aiCostPerTicket = 0 }: RoiInput) {
  const tickets = Math.max(0, ticketsPerMonth);
  const deflected = Math.round(tickets * Math.min(1, Math.max(0, deflection)));
  const hoursSaved = (deflected * Math.max(0, ahtWithoutSec - ahtWithSec)) / 3600;
  const grossSaved = Math.round((hoursSaved * Math.max(0, salaryPerMonth)) / hoursPerMonth);
  const aiCost = Math.round(tickets * Math.max(0, aiCostPerTicket));
  const moneySaved = grossSaved - aiCost; // чистая экономия
  return {
    deflected,
    grossSaved,
    aiCost,
    hoursSaved: Math.round(hoursSaved),
    moneySaved,
    moneySavedYear: moneySaved * 12,
    operatorsFreed: Math.round((hoursSaved / hoursPerMonth) * 10) / 10,
  };
}
