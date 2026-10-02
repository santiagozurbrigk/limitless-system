import Link from "next/link";
import { KeyRound } from "lucide-react";
import { tryRequireOrganizationId } from "@/lib/auth/bootstrap";
import { loadOrgCredentialState } from "@/lib/ai/credential-resolver";
import { avisoClaveIa } from "@/lib/ai/aviso-clave-ia";
import { paths } from "@/routes";

/**
 * El cartel que avisa que la organización no tiene IA por su clave de Claude.
 *
 * ⭐ Existe porque este problema era **invisible desde adentro del producto**.
 * La organización `familiayformacion` estuvo con su clave rechazada desde julio:
 * 12 llamadas fallando con `401` cada diez minutos, el análisis sin correr, y en
 * su pantalla no decía nada. La única forma de enterarse era abrir los registros
 * del servidor en Vercel — o sea, nadie.
 *
 * ⭐ Desde SCRUM-7 (sin clave propia, no hay IA) también avisa cuando la org
 * nunca cargó su clave: sin ese aviso, el análisis de llamadas, los reportes y
 * el agente dejarían de aparecer sin explicación. Qué dice en cada caso:
 * `lib/ai/aviso-clave-ia.ts`.
 *
 * ⭐ No se puede cerrar, a propósito. Un aviso que se descarta desaparece para
 * siempre y el problema sigue: mientras falte la clave, las funciones de IA de
 * esa cuenta no andan, y eso vale la molestia de la barra.
 *
 * Es un Server Component: se resuelve con la sesión de quien mira y no agrega
 * nada al bundle del navegador.
 */
export async function AvisoClaveIa({ esFounder }: { esFounder: boolean }) {
  const organizationId = await tryRequireOrganizationId();
  if (!organizationId) return null;

  let estado: Awaited<ReturnType<typeof loadOrgCredentialState>>;
  try {
    estado = await loadOrgCredentialState(organizationId);
  } catch {
    // Un aviso no puede tirar abajo la plataforma entera.
    return null;
  }

  const aviso = avisoClaveIa(estado);
  if (!aviso) return null;

  const grave = aviso.tono === "error";

  return (
    <div
      className={
        grave
          ? "border-b border-destructive/25 bg-destructive/10 px-4 py-2.5"
          : "border-b border-amber-500/25 bg-amber-500/10 px-4 py-2.5"
      }
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1">
        <KeyRound
          className={grave ? "h-4 w-4 shrink-0 text-destructive" : "h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"}
        />
        <p className="text-sm text-foreground">
          <span className="font-medium">{aviso.titulo}</span>{" "}
          <span className="text-muted-foreground">{aviso.detalle}</span>
        </p>

        {/*
          El link va sólo para quien puede arreglarlo. Mandar a Ajustes a alguien
          sin acceso es ofrecerle una puerta cerrada.
        */}
        {esFounder ? (
          <Link
            href={paths.platform.settingsTab("ia")}
            className={
              grave
                ? "ml-auto shrink-0 text-sm font-medium text-destructive underline underline-offset-4 hover:opacity-80"
                : "ml-auto shrink-0 text-sm font-medium text-amber-700 underline underline-offset-4 hover:opacity-80 dark:text-amber-300"
            }
          >
            {aviso.accion}
          </Link>
        ) : (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            Avisale a quien administra la cuenta.
          </span>
        )}
      </div>
    </div>
  );
}
