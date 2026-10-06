/**
 * Centralized route paths — single source of truth for navigation and links.
 * File-based routing lives in app/; this file defines path constants only.
 */

const PLATFORM = "";

export const paths = {
  home: "/",
  auth: {
    login: "/login",
    callback: "/auth/callback",
    recover: "/auth/recover",
    forcePasswordChange: "/auth/force-password-change",
    updatePassword: "/auth/update-password",
  },
  /** Aceptar una invitación de equipo (`/invite?token=`), fuera de la plataforma. */
  invite: "/invite",
  demo: "/demo",
  designSystem: "/design-system",

  platform: {
    dashboard: `${PLATFORM}/dashboard`,

    finance: {
      root: `${PLATFORM}/finance`,
      expenses: `${PLATFORM}/finance/expenses`,
    },

    product: {
      root: `${PLATFORM}/product`,
      avatar: (id: string) => `${PLATFORM}/product/avatar/${id}`,
      offer: (id: string) => `${PLATFORM}/product/offer/${id}`,
      valueLadder: `${PLATFORM}/product/value-ladder`,
      proposition: `${PLATFORM}/product/proposition`,
    },

    funnels: {
      root: `${PLATFORM}/funnels`,
      detail: (id: string) => `${PLATFORM}/funnels/${id}`,
      configure: (id: string) => `${PLATFORM}/funnels/${id}/configurar`,
      comparar: `${PLATFORM}/funnels/comparar`,
    },

    lanzamientos: `${PLATFORM}/lanzamientos`,
    lanzamientosDetail: (id: string) => `${PLATFORM}/lanzamientos/${id}`,

    agent: {
      root: `${PLATFORM}/agent`,
      conversation: (id: string) => `${PLATFORM}/agent/${id}`,
      project: (id: string) => `${PLATFORM}/agent/project/${id}`,
      stage: (id: string) => `${PLATFORM}/agent/stage/${id}`,
    },

    workboard: {
      root: `${PLATFORM}/workboard`,
    },

    marketing: {
      overview: `${PLATFORM}/marketing`,
      content: `${PLATFORM}/marketing/content`,
      contentDetail: (id: string) => `${PLATFORM}/marketing/content/${id}`,
      anuncios: `${PLATFORM}/marketing/anuncios`,
      administrar: `${PLATFORM}/marketing/administrar`,
      salesConnection: `${PLATFORM}/marketing/sales-connection`,
      forms: `${PLATFORM}/marketing/forms`,
      formDetail: (id: string) => `${PLATFORM}/marketing/forms/${id}`,
      utms: `${PLATFORM}/marketing/utms`,
      automatizaciones: `${PLATFORM}/marketing/automatizaciones`,
      leadMagnets: `${PLATFORM}/marketing/lead-magnets`,
    },

    sales: {
      inbox: `${PLATFORM}/sales/inbox`,
      metrics: `${PLATFORM}/sales/metrics`,
      closing: `${PLATFORM}/sales/closing`,
      llamadas: `${PLATFORM}/sales/llamadas`,
      /**
       * El seguimiento del cobro de cada cliente: plan, monto, adeudado,
       * cuotas y comprobantes.
       *
       * ⭐ Vive en Ventas y no en Clientes porque es la continuación del cierre:
       * `/sales/closing` pacta las condiciones de pago y acá se sigue si se
       * cumplen. Clientes quedó para la entrega —dónde está parado cada uno en
       * su recorrido—, que es otra pregunta y la hace otra persona.
       */
      cobros: `${PLATFORM}/sales/cobros`,
      /** Cobros con el historial de un cliente ya desplegado. */
      cobrosDeCliente: (id: string) => `${PLATFORM}/sales/cobros?cliente=${id}`,
    },

    clients: {
      root: `${PLATFORM}/clients`,
      detail: (id: string) => `${PLATFORM}/clients/${id}`,
      pendingCalls: `${PLATFORM}/clients/pending-calls`,
      /** C0 · Configuración de las columnas configurables de wins y checkpoints. */
      customFields: `${PLATFORM}/clients/campos`,
      /** C1 · Catálogo de fases y checkpoints del recorrido del cliente. */
      checkpoints: `${PLATFORM}/clients/checkpoints`,
      /** A · Tracker de wins y dashboard de casos. */
      wins: `${PLATFORM}/clients/wins`,
      /** ⭐ La revisión semanal: cuatro preguntas, una lista de nombres. */
      weeklyReview: `${PLATFORM}/clients/revision`,
    },

    operations: {
      overview: `${PLATFORM}/operations/overview`,
      sops: `${PLATFORM}/operations/sops`,
      inputs: `${PLATFORM}/operations/inputs`,
      // legacy — kept for backwards compat, map to new routes
      teamInputs: `${PLATFORM}/operations/inputs`,
      weeklyInputs: `${PLATFORM}/operations/inputs`,
    },

    /**
     * Reportes ejecutivos.
     *
     * Ya no hay páginas por cadencia (`/weekly`, `/monthly`): el último de cada
     * una se lee en el panel de la barra superior. Quedan el historial y el
     * detalle, que son lo que sirve como página: volver sobre uno viejo y
     * poder compartir el link.
     */
    executiveReports: {
      history: `${PLATFORM}/executive-reports/history`,
      detail: (id: string) => `${PLATFORM}/executive-reports/${id}`,
    },

    sops: {
      root: `${PLATFORM}/operations/sops`,
      library: `${PLATFORM}/operations/sops`,
      create: `${PLATFORM}/sops/create`,
      detail: (id: string) => `${PLATFORM}/sops/${id}`,
    },

    businessContext: {
      documents: `${PLATFORM}/business-context/documents`,
      viewer: (id: string) => `${PLATFORM}/business-context/${id}`,
    },

    intelligence: {
      root: `${PLATFORM}/intelligence`,
      insights: `${PLATFORM}/intelligence/insights`,
      recommendations: `${PLATFORM}/intelligence/recommendations`,
      bottlenecks: `${PLATFORM}/intelligence/bottlenecks`,
      opportunities: `${PLATFORM}/intelligence/opportunities`,
      aiMemory: `${PLATFORM}/intelligence/ai-memory`,
    },

    integrations: `${PLATFORM}/integrations`,
    integrationsDiscord: `${PLATFORM}/integrations/discord`,
    integrationsImport: `${PLATFORM}/integrations/import`,
    comentarios: `${PLATFORM}/comentarios`,

    team: {
      root: `${PLATFORM}/team`,
      members: `${PLATFORM}/team/members`,
      roles: `${PLATFORM}/team/roles`,
    },

    settings: `${PLATFORM}/settings`,
    settingsTab: (tab: string) => `${PLATFORM}/settings?tab=${tab}`,
    holding: `${PLATFORM}/holding`,
    onboarding: `${PLATFORM}/onboarding`,
    holdingOnboarding: `${PLATFORM}/onboarding/holding`,
  },

  founder: {
    root: "/founder",
  },

  superAdmin: {
    login: "/superadmin/login",
    dashboard: "/superadmin/dashboard",
    root: "/super-admin",
    organizations: "/super-admin/organizations",
    organizationDetail: (id: string) => `/super-admin/organizations/${id}`,
    organizationsNew: "/super-admin/organizations/new",
    users: "/super-admin/users",
    costs: "/super-admin/costs",
    infrastructure: "/super-admin/infrastructure",
    clientHealth: "/super-admin/client-health",
    onboarding: "/super-admin/onboarding",
    waitlist: "/super-admin/waitlist",
    trials: "/super-admin/trials",
    holding: "/super-admin/holding",
    aiBrain: {
      root: "/super-admin/ai-brain",
      library: "/super-admin/ai-brain/library",
      documents: "/super-admin/ai-brain/library",
      upload: "/super-admin/ai-brain/add",
      add: "/super-admin/ai-brain/add",
      document: (id: string) => `/super-admin/ai-brain/${id}`,
    },
  },
} as const;
