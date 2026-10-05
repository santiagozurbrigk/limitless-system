/**
 * Parser de Excel para importación de clientes.
 * Soporta:
 *   - Plantilla Limitless (tab "Clientes" con columnas fijas)
 *   - Archivo propio del usuario (cualquier columna, mapeo manual)
 *
 * Dependencia: xlsx (SheetJS) — ya instalado en apps/web.
 */

import * as XLSX from "xlsx";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ClientImportRow = {
  name: string;
  email?: string;
  phone?: string;
  status: "active" | "pending_onboarding" | "success_case";
  product?: string;
  totalAmount: number;
  joinDate: string;   // YYYY-MM-DD
  notes?: string;
};

export type ColumnMapping = {
  name: string;
  email?: string;
  phone?: string;
  status?: string;
  product?: string;
  totalAmount?: string;
  joinDate?: string;
  notes?: string;
};

export type ParseExcelResult = {
  headers: string[];
  rows: ClientImportRow[];
  errors: Array<{ row: number; message: string }>;
};

// ─── Columnas de la plantilla Limitless ────────────────────────────────────────────

const CLIENT_TEMPLATE_COLUMNS: ColumnMapping = {
  name:        "Nombre",
  email:       "Email",
  phone:       "Teléfono",
  status:      "Estado",
  product:     "Producto / Plan",
  totalAmount: "Monto total",
  joinDate:    "Fecha inicio",
  notes:       "Notas",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h.toString().trim().toLowerCase();
}

function resolveStatus(raw: string | undefined): ClientImportRow["status"] {
  const v = (raw ?? "").toLowerCase().trim();
  if (v === "activo" || v === "active") return "active";
  if (v === "onboarding" || v === "pending_onboarding") return "pending_onboarding";
  if (v === "caso de éxito" || v === "success_case" || v === "exito") return "success_case";
  return "active"; // default
}

function resolveAmount(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  const n = Number(String(raw).replace(/[^\d.,]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/** La fecha de una celda (`YYYY-MM-DD`). Vacía o que no se entiende: `hoy`. */
function resolveDate(raw: unknown, hoy: string): string {
  if (!raw) return hoy;
  // Excel dates can be serial numbers or strings
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) {
      const month = String(d.m).padStart(2, "0");
      const day   = String(d.d).padStart(2, "0");
      return `${d.y}-${month}-${day}`;
    }
  }
  const s = String(raw).trim();
  // DD/MM/AAAA
  const dmatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmatch) {
    const [, d, m, y] = dmatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return hoy;
}

// ─── Parse con mapeo de columnas ─────────────────────────────────────────────

/**
 * `hoy` (`YYYY-MM-DD`, el de la organización) es la fecha de alta de las filas
 * sin fecha o con una que no se entiende. Lo arma quien llama: el servidor
 * corre en UTC y de noche en Argentina su día ya es mañana (SCRUM-493).
 */
export function parseClientsExcel(
  buffer: Buffer | ArrayBuffer,
  hoy: string,
  columnMapping?: ColumnMapping,
  sheetName?: string
): ParseExcelResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });

  // Usar la hoja indicada si viene del wizard (la misma que se previsualizó).
  // Si no, buscar "clientes" o usar la primera hoja.
  const resolvedSheetName = sheetName
    ? (wb.SheetNames.find((n) => n === sheetName) ?? wb.SheetNames[0])
    : (wb.SheetNames.find((n) => n.toLowerCase().includes("clientes")) ?? wb.SheetNames[0]);

  if (!resolvedSheetName) {
    return { headers: [], rows: [], errors: [{ row: 0, message: "Archivo sin hojas." }] };
  }

  const sheet = wb.Sheets[resolvedSheetName];

  // Usar { header: 1 } para obtener arrays crudos y poder saltar filas de título
  // (igual que getExcelPreviewAction — evita que celdas merged en fila 1 sean tomadas como headers).
  const rawArrays = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });

  if (!rawArrays.length) {
    return { headers: [], rows: [], errors: [{ row: 0, message: "Hoja sin datos." }] };
  }

  // Primera fila con ≥2 celdas no vacías = fila real de encabezados
  const headerRowIdx = rawArrays.findIndex(
    (row) => (row as unknown[]).filter((v) => String(v ?? "").trim()).length >= 2
  );
  if (headerRowIdx === -1) {
    return { headers: [], rows: [], errors: [{ row: 0, message: "No se encontró fila de encabezados." }] };
  }

  const headerRow = (rawArrays[headerRowIdx] as unknown[]).map((v) => String(v ?? "").trim());
  const dataArrays = rawArrays.slice(headerRowIdx + 1);

  // Convertir arrays de datos a objetos keyed por header
  const raw: Record<string, unknown>[] = dataArrays.map((arr) => {
    const obj: Record<string, unknown> = {};
    (arr as unknown[]).forEach((val, i) => {
      const h = headerRow[i];
      if (h) obj[h] = val;
    });
    return obj;
  });

  if (!raw.length) {
    return { headers: [], rows: [], errors: [{ row: 0, message: "Hoja sin filas de datos." }] };
  }

  // Extraer headers reales del archivo
  const headers = headerRow.filter(Boolean);

  // Usar plantilla Limitless si no hay mapping manual
  const mapping: ColumnMapping = columnMapping ?? CLIENT_TEMPLATE_COLUMNS;

  // Construir mapa header normalizado → key de mapping
  const headersByNorm: Record<string, string> = {};
  for (const h of headers) headersByNorm[normalizeHeader(h)] = h;

  function findColumn(label: string | undefined): string | undefined {
    if (!label) return undefined;
    return headersByNorm[normalizeHeader(label)];
  }

  const nameCol        = findColumn(mapping.name);
  const emailCol       = findColumn(mapping.email);
  const phoneCol       = findColumn(mapping.phone);
  const statusCol      = findColumn(mapping.status);
  const productCol     = findColumn(mapping.product);
  const amountCol      = findColumn(mapping.totalAmount);
  const joinDateCol    = findColumn(mapping.joinDate);
  const notesCol       = findColumn(mapping.notes);

  const rows: ClientImportRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  raw.forEach((r, idx) => {
    const rowNum = idx + 2; // 1-indexed + header row

    // Ignorar filas completamente vacías (Excel puede tener formato/estilos
    // aplicados más allá de los datos reales, haciendo que SheetJS las incluya
    // dentro del bounding box de la hoja con todos los valores en "").
    const allEmpty = Object.values(r).every((v) => !String(v ?? "").trim());
    if (allEmpty) return;

    const name = nameCol ? String(r[nameCol] ?? "").trim() : "";
    if (!name) {
      errors.push({ row: rowNum, message: "Nombre vacío — fila omitida." });
      return;
    }

    rows.push({
      name,
      email:       emailCol     ? String(r[emailCol] ?? "").trim()   || undefined : undefined,
      phone:       phoneCol     ? String(r[phoneCol] ?? "").trim()   || undefined : undefined,
      status:      resolveStatus(statusCol ? String(r[statusCol]) : undefined),
      product:     productCol   ? String(r[productCol] ?? "").trim() || undefined : undefined,
      totalAmount: resolveAmount(amountCol ? r[amountCol] : undefined),
      joinDate:    resolveDate(joinDateCol ? r[joinDateCol] : undefined, hoy),
      notes:       notesCol     ? String(r[notesCol] ?? "").trim()   || undefined : undefined,
    });
  });

  return { headers, rows, errors };
}
