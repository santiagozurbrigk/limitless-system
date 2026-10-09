# ADR-004 — BYOK de Anthropic por organización, cifrada, con fallback a la clave global

- **Estado:** **Revisada el 2026-10-02 (SCRUM-7): ya no hay fallback a la clave global.** Ver "Revisión 2026-10-02" al final; el resto describe la decisión original.
- **Fecha:** 2026-06-13 — commit `f0f4b4de` "implement BYOK Claude API key with validation, routing and cache"
  (UI previa en `d8a22125`, 2026-06-11; cifrado real en `d64d5543`, 2026-06-17). Anterior a `CHANGES.md`;
  documentado en `docs/archivo/OPERATIONAL_NOTES.md` § "BYOK — API key propia de Claude". El fallback real ante
  una clave rechazada llegó el 2026-09-21 (`CHANGES.md` "Una clave de IA vencida ahora se ve dentro del producto").

## Contexto

Todas las funciones de IA (agente, análisis de llamadas, scoring, reportes, SOPs, inteligencia) llaman a Claude.
Hasta junio usaban una sola `ANTHROPIC_API_KEY` global de Limitless; sin ella, varias devolvían un mock fijo
(`docs/archivo/OPERATIONAL_NOTES.md`, `docs/archivo/PHASE2_PLAN.md`). El costo de IA de cada cliente lo pagaba
Limitless.

## Decisión

- **Cada organización puede cargar su propia clave de Anthropic** (Ajustes → IA). Se valida con una llamada de
  prueba al guardarla; una clave válida sin créditos se acepta con aviso (`valid_no_credits`,
  `20260629100000_claude_api_key_valid_no_credits.sql`).
- **Se guarda cifrada con AES-256-GCM** (`ENCRYPTION_MASTER_KEY`, fuera de la base) en
  `organizations.claude_api_key_encrypted`; sólo el servidor con service role la descifra; la UI ve los últimos 4
  caracteres.
- **Resolución:** clave de la org si su estado es `valid`/`valid_no_credits` → si no, la global → si no, "sin
  credencial" (las funciones devuelven `null`, no lanzan). Cache en memoria de 5 minutos
  (`lib/ai/credential-resolver.ts`).
- **Si Anthropic rechaza la clave de la org (401/403)**, se marca `invalid`, se muestra una barra roja no
  descartable en toda la plataforma de esa org y se reintenta con la global (`executeWithCredentialFallback` en
  `lib/ai/anthropic.ts`, desde 2026-09-21).

## Alternativas consideradas

- **Sólo clave global de Limitless**: era el estado previo. El motivo escrito para cambiar es de costo:
  `OPERATIONAL_NOTES.md` recomienda a los clientes su propio plan de Claude "para reducir costos del software" y el
  super admin muestra por org "Fuente IA: BYOK vs Limitless Key".
- **OAuth de Claude por organización**: se construyó el 2026-07-11 (commit `41cf8474` "credential resolver dual
  con fallback y OAuth env-gated", migración `20260711180000_org_ai_credentials.sql`) y se retiró el mismo día
  (`81716f38` "remover UI OAuth y conservar credential resolver API key"). **El motivo del retiro no quedó
  escrito.** Las columnas nunca llegaron a producción (`docs/arquitectura/base-de-datos.md`); queda
  `[IA-OAUTH-COLUMNAS]`.

## Consecuencias

**Positivas**
- El costo de IA de los clientes con BYOK no lo paga Limitless; una org sin clave sigue funcionando con la global.
- La clave nunca viaja al navegador ni se guarda en claro.

**Negativas / deuda**
- **El fallback prometido no existió hasta el 2026-09-21**: una clave vencida desde julio falló en silencio cada
  10 minutos (`CHANGES.md` 2026-09-21). Sigue sin fallback el agente SSE (`[AGENTE-SIN-FALLBACK-CLAVE]`), una clave
  sin créditos no cae a la global (`[IA-CLAVE-SIN-CREDITOS]`), y sin clave global en producción una org con clave
  rota queda sin IA (`[1A1-CLAVE-ANTHROPIC-ROTA]`, `[IA-CLAVES-INVALIDAS]`).
- Hasta el 2026-10-09 cualquier cuenta creada por signup público usaba la clave global (`[SIGNUP-PUBLICO]`, cerrado en SCRUM-23: el alta es sólo por invitación).
- El Batch API del super admin usa, a falta de global, **la clave de una org cliente**
  (commits `7cb646bd`, `aee2deb9` del 2026-07-18; `[IA-CLAVE-DE-CLIENTE-EN-SUPERADMIN]`).
- Perder `ENCRYPTION_MASTER_KEY` deja todas las claves irrecuperables (hay que volver a pegarlas).
- En producción `authenticated` puede leer el ciphertext de su propia org (`[DB-ORGS-SELECT-COLUMNAS]`).
- Cualquier miembro, no sólo el founder, puede cambiar la clave: `saveClaudeApiKeyAction` no mira el rol
  (`[PERMISOS-SERVER-ACTIONS]`).
- El mismo cifrado se aplicó a otros proveedores (Zernio, GHL, pagos…), pero no a todos: `[TOKENS-TEXTO-PLANO]`.

## Evidencia

- `supabase/migrations/20260615400000_byok_claude.sql`, `20260619100000_byok_real_encryption.sql`,
  `20260629100000_claude_api_key_valid_no_credits.sql`, `20260711180000_org_ai_credentials.sql`.
- `apps/web/lib/ai/{credential-resolver,anthropic,validate-claude-key}.ts`, `apps/web/lib/security/encryption.ts`,
  `apps/web/components/platform/aviso-clave-ia.tsx`.
- `docs/archivo/OPERATIONAL_NOTES.md` § BYOK y § Cifrado; `docs/areas/agente-ia.md` § "BYOK y fallback de clave".
- `CHANGES.md` 2026-09-21 "Una clave de IA vencida ahora se ve dentro del producto".

## Revisión 2026-10-02 — sin clave propia, no hay IA (SCRUM-7)

**Decisión nueva (Santiago):** una organización usa **sólo su propia clave**. No hay clave global de Limitless de
respaldo para ninguna organización.

- **Por qué:** `ANTHROPIC_API_KEY` nunca estuvo cargada en producción (el fallback era teórico) y, si alguien la
  cargaba, todas las orgs sin clave iban a gastar IA a cuenta de Limitless sin límite.
- **Resolución:** clave de la org si su estado es `valid`/`valid_no_credits` y se puede descifrar → si no, "sin
  credencial": no se llama a nadie, las funciones devuelven `null` y los procesos automáticos saltean esa org
  (`lib/ai/credential-resolver.ts`, `executeWithOrgCredential` en `lib/ai/anthropic.ts`).
- **Clave rechazada (401/403):** se marca `invalid` y se tira `AI_KEY_REJECTED_MESSAGE`; no se reintenta con otra
  clave. **Sin créditos:** se marca `valid_no_credits` (se sigue usando: cuando carga saldo vuelve sola). Lo mismo
  en el agente SSE (`registrarFallaDeClave`).
- **Aviso en toda la plataforma** (`components/platform/aviso-clave-ia.tsx`, textos en `lib/ai/aviso-clave-ia.ts`):
  sin clave → "las funciones de IA están desactivadas"; rota o ilegible → barra roja; sin créditos → aviso. El link
  a Ajustes → IA sólo lo ve el founder.
- **Trabajo de plataforma (super-admin):** usa su propia clave, cargada en Super-admin → Infraestructura y guardada
  cifrada en `platform_ai_credentials` (`lib/ai/platform-credential.ts`). Nunca usa la clave de una organización,
  y su costo se registra en `token_usage` con `organization_id` nulo.
- `ANTHROPIC_API_KEY` deja de usarse en `apps/web`. Sigue en `apps/reel-worker` (captions con Haiku).

Cierra `[1A1-CLAVE-ANTHROPIC-ROTA]`, `[IA-CLAVE-DE-CLIENTE-EN-SUPERADMIN]`, `[IA-CLAVES-INVALIDAS]`,
`[AGENTE-SIN-FALLBACK-CLAVE]`, `[IA-CLAVE-SIN-CREDITOS]`, `[BYOK-DESCIFRADO-SILENCIOSO]` y `[ENV-ANTHROPIC-VERCEL]`.
