import { redirect } from "next/navigation";
import { paths } from "@/routes/paths";

/** `/administracion` abre Organizaciones (SCRUM-551). */
export default function AdministracionPage() {
  redirect(paths.platform.consola.organizaciones);
}
