/**
 * Re-cifra todos los secretos guardados con la clave maestra actual y el formato
 * v2 (con AAD). Se usa al rotar `ENCRYPTION_MASTER_KEY` y para cifrar lo que haya
 * quedado en texto plano legacy.
 *
 * Procedimiento completo (cuándo y cómo correrlo): docs/operacion/rotacion-master-key.md
 *
 * Uso (desde apps/web):
 *   pnpm dlx tsx scripts/reencrypt-secrets.ts            # simulación: no escribe nada
 *   pnpm dlx tsx scripts/reencrypt-secrets.ts --apply    # escribe
 *
 * En un entorno de Claude Code en la nube, Node no usa el proxy de salida por su
 * cuenta: anteponer `NODE_USE_ENV_PROXY=1` a los dos comandos.
 *
 * Variables:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   ENCRYPTION_MASTER_KEY            la clave con la que tiene que quedar todo
 *   ENCRYPTION_MASTER_KEY_PREVIOUS   la anterior, si se está rotando
 *
 * Nunca imprime secretos: sólo tabla, columna, id de fila y conteos.
 *
 * Cada UPDATE sólo pisa el valor si sigue siendo el que se leyó: si alguien
 * reconectó la integración mientras corría, esa fila se saltea (ya quedó
 * cifrada con la clave actual por el código nuevo).
 *
 * Sale con código 1 si alguna fila falló: el paso siguiente del procedimiento
 * (sacar la clave anterior) no se hace hasta que salga limpio.
 */
import { createAdminClient } from "../lib/supabase/admin";
import {
  SECRET_COLUMNS,
  contextForRow,
  planReencryption,
  type SecretColumn,
} from "../lib/security/reencrypt";

const PAGE_SIZE = 500;

type ColumnReport = {
  table: string;
  column: string;
  total: number;
  keep: number;
  previous_key: number;
  plaintext: number;
  skipped_concurrent: number;
  failed: number;
};

type Admin = ReturnType<typeof createAdminClient>;

async function processColumn(
  admin: Admin,
  column: SecretColumn,
  apply: boolean
): Promise<ColumnReport> {
  const report: ColumnReport = {
    table: column.table,
    column: column.column,
    total: 0,
    keep: 0,
    previous_key: 0,
    plaintext: 0,
    skipped_concurrent: 0,
    failed: 0,
  };

  const selectColumns = Array.from(
    new Set([column.keyColumn, column.orgColumn, column.userColumn, column.column].filter(Boolean))
  ).join(", ");

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from(column.table)
      .select(selectColumns)
      .not(column.column, "is", null)
      .order(column.keyColumn, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`${column.table}.${column.column}: ${error.message}`);
    }
    const rows = (data ?? []) as unknown as Record<string, unknown>[];

    for (const row of rows) {
      report.total += 1;
      const rowId = String(row[column.keyColumn]);
      const stored = row[column.column];
      const context = contextForRow(column, row);

      if (typeof stored !== "string" || !context) {
        report.failed += 1;
        console.error(`  ✗ ${column.table}.${column.column} fila ${rowId}: falta la org o el usuario dueño`);
        continue;
      }

      const plan = planReencryption(stored, context, column.allowsPlaintext);

      if (plan.action === "keep") {
        report.keep += 1;
        continue;
      }
      if (plan.action === "fail") {
        report.failed += 1;
        console.error(`  ✗ ${column.table}.${column.column} fila ${rowId}: ${plan.reason}`);
        continue;
      }

      if (apply) {
        const { data: updated, error: updateError } = await admin
          .from(column.table)
          .update({ [column.column]: plan.value })
          .eq(column.keyColumn, rowId)
          .eq(column.column, stored)
          .select(column.keyColumn);

        if (updateError) {
          report.failed += 1;
          console.error(
            `  ✗ ${column.table}.${column.column} fila ${rowId}: no se pudo escribir (${updateError.message})`
          );
          continue;
        }
        if (!updated || updated.length === 0) {
          report.skipped_concurrent += 1;
          continue;
        }
      }

      report[plan.from] += 1;
    }

    if (rows.length < PAGE_SIZE) break;
  }

  return report;
}

async function main() {
  const apply = process.argv.includes("--apply");

  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ENCRYPTION_MASTER_KEY"]) {
    if (!process.env[name]?.trim()) {
      console.error(`Falta ${name}`);
      process.exit(1);
    }
  }

  console.log(
    apply
      ? "Modo --apply: se reescriben los secretos que no estén en v2 con la clave actual.\n"
      : "Simulación (sin --apply): no se escribe nada. Los conteos dicen qué se reescribiría.\n"
  );
  console.log(
    process.env.ENCRYPTION_MASTER_KEY_PREVIOUS?.trim()
      ? "Clave anterior cargada: se aceptan secretos cifrados con cualquiera de las dos.\n"
      : "Sin clave anterior: sólo se acepta la clave actual.\n"
  );

  const admin = createAdminClient();
  const reports: ColumnReport[] = [];
  for (const column of SECRET_COLUMNS) {
    reports.push(await processColumn(admin, column, apply));
  }

  console.table(
    reports.map((r) => ({
      columna: `${r.table}.${r.column}`,
      total: r.total,
      "ya ok": r.keep,
      "desde clave anterior": r.previous_key,
      "desde texto plano": r.plaintext,
      "salteadas (cambiaron)": r.skipped_concurrent,
      fallidas: r.failed,
    }))
  );

  const failed = reports.reduce((sum, r) => sum + r.failed, 0);
  const pending = reports.reduce(
    (sum, r) => sum + r.previous_key + r.plaintext,
    0
  );

  if (failed > 0) {
    console.error(
      `\n${failed} secreto(s) no se pudieron procesar. NO saques la clave anterior: ` +
        "revisá las filas de arriba (ver docs/operacion/rotacion-master-key.md)."
    );
    process.exit(1);
  }

  console.log(
    apply
      ? `\nListo: ${pending} secreto(s) reescritos. Volvé a correr sin --apply para confirmar que todo queda en "ya ok".`
      : `\n${pending} secreto(s) se reescribirían. Corré con --apply para aplicarlo.`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
