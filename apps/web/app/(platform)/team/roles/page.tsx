import { redirect } from "next/navigation";
import { paths } from "@/routes";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function TeamRolesRedirectPage() {
  const sinAcceso = await exigirModuloDeLaPagina("team");
  if (sinAcceso) return sinAcceso;

  redirect(`${paths.platform.team.root}#roles`);
}
