import { describe, expect, it, vi } from "vitest";
import { assertOrgStoragePath, isOrgStoragePath, soloRutasDeLaOrg } from "../org-path";
import { isOrgStoragePath as isOrgStoragePathWorker } from "../../../../reel-worker/src/org-path";

const ORG = "0000000a-0000-0000-0000-000000000000";
const OTRA = "0000000b-0000-0000-0000-000000000000";

describe("isOrgStoragePath", () => {
  it("acepta rutas dentro de la carpeta de la org", () => {
    expect(isOrgStoragePath(`${ORG}/doc-1-archivo.pdf`, ORG)).toBe(true);
    expect(isOrgStoragePath(`${ORG}/drafts/d1/a-b.png`, ORG)).toBe(true);
  });

  it("rechaza rutas de otra org, con .. o vacías", () => {
    expect(isOrgStoragePath(`${OTRA}/doc.pdf`, ORG)).toBe(false);
    expect(isOrgStoragePath(`${ORG}/../${OTRA}/doc.pdf`, ORG)).toBe(false);
    expect(isOrgStoragePath(`${ORG}//doc.pdf`, ORG)).toBe(false);
    expect(isOrgStoragePath(`${ORG}/`, ORG)).toBe(false);
    expect(isOrgStoragePath(`${ORG}x/doc.pdf`, ORG)).toBe(false);
    expect(isOrgStoragePath(undefined, ORG)).toBe(false);
  });

  it("assert tira con una ruta ajena", () => {
    expect(() => assertOrgStoragePath(`${OTRA}/doc.pdf`, ORG)).toThrow();
    expect(assertOrgStoragePath(`${ORG}/doc.pdf`, ORG)).toBe(`${ORG}/doc.pdf`);
  });
});

describe("soloRutasDeLaOrg (SCRUM-81)", () => {
  it("⭐ deja sólo las rutas de la org y descarta ajenas, vacías y con ..", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      soloRutasDeLaOrg(
        [`${ORG}/a.pdf`, `${OTRA}/b.pdf`, null, "", `${ORG}/../${OTRA}/c.pdf`, `${ORG}/./d.pdf`, `${ORG}/e/f.png`],
        ORG,
        "test"
      )
    ).toEqual([`${ORG}/a.pdf`, `${ORG}/e/f.png`]);
    expect(aviso).toHaveBeenCalledTimes(3);
  });
});

describe("el worker de reels usa la misma regla (SCRUM-81)", () => {
  it("⭐ coincide con la web en todos los casos", () => {
    const casos: unknown[] = [
      `${ORG}/music/background.mp3`,
      `${OTRA}/music/background.mp3`,
      `${ORG}/../${OTRA}/music/background.mp3`,
      `${ORG}//x.mp4`,
      `${ORG}/`,
      `${ORG}x/a.mp4`,
      `${ORG}/./a.mp4`,
      "",
      null,
      42,
    ];
    for (const caso of casos) {
      expect(isOrgStoragePathWorker(caso, ORG)).toBe(isOrgStoragePath(caso, ORG));
    }
  });
});
