import { UsersTable } from "@/components/super-admin";
import { loadAdminUsers } from "@/lib/super-admin/queries";

/** Usuarios de todas las organizaciones (SCRUM-551). */
export default async function UsuariosPage() {
  const users = await loadAdminUsers();
  return <UsersTable users={users} base="consola" />;
}
