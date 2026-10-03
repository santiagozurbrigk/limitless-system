import { describe, expect, it } from "vitest";
import { miembrosParaSincronizar, type FilaMiembroFathom } from "@/lib/fathom/member-sync";

function fila(over: Partial<FilaMiembroFathom>): FilaMiembroFathom {
  return {
    id: "row",
    organization_id: "org-1",
    user_id: "user-1",
    encrypted_api_key: "v2.cifrada",
    last_sync_at: null,
    connected_at: "2026-10-03T00:47:55Z",
    status: "connected",
    webhook_token: "tok",
    ...over,
  };
}

describe("miembrosParaSincronizar (cron horario, SCRUM-448)", () => {
  it("sincroniza a quien conectó su key desde la sección por miembro", () => {
    expect(miembrosParaSincronizar([fila({})])).toHaveLength(1);
  });

  it("también a un miembro marcado con error: la próxima corrida puede recuperarlo", () => {
    expect(miembrosParaSincronizar([fila({ status: "error" })])).toHaveLength(1);
  });

  it("no toca las filas que creó la conexión de la organización (sin webhook_token)", () => {
    // Si las sincronizara, quien conectó quedaría como dueño de todas las
    // llamadas del negocio, que pasarían a ser privadas suyas.
    expect(miembrosParaSincronizar([fila({ webhook_token: null })])).toHaveLength(0);
  });

  it("no toca keys revocadas ni filas sin key", () => {
    expect(
      miembrosParaSincronizar([fila({ status: "revoked" }), fila({ encrypted_api_key: null })])
    ).toHaveLength(0);
  });
});
