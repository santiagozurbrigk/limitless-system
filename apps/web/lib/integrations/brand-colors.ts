import type { IntegrationProvider } from "@/constants/integrations";

export type IntegrationBrand = {
  /** Color hex para el fondo sólido del logo. */
  bg: string;
  /** Clase Tailwind para el fondo, cuando la marca es un gradiente. */
  bgClass?: string;
};

/** Colores de marca: ícono blanco sobre fondo sólido (estilo app icon real). */
export const INTEGRATION_BRAND_COLORS: Record<
  IntegrationProvider,
  IntegrationBrand
> = {
  // Ventas y conversaciones
  zernio: { bg: "#6366F1" },
  manychat: { bg: "#0084FF" },
  calendly: { bg: "#006BFF" },
  ghl: { bg: "#E9A700" },
  fathom: { bg: "#007299" },
  unipile_instagram: {
    bg: "#C13584",
    bgClass: "bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045]",
  },
  unipile_whatsapp: { bg: "#25D366" },
  // Marketing y contenido
  google_ecosystem: { bg: "#4285F4" },
  youtube: { bg: "#FF0000" },
  instagram: {
    bg: "#C13584",
    bgClass: "bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045]",
  },
  typeform: { bg: "#262627" },
  google_forms: { bg: "#7248B9" },
  // Embudos
  vturb: { bg: "#1B1B1F" },
  webinarjam: { bg: "#2E7DD1" },
  hyros: { bg: "#111827" },
  landing: { bg: "#0F766E" },
  // Cobros
  whop: { bg: "#FF6243" },
  fanbasis: { bg: "#0F172A" },
  stripe: { bg: "#635BFF" },
  mercadopago: { bg: "#00B1EA" },
  // Operación y datos
  discord: { bg: "#5865F2" },
  clickup: { bg: "#7B68EE" },
};

/**
 * Cómo se dibuja el logo de cada proveedor.
 *
 * Hay dos formas, y la diferencia no es estética sino de qué asset publica cada
 * marca:
 *
 * - **`mask`** — un glifo monocromo de una sola silueta. Se pinta en blanco
 *   sobre el color de marca con `mask-image`. Es el formato de los íconos de
 *   Simple Icons.
 * - **`icon`** — el app icon de la marca, que **ya trae su propio fondo y sus
 *   propios colores**. Pasarlo por una máscara lo destruiría: un cuadrado
 *   opaco se convierte en un cuadrado blanco. Se renderiza tal cual.
 *
 * Los que no tienen ninguno de los dos se dibujan con su inicial. Hoy no hay
 * ninguno en ese caso, pero el camino queda porque es lo que corresponde
 * cuando entra un proveedor nuevo: inventarle un logo aproximado a una marca
 * ajena queda peor que una inicial honesta.
 *
 * ⚠️ Tres assets estaban mal y se reemplazaron por la marca real: `fathom.svg`
 * era el logo de **Fathom Analytics**, que es otra empresa; `ghl.svg` y
 * `zernio.svg` eran dibujos hechos a mano (el de Zernio era literalmente un
 * signo "=" en un `<text>`, que en una máscara no dibuja nada y dejaba el
 * cuadro vacío).
 */
export type IntegrationLogoAsset =
  | { kind: "mask"; src: string }
  | { kind: "icon"; src: string }
  | { kind: "monogram" };

const LOGO_ASSETS: Partial<Record<IntegrationProvider, IntegrationLogoAsset>> =
  {
    // Glifos monocromos sobre el color de marca
    calendly: { kind: "mask", src: "/integrations/calendly.svg" },
    discord: { kind: "mask", src: "/integrations/discord.svg" },
    youtube: { kind: "mask", src: "/integrations/youtube.svg" },
    instagram: { kind: "mask", src: "/integrations/instagram.svg" },
    unipile_instagram: { kind: "mask", src: "/integrations/instagram.svg" },
    unipile_whatsapp: { kind: "mask", src: "/integrations/whatsapp.svg" },
    clickup: { kind: "mask", src: "/integrations/clickup.svg" },
    stripe: { kind: "mask", src: "/integrations/stripe.svg" },
    mercadopago: { kind: "mask", src: "/integrations/mercadopago.svg" },
    google_forms: { kind: "mask", src: "/integrations/google_forms.svg" },
    google_ecosystem: { kind: "mask", src: "/integrations/google_forms.svg" },
    // Landing no es una marca ajena: es la landing propia del negocio. El
    // glifo es un globo genérico (SCRUM-527).
    landing: { kind: "mask", src: "/integrations/landing.svg" },

    // App icons con su propio fondo
    zernio: { kind: "icon", src: "/integrations/zernio.svg" },
    manychat: { kind: "icon", src: "/integrations/manychat.png" },
    typeform: { kind: "icon", src: "/integrations/typeform.png" },
    ghl: { kind: "icon", src: "/integrations/ghl.png" },
    fathom: { kind: "icon", src: "/integrations/fathom.png" },
    vturb: { kind: "icon", src: "/integrations/vturb.png" },
    webinarjam: { kind: "icon", src: "/integrations/webinarjam.png" },
    hyros: { kind: "icon", src: "/integrations/hyros.png" },
    whop: { kind: "icon", src: "/integrations/whop.png" },
    fanbasis: { kind: "icon", src: "/integrations/fanbasis.svg" },
  };

export function integrationLogoAsset(
  provider: IntegrationProvider,
): IntegrationLogoAsset {
  return LOGO_ASSETS[provider] ?? { kind: "monogram" };
}
