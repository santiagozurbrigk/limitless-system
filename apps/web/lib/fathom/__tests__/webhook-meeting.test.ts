import { describe, expect, it } from "vitest";
import { leerReunionDelWebhook } from "@/lib/fathom/webhook-meeting";

describe("leerReunionDelWebhook", () => {
  it("lee la reunión con la forma de GET /meetings en la raíz", () => {
    const reunion = leerReunionDelWebhook({
      recording_id: 987,
      title: "Demo con Ana",
      calendar_invitees: [{ email: "ana@cliente.com", is_external: true }],
    });
    expect(reunion?.recording_id).toBe("987");
    expect(reunion?.title).toBe("Demo con Ana");
    expect(reunion?.calendar_invitees).toHaveLength(1);
  });

  it("si viene envuelta, usa la grabación de adentro y no el id del evento", () => {
    const reunion = leerReunionDelWebhook({
      id: "evt_1",
      meeting: { recording_id: 55, title: "Seguimiento" },
    });
    expect(reunion?.recording_id).toBe("55");
  });

  it("sin id de grabación devuelve null (no inventa una llamada)", () => {
    expect(leerReunionDelWebhook({ title: "sin id" })).toBeNull();
    expect(leerReunionDelWebhook(null)).toBeNull();
    expect(leerReunionDelWebhook([1, 2])).toBeNull();
  });
});
