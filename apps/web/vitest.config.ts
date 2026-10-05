import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Configuración de tests unitarios de `@ai-coo/web`.
 *
 * Se corre con `pnpm test` (o `turbo test` desde la raíz del monorepo).
 * Entorno Node: cubre lógica pura. Un componente sin hooks se puede probar
 * renderizándolo con `renderToStaticMarkup` (sin DOM). Los flujos de UI van con
 * Playwright (`apps/web/e2e/`).
 */
export default defineConfig({
  // JSX con el runtime automático, como lo compila Next: sin esto, un test que
  // importa un componente `.tsx` falla con "React is not defined" (SCRUM-493;
  // el primero es `components/shared/__tests__/campo-fecha.test.ts`).
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // El include arrancó como `lib/**` y eso hacía que un test fuera de esa
    // carpeta no corriera **sin avisar** — se ve verde porque no se ejecutó.
    // Ahora cubre cualquier carpeta de la app; los directorios de build y
    // dependencias quedan afuera por el `exclude` que Vitest trae por defecto.
    include: ["**/*.test.ts", "**/__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**", "e2e/**"],
    globals: false,
  },
});
