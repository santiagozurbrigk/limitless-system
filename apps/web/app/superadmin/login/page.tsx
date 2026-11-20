import { redirect } from "next/navigation";
import { paths } from "@/routes";

/** Login viejo del staff: desde SCRUM-552 el staff entra por /login. */
export default function SuperAdminLoginPage() {
  redirect(paths.auth.login);
}
