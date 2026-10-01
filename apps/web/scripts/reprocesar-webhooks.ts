/**
 * [EMBUDOS-WEBHOOK-PERDIDA] (SCRUM-6): reprocesa los eventos de pagos (Whop,
 * Commas) y de GHL que quedaron en `unmapped` o `error`.
 *
 * Uso (desde apps/web, con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY):
 *   npx tsx scripts/reprocesar-webhooks.ts                     # sólo cuenta, no cambia nada
 *   npx tsx scripts/reprocesar-webhooks.ts --aplicar           # reprocesa
 *   npx tsx scripts/reprocesar-webhooks.ts --aplicar --org <uuid> --limite 50
 */
import { createAdminClient } from "../lib/supabase/admin";
import { reprocesarWebhooks } from "../lib/webhooks/reprocesar";

function valorDe(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1]?.trim() : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const aplicar = argv.includes("--aplicar");
  const organizationId = valorDe(argv, "--org");
  const limite = Number(valorDe(argv, "--limite") ?? 100);

  if (!Number.isInteger(limite) || limite <= 0) {
    console.error("--limite tiene que ser un entero positivo");
    process.exit(1);
  }
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  ) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const resumenes = await reprocesarWebhooks(createAdminClient(), { aplicar, organizationId, limite });
  console.table(resumenes);
  if (!aplicar) console.log("Sólo se contó. Para reprocesar, agrega --aplicar.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
