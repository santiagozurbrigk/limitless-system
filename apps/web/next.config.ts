import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";
import { withSentryConfig } from "@sentry/nextjs";
import { sectionRedirects } from "./lib/navigation/redirects";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Monorepo root — prevents Next from picking wrong workspace (e.g. user home lockfile). */
const monorepoRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  eslint: {
    // `next lint` sólo revisa app, components, lib, pages y src por defecto.
    // El resto de las carpetas con código también (SCRUM-503: un test de
    // providers/ tenía un error que el lint del CI no veía).
    dirs: [
      "app",
      "components",
      "lib",
      "providers",
      "hooks",
      "layouts",
      "constants",
      "mocks",
      "routes",
      "types",
      "scripts",
      "workspaces",
      "e2e",
    ],
  },
  transpilePackages: ["@ai-coo/ui", "@ai-coo/types"],
  experimental: {
    serverActions: {
      // Adjuntos de la bandeja de ventas (Unipile permite hasta 15MB).
      bodySizeLimit: "16mb",
    },
  },
  outputFileTracingRoot: monorepoRoot,
  serverExternalPackages: [
    "fluent-ffmpeg",
    "@ffmpeg-installer/ffmpeg",
    "ffprobe-static",
  ],
  turbopack: {
    root: monorepoRoot,
  },
  async redirects() {
    return [
      /*
       * La landing pública de `/` se eliminó (2026-09-23): la raíz lleva al
       * login. Temporal y no permanente: si algún día vuelve una página en
       * `/`, un 308 cacheado en los navegadores la seguiría escondiendo.
       * Quien ya tiene sesión rebota de `/login` a su panel (middleware).
       */
      { source: "/", destination: "/login", permanent: false },
      ...sectionRedirects.map(({ source, destination }) => ({
        source,
        destination,
        permanent: false,
      })),
      // URI legacy en Google Cloud / envs viejos (sin /oauth/)
      {
        source: "/api/integrations/google-forms/callback",
        destination: "/api/integrations/google-forms/oauth/callback",
        permanent: false,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // DSN se lee de NEXT_PUBLIC_SENTRY_DSN / SENTRY_DSN en runtime.
  // Si no está seteado, Sentry queda silencioso (no rompe el build).
  silent: true,

  // Subir source maps solo si SENTRY_AUTH_TOKEN está configurado.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Tree-shaking de las integraciones que no usamos en el browser.
  disableLogger: true,

  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
