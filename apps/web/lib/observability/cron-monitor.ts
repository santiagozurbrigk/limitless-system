import * as Sentry from "@sentry/nextjs";
import vercelConfig from "@/vercel.json";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import { reportarFalla } from "@/lib/observability/reportar-falla";

/**
 * Sentry Cron Monitors para los crons de `vercel.json` (SCRUM-84).
 *
 * ⭐ Cada corrida avisa a Sentry cuándo empieza y cómo termina. Si un cron no
 * corre en su horario, o termina con error o 5xx, Sentry abre un issue y la
 * regla de alerta lo manda por mail (`docs/operacion/alertas.md`).
 *
 * El horario sale de `vercel.json`: una sola fuente, así un cron nuevo o un
 * cambio de horario no deja al monitor desfasado.
 *
 * Sólo se registran las corridas autorizadas (las de Vercel Cron o las manuales
 * con `CRON_SECRET`): un pedido sin credencial no es una corrida.
 */

type CronConfig = { path: string; schedule: string };
const CRONS: CronConfig[] = (vercelConfig as { crons?: CronConfig[] }).crons ?? [];

/** `/api/cron/ghl-sync` → `cron-ghl-sync`; `/api/integrations/fathom/process` → `integrations-fathom-process`. */
export function slugDeCron(path: string): string {
  return path
    .replace(/^\/api\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function horarioDeCron(path: string): string | undefined {
  return CRONS.find((cron) => cron.path === path)?.schedule;
}

export function rutasDeCrons(): string[] {
  return CRONS.map((cron) => cron.path);
}

function estaAutorizado(request: Request): boolean {
  try {
    return assertCronAuthorized(request) === null;
  } catch {
    return false;
  }
}

export function conMonitorDeCron(
  path: string,
  handler: (request: Request) => Promise<Response>
): (request: Request) => Promise<Response> {
  const schedule = horarioDeCron(path);

  return async (request: Request) => {
    // Sin horario en vercel.json o sin credencial: no es una corrida de cron.
    if (!schedule || !estaAutorizado(request)) return handler(request);

    const monitorSlug = slugDeCron(path);
    const inicio = Date.now();
    const checkInId = Sentry.captureCheckIn(
      { monitorSlug, status: "in_progress" },
      {
        schedule: { type: "crontab", value: schedule },
        timezone: "UTC",
        // Vercel puede arrancar un cron con algunos minutos de atraso.
        checkinMargin: 5,
        maxRuntime: 15,
        // Una falla aislada no despierta a nadie; dos seguidas sí.
        failureIssueThreshold: 2,
        recoveryThreshold: 1,
      }
    );

    const cerrar = async (status: "ok" | "error") => {
      Sentry.captureCheckIn({
        checkInId,
        monitorSlug,
        status,
        duration: (Date.now() - inicio) / 1000,
      });
      // La lambda puede congelarse apenas devuelve: se manda antes.
      await Sentry.flush(2000).catch(() => false);
    };

    try {
      const response = await handler(request);
      await cerrar(response.status >= 500 ? "error" : "ok");
      return response;
    } catch (error) {
      reportarFalla(error, { cron: path });
      await cerrar("error");
      throw error;
    }
  };
}
