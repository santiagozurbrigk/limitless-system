import { ExpensesOverview } from "@/components/expenses/expenses-overview";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function ExpensesPage() {
  const sinAcceso = await exigirModuloDeLaPagina("finance");
  if (sinAcceso) return sinAcceso;

  return <ExpensesOverview />;
}
