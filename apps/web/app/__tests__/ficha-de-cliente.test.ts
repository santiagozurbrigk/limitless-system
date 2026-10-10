/**
 * SCRUM-108: abrir `/clients/<id>` de un cliente inexistente o de otra
 * organización mostraba "Application error" (error #310 de React), porque la
 * página era un client component que llamaba a `notFound()` en el navegador.
 * Ahora la página resuelve la existencia en el servidor y la ficha del
 * navegador nunca llama a `notFound()`.
 */

import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@/types/clients";

const sim = vi.hoisted(() => ({
  existe: true,
  pedidos: [] as string[],
  clientes: [] as Array<{ id: string }>,
  cargando: false,
}));

vi.mock("@/lib/clients/cliente-visible", () => ({
  clienteVisibleExiste: async (id: string) => {
    sim.pedidos.push(id);
    return sim.existe;
  },
}));
vi.mock("@/providers", () => ({
  usePlatformData: () => ({ clients: sim.clientes, clientsLoading: sim.cargando }),
}));
vi.mock("@/components/clients", () => ({
  ClientDetail: ({ client }: { client: Client }) => createElement("p", null, `Ficha de ${client.id}`),
}));

import ClientDetailPage from "../(platform)/clients/[id]/page";
import { FichaDelCliente } from "../(platform)/clients/[id]/ficha-del-cliente";

const ID = "33333333-3333-4333-8333-333333333333";

async function pagina(id: string) {
  return ClientDetailPage({ params: Promise.resolve({ id }) });
}

beforeEach(() => {
  sim.existe = true;
  sim.pedidos = [];
  sim.clientes = [];
  sim.cargando = false;
});

describe("la página /clients/[id] (servidor)", () => {
  it("⭐ un cliente que no existe o es de otra org → notFound() en el servidor", async () => {
    sim.existe = false;
    await expect(pagina(ID)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(sim.pedidos).toEqual([ID]);
  });

  it("un cliente visible → dibuja la ficha con su id", async () => {
    const arbol = await pagina(ID);
    expect(isValidElement(arbol)).toBe(true);
    expect((arbol as ReactElement<{ id: string }>).type).toBe(FichaDelCliente);
    expect((arbol as ReactElement<{ id: string }>).props.id).toBe(ID);
  });
});

describe("la ficha del navegador", () => {
  const dibujar = () => renderToStaticMarkup(createElement(FichaDelCliente, { id: ID }));

  it("con el cliente en la lista muestra la ficha", () => {
    sim.clientes = [{ id: ID }];
    expect(dibujar()).toContain(`Ficha de ${ID}`);
  });

  it("mientras carga la lista avisa que está cargando", () => {
    sim.cargando = true;
    expect(dibujar()).toContain("Cargando cliente");
  });

  it("⭐ si el cliente no está en la lista no llama a notFound(): muestra un aviso con la vuelta a Clientes", () => {
    const html = dibujar();
    expect(html).toContain("No pudimos mostrar este cliente");
    expect(html).toContain('href="/clients"');
  });
});
