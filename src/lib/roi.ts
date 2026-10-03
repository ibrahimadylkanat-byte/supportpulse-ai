// ROI-калькулятор: консервативно — экономия только на тикетах, которые AI закрыл сам.
export type RoiInput = {
  ticketsPerMonth: number;
  deflection: number; // 0..1
  salaryPerMonth: number; // ₸ на оператора
  ahtWithoutSec: number;
  ahtWithSec: number;
  hoursPerMonth?: number; // рабочих часов оператора в месяц
};

export function roi({ ticketsPerMonth, deflection, salaryPerMonth, ahtWithoutSec, ahtWithSec, hoursPerMonth = 168 }: RoiInput) {
  const deflected = Math.round(Math.max(0, ticketsPerMonth) * Math.min(1, Math.max(0, deflection)));
  const hoursSaved = (deflected * Math.max(0, ahtWithoutSec - ahtWithSec)) / 3600;
  const moneySaved = Math.round((hoursSaved * Math.max(0, salaryPerMonth)) / hoursPerMonth);
  return {
    deflected,
    hoursSaved: Math.round(hoursSaved),
    moneySaved,
    moneySavedYear: moneySaved * 12,
    operatorsFreed: Math.round((hoursSaved / hoursPerMonth) * 10) / 10,
  };
}
