import { redirect } from "next/navigation";
import { paths } from "@/routes";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function IntelligenceOpportunitiesRedirectPage() {
  const sinAcceso = await exigirModuloDeLaPagina("operations");
  if (sinAcceso) return sinAcceso;

  redirect(`${paths.platform.intelligence.root}#opportunities`);
}
