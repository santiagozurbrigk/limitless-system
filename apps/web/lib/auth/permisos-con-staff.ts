import type { OrganizationExperience } from "@/lib/organization/experience";

/**
 * Administración (SCRUM-551) es del menú `limitless` y sólo la ve el staff de
 * la lista: para esa experiencia se suma `esStaff` a los permisos que usan la
 * barra, la paleta y la pantalla de inicio. En las otras experiencias no se
 * consulta la lista (`esStaff` no se pide). Si la lista no se puede leer,
 * `esStaff` tiene que dar `false` (lo hace `isStaffUser`) y la entrada no se
 * muestra. El acceso real lo decide el layout de `/administracion` y cada
 * acción (`requireStaff`). Lógica pura, sin `server-only`, para testearla.
 */
export async function permisosConStaff<P extends object>(
  experiencia: OrganizationExperience,
  permisos: P,
  esStaff: () => Promise<boolean>
): Promise<P & { esStaff?: boolean }> {
  if (experiencia !== "limitless") return permisos;
  return { ...permisos, esStaff: await esStaff() };
}
