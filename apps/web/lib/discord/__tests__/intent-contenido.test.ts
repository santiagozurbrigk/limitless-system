import { describe, expect, it } from "vitest";
import { diagnosticarIntentDeContenido } from "@/lib/discord/intent-contenido";

const conTexto = { content: "hola", attachments: [] };
const vacio = { content: "", attachments: [] };
const soloFoto = { content: "", attachments: [{ url: "https://x", type: "image/png" }] };

describe("diagnóstico del intent MESSAGE CONTENT", () => {
  it("unos pocos mensajes vacíos entre muchos con texto no son el intent apagado", () => {
    // El caso real de Limitless: 5 vacíos de los últimos 50.
    const recientes = [...Array(45).fill(conTexto), ...Array(5).fill(vacio)];
    expect(diagnosticarIntentDeContenido(recientes)).toEqual({
      faltaIntent: false,
      revisados: 50,
      vacios: 5,
    });
  });

  it("si casi todos los recientes llegan vacíos, falta el intent", () => {
    const recientes = [...Array(9).fill(vacio), conTexto];
    expect(diagnosticarIntentDeContenido(recientes).faltaIntent).toBe(true);
  });

  it("una foto sin epígrafe no cuenta como mensaje vacío", () => {
    const recientes = Array(10).fill(soloFoto);
    expect(diagnosticarIntentDeContenido(recientes)).toMatchObject({
      faltaIntent: false,
      vacios: 0,
    });
  });

  it("con muy pocos mensajes no diagnostica", () => {
    expect(diagnosticarIntentDeContenido([vacio, vacio]).faltaIntent).toBe(false);
  });

  it("mira sólo los últimos 50: vacíos viejos no vuelven a disparar el aviso", () => {
    const recientes = [...Array(50).fill(conTexto), ...Array(200).fill(vacio)];
    expect(diagnosticarIntentDeContenido(recientes)).toMatchObject({
      faltaIntent: false,
      revisados: 50,
      vacios: 0,
    });
  });
});
