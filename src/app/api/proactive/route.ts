import { runProactive } from "@/lib/proactive";
import { withTickets } from "@/lib/ticketStore";

// «Предупредить клиентов»: AI сам проверяет заказы в пути и пишет клиентам первым
export const POST = withTickets(async () => {
  const sent = await runProactive();
  return Response.json({ sent: sent.length });
});
