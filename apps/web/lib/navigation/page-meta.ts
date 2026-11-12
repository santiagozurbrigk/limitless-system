/**
 * ⭐ El mapa de pantallas: título, bajada y **a dónde se vuelve**.
 *
 * La flecha de "volver" no se pone a mano en cada página. Se deriva de la ruta:
 * `/marketing/content/abc` sube hasta encontrar una pantalla conocida y esa es
 * su vuelta. Cuando la convención no alcanza —`/operations/inputs`, que no
 * tiene una pantalla `/operations`— la entrada lo dice con `parent`.
 *
 * Que sea derivado y no manual es el punto: **una pantalla nueva no puede
 * olvidarse de tener vuelta**, igual que no puede olvidarse de tener título.
 * El test de este archivo recorre las páginas reales y falla si alguna cae en
 * el fallback.
 */
export type PageMeta = {
  title: string;
  subtitle?: string;
  /** Vuelta explícita, cuando subir un segmento no da con la pantalla padre. */
  parent?: string;
};

const PAGE_META: Record<string, PageMeta> = {
  "/login": {
    title: "Iniciar sesión",
    subtitle: "Panel cliente — fundadores y equipo",
  },
  "/onboarding": {
    title: "Configuración inicial",
    subtitle: "Contexto de negocio para personalizar la IA",
  },
  "/onboarding/holding": {
    title: "Onboarding del holding",
    subtitle: "Modelo de cobro y negocios del portfolio",
  },
  "/superadmin/login": {
    title: "Super Admin",
    subtitle: "Acceso interno restringido",
  },
  "/dashboard": {
    title: "Panel General",
    subtitle: "Vista operativa en 30 segundos",
  },
  "/finance": {
    title: "Finanzas",
    subtitle: "Salud financiera en tiempo real",
  },
  "/finance/expenses": {
    title: "Gastos",
    subtitle: "Gastos fijos, suscripciones y compensación del equipo",
  },
  "/product": {
    title: "Producto",
    subtitle: "Avatares, ofertas, escalera de valor y propuesta",
  },
  "/lanzamientos": { title: "Lanzamientos" },
  "/lanzamientos/nuevo": { title: "Nuevo lanzamiento" },
  "/product/value-ladder": {
    title: "Escalera de valor",
    subtitle: "Escalones de precio y ascenso del cliente",
  },
  "/product/proposition": {
    title: "Propuesta de valor",
    subtitle: "Mensaje central del negocio para la IA",
  },
  "/agent": {
    title: "Agente de negocio",
    subtitle: "Con acceso a todo el contexto de tu negocio",
  },
  "/marketing": {
    title: "Marketing",
    subtitle: "Rendimiento de contenido Instagram y conexión con ventas",
  },
  "/marketing/content": {
    title: "Contenido",
    subtitle: "Biblioteca visual de publicaciones y métricas por pieza",
  },
  "/marketing/sales-connection": {
    title: "Conexión con Ventas",
    subtitle: "Qué contenido genera conversaciones, bookings y ventas",
  },
  "/marketing/utms": {
    title: "UTMs de YouTube",
    subtitle: "Atribución de leads, bookings y ventas por video",
  },
  "/sales/inbox": {
    title: "Bandeja de ventas",
    subtitle: "Conversación + recorrido de contenido del lead",
  },
  "/sales/metrics": {
    title: "Métricas de ventas",
    subtitle: "Rendimiento por closer, agendamientos y operación comercial",
  },
  "/sales/closing": {
    title: "Closing",
    subtitle: "Calendario de cierre, Calendly y resultados",
  },
  "/clients": {
    title: "Clientes",
    subtitle: "Desde el cierre hasta caso de éxito",
  },
  "/clients/campos": {
    title: "Campos personalizados",
    subtitle: "Clientes — columnas de wins y checkpoints",
  },
  "/clients/checkpoints": {
    title: "Recorrido del cliente",
    subtitle: "Clientes — fases y checkpoints",
  },
  "/clients/wins": {
    title: "Wins",
    subtitle: "Clientes — logros y casos de éxito",
  },
  "/clients/revision": {
    title: "Revisión semanal",
    subtitle: "Clientes — a quién mirar esta semana",
  },
  "/operations/overview": {
    title: "Operaciones",
    subtitle: "Salud operativa del negocio",
  },
  "/operations/sops": {
    title: "SOPs",
    subtitle: "Biblioteca y creación de sistemas operativos",
  },
  "/operations/team-inputs": {
    title: "Team Inputs",
    subtitle: "Contexto intencional para la IA y el liderazgo",
  },
  "/workboard": {
    title: "Tablero de trabajo",
    subtitle: "Tareas del equipo por área y estado",
  },
  "/operations/weekly-inputs": {
    title: "Inputs semanales",
    subtitle: "Contexto semanal por departamento — menos de 2 minutos",
  },
  "/executive-reports/weekly": {
    title: "Reporte semanal",
    subtitle: "Inteligencia ejecutiva",
  },
  "/executive-reports/monthly": {
    title: "Reporte mensual",
    subtitle: "Inteligencia ejecutiva",
  },
  "/executive-reports/history": {
    title: "Historial de reportes",
    subtitle: "Reportes ejecutivos anteriores",
  },
  "/sops": {
    title: "SOPs",
    subtitle: "Biblioteca y creación de sistemas operativos",
  },
  "/team": {
    title: "Equipo",
    subtitle: "Miembros y roles de la organización",
  },
  // Limitless Webinars (SCRUM-543, SCRUM-545). La ficha (`/leads/[id]`) va por prefijo, abajo.
  "/inicio": { title: "Inicio" },
  // Consola de Administración (SCRUM-551). La ficha de una organización va por prefijo, abajo.
  "/administracion": { title: "Administración" },
  "/administracion/organizaciones": { title: "Organizaciones" },
  "/administracion/organizaciones/nueva": { title: "Nueva cuenta" },
  "/administracion/usuarios": { title: "Usuarios" },
  "/administracion/holdings": { title: "Holdings" },
  "/administracion/sistema": { title: "Sistema", subtitle: "Infraestructura, procesos y costos de IA" },
  "/administracion/onboarding": { title: "Onboarding de clientes" },
  "/leads": { title: "Leads" },
  "/business-context/documents": {
    title: "Base de conocimiento",
    subtitle: "Documentos, calls y frameworks para la IA",
  },
  "/integrations": {
    title: "Integraciones",
    subtitle: "Fuentes de datos conectadas",
  },
  "/intelligence": {
    title: "Inteligencia",
    subtitle: "Insights, recomendaciones, cuellos de botella, oportunidades y memoria IA",
  },
  "/settings": { title: "Configuración", subtitle: "Organización y perfil" },
  "/holding": {
    title: "Portfolio de negocios",
    subtitle: "Vista consolidada de todos tus negocios",
  },
  "/founder": {
    title: "Área del fundador",
    subtitle: "Vista estratégica de la operación",
  },
  "/super-admin/holding": {
    title: "Holding",
    subtitle: "Portfolio de sub-organizaciones y métricas agregadas",
  },
  "/super-admin/organizations": {
    title: "Organizaciones",
    subtitle: "Clientes de la plataforma",
  },
  "/super-admin/organizations/new": {
    title: "Crear cuenta",
    subtitle: "Nueva organización y founder",
  },
  "/super-admin/users": {
    title: "Usuarios",
    subtitle: "Todos los perfiles de la plataforma",
  },
  "/super-admin/waitlist": {
    title: "Waitlist",
    subtitle: "Aplicaciones desde la landing pública",
  },
  "/super-admin/costs": {
    title: "Costos de IA",
    subtitle: "Costos de IA, infra y rentabilidad por cliente",
  },
  "/super-admin/infrastructure": {
    title: "Infraestructura",
    subtitle: "Stack y conteos de la plataforma",
  },
  "/super-admin/ai-brain": {
    title: "Cerebro de IA general",
    subtitle: "Capa global de conocimiento — metodologías, frameworks y playbooks",
  },
  "/super-admin/ai-brain/library": {
    title: "Biblioteca de contenido",
    subtitle: "Documentos cargados en el cerebro global",
  },
  "/super-admin/ai-brain/add": {
    title: "Añadir contenido",
    subtitle: "Ampliar el conocimiento global de la plataforma",
  },
  "/comentarios": {
    title: "Comentarios",
    subtitle: "Marketing — conversaciones en tus publicaciones",
  },
  "/funnels": {
    title: "Embudos",
    subtitle: "Las mismas siete etapas para cualquier oferta",
  },
  "/integrations/discord": {
    title: "Discord",
    subtitle: "Integraciones — canales, vínculos y actividad",
  },
  "/integrations/import": {
    title: "Importar datos históricos",
    subtitle: "Integraciones — carga inicial desde GoHighLevel o Excel",
  },
  "/intelligence/ai-memory": {
    title: "Memoria de la IA",
    subtitle: "Inteligencia — qué recuerda el sistema de tu negocio",
  },
  "/intelligence/bottlenecks": {
    title: "Cuellos de botella",
    subtitle: "Inteligencia — dónde se traba la operación",
  },
  "/intelligence/insights": {
    title: "Hallazgos",
    subtitle: "Inteligencia — patrones detectados en tus datos",
  },
  "/intelligence/opportunities": {
    title: "Oportunidades",
    subtitle: "Inteligencia — dónde hay upside sin explotar",
  },
  "/intelligence/recommendations": {
    title: "Recomendaciones",
    subtitle: "Inteligencia — qué conviene hacer primero",
  },
  "/marketing/administrar": {
    title: "Administrar",
    subtitle: "Marketing — cuentas, etiquetas y configuración",
  },
  "/marketing/anuncios": {
    title: "Anuncios",
    subtitle: "Marketing — Meta Ads por pieza de contenido",
  },
  "/marketing/automatizaciones": {
    title: "Automatizaciones",
    subtitle: "Marketing — flujos y disparadores",
  },
  "/marketing/forms": {
    title: "Formularios",
    subtitle: "Marketing — formularios conectados y sus respuestas",
  },
  "/marketing/lead-magnets": {
    title: "Lead Magnets",
    subtitle: "Marketing — imanes de captación",
  },
  "/operations/inputs": {
    title: "Inputs",
    subtitle: "Operaciones — contexto que alimenta los análisis",
    parent: "/operations/overview",
  },
  "/redesign-preview": {
    title: "Vista previa del rediseño",
    subtitle: "Interno — pruebas del sistema de diseño",
  },
  "/sales/llamadas": {
    title: "Llamadas",
    subtitle: "Ventas — grabaciones de Fathom y análisis por llamada",
  },
  "/sales/cobros": {
    title: "Cobros",
    subtitle: "Ventas — plan, monto, adeudado y comprobantes por cliente",
  },
  "/sops/create": {
    title: "Crear SOP",
    subtitle: "Desde texto o desde un video",
  },
  "/team/members": {
    title: "Miembros",
    subtitle: "Equipo — personas, roles y accesos",
  },
  "/team/roles": {
    title: "Roles",
    subtitle: "Equipo — permisos por módulo",
  },
};

/** Título y bajada de una ruta. La vuelta la resuelve `getPageMeta`. */
function resolveMeta(pathname: string): PageMeta {
  if (PAGE_META[pathname]) {
    return PAGE_META[pathname];
  }

  if (
    pathname.startsWith("/executive-reports/") &&
    pathname !== "/executive-reports/history"
  ) {
    return { title: "Detalle del reporte", subtitle: "Inteligencia ejecutiva" };
  }
  if (pathname.startsWith("/sops/") && pathname !== "/sops/create") {
    return { title: "Detalle del SOP", subtitle: "Sistema operativo vivo" };
  }
  if (
    pathname.startsWith("/business-context/") &&
    pathname !== "/business-context/documents"
  ) {
    return { title: "Visor de documento", subtitle: "Transcripción, resumen e insights" };
  }
  if (pathname.startsWith("/product/avatar/")) {
    return { title: "Avatar", subtitle: "Ficha de personaje — Producto" };
  }
  if (pathname.startsWith("/product/offer/")) {
    return { title: "Oferta", subtitle: "Detalle de oferta — Producto" };
  }
  if (
    pathname.startsWith("/clients/") &&
    pathname !== "/clients/pending-calls" &&
    pathname !== "/clients/campos" &&
    pathname !== "/clients/checkpoints" &&
    pathname !== "/clients/wins" &&
    pathname !== "/clients/revision"
  ) {
    return { title: "Detalle de cliente", subtitle: "Clientes" };
  }
  if (pathname === "/clients/pending-calls") {
    return {
      title: "Llamadas pendientes",
      subtitle: "Clientes — seguimiento Fathom",
    };
  }
  if (pathname.startsWith("/marketing/forms/") && pathname !== "/marketing/forms") {
    return { title: "Formulario", subtitle: "Marketing — respuestas y métricas" };
  }
  if (pathname.startsWith("/agent/stage/")) {
    return { title: "Etapa del negocio", subtitle: "Agente de negocio" };
  }
  if (pathname.startsWith("/agent/project/")) {
    return { title: "Proyecto", subtitle: "Agente de negocio" };
  }
  if (pathname.startsWith("/agent/") && pathname !== "/agent") {
    return { title: "Conversación", subtitle: "Agente de negocio" };
  }
  if (pathname.startsWith("/funnels/") && pathname.endsWith("/configurar")) {
    return { title: "Configurar embudo", subtitle: "Fuentes y etapas del embudo" };
  }
  if (pathname.startsWith("/funnels/") && pathname !== "/funnels") {
    return { title: "Embudo", subtitle: "Las siete etapas de esta oferta" };
  }
  if (pathname.startsWith("/lanzamientos/") && pathname.endsWith("/configuracion")) {
    return { title: "Configuración del lanzamiento" };
  }
  if (pathname.startsWith("/lanzamientos/") && pathname !== "/lanzamientos") {
    return { title: "Detalle del lanzamiento" };
  }
  if (pathname.startsWith("/administracion/organizaciones/")) {
    return { title: "Organización" };
  }
  if (pathname.startsWith("/leads/") && pathname !== "/leads") {
    return { title: "Ficha del lead" };
  }
  if (pathname.startsWith("/marketing/content/") && pathname !== "/marketing/content") {
    return { title: "Publicación", subtitle: "Detalle de contenido — Marketing" };
  }
  if (
    pathname.startsWith("/super-admin/organizations/") &&
    pathname !== "/super-admin/organizations/new"
  ) {
    return {
      title: "Detalle de organización",
      subtitle: "Super Admin",
    };
  }
  if (
    pathname.startsWith("/super-admin/ai-brain/") &&
    pathname !== "/super-admin/ai-brain/library" &&
    pathname !== "/super-admin/ai-brain/add"
  ) {
    return {
      title: "Visor de documento",
      subtitle: "Cerebro de IA general",
    };
  }
  /**
   * ⭐ Una ruta desconocida **no se disfraza de dashboard**.
   *
   * Antes devolvía "Panel General", y eso le mentía al usuario sobre dónde
   * estaba: la pantalla de importar datos históricos se anunciaba como el panel
   * general, igual que otras diecinueve. El test de abajo hace que esto sólo se
   * vea en una ruta que no existe.
   */
  return { title: FALLBACK_TITLE };
}

/** Lo que ve la barra superior: título, bajada y hacia dónde vuelve. */
export type ResolvedPageMeta = {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string };
};

export const FALLBACK_TITLE = "Limitless";

export function getPageMeta(pathname: string): ResolvedPageMeta {
  const meta = resolveMeta(pathname);
  const back = resolveBack(pathname, meta);
  return back
    ? { title: meta.title, subtitle: meta.subtitle, back }
    : { title: meta.title, subtitle: meta.subtitle };
}

/**
 * A dónde vuelve la flecha.
 *
 * Primero la vuelta explícita de la entrada; si no, se sube segmento a segmento
 * hasta dar con una pantalla conocida. `/funnels/abc/configurar` prueba
 * `/funnels/abc` —que no está— y llega a `/funnels`, que sí.
 *
 * Una pantalla de primer nivel no tiene vuelta: ya está en la raíz de su
 * módulo, y una flecha que no lleva a ningún lado es peor que ninguna.
 */
function resolveBack(
  pathname: string,
  meta: PageMeta
): { href: string; label: string } | undefined {
  if (meta.parent) {
    const padre = PAGE_META[meta.parent];
    return padre ? { href: meta.parent, label: padre.title } : undefined;
  }

  const segmentos = pathname.split("/").filter(Boolean);
  for (let corte = segmentos.length - 1; corte > 0; corte -= 1) {
    const candidato = `/${segmentos.slice(0, corte).join("/")}`;
    if (candidato === pathname) continue;
    const padre = PAGE_META[candidato];
    if (padre) return { href: candidato, label: padre.title };
  }

  return undefined;
}
