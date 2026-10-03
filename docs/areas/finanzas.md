# Finanzas

> Verificado contra el código el 2026-09-23 (commit 038caca). Backlog del área: `PENDIENTES.md` § Operaciones, Finanzas y Producto.

## Qué es

La vista de **plata del negocio del founder**: cuánto se facturó y se cobró en un período, qué queda por cobrar,
cuánto cuesta operar (gastos fijos, suscripciones, equipo) y el margen que queda. La usan el founder y quien
tenga el módulo `finance`.

**Qué NO hace:** no registra cobros. Los pagos de clientes se cargan en **Ventas → Cobros** (`client_payments`,
`app/sales/payment-actions.ts`) y Finanzas sólo los lee. No convierte monedas. Stripe y Mercado Pago están
**conectables pero no se usan**: nada de lo que muestran las pantallas sale de esas APIs.

## Pantallas y rutas

Rutas en `paths.platform.finance`. Bloqueo por módulo `finance` en `app/(platform)/layout.tsx`.
Las dos páginas son un Server Component vacío que monta un Client Component; **todo el dato se trae y se
calcula en el navegador** a través de `providers/finance-data-provider.tsx` + `providers/platform-data-provider.tsx`.

| Ruta | Archivo | Qué muestra | Datos |
|---|---|---|---|
| `/finance` | `app/(platform)/finance/page.tsx` → `components/finance/finance-overview.tsx` | KPIs (Facturación con filtro de período, Cash collected, Margen vs. objetivo 60%, Por cobrar), gastos del período, ingresos por plataforma y facturación por tipo de pago (`finance-metrics.tsx`, `finance-charts.tsx`). Empty state si no hay plataformas, gastos ni clientes | Reales. Fallback a métricas importadas de Excel (ver reglas). Mock sólo sin Supabase |
| `/finance/expenses` | `app/(platform)/finance/expenses/page.tsx` → `components/expenses/expenses-overview.tsx` | Liquidación del mes (`components/finance/team-payroll-section.tsx`), Gastos fijos, Suscripciones, Gastos de equipo (compensación por miembro) | Reales. Mock sólo sin Supabase |
| Configuración → Pagos | `components/settings/payment-platforms-settings-section.tsx` | CRUD de plataformas de cobro (`payment_platforms`) | Reales |

Navegación: grupo "Finanzas" (Overview, Gastos) en `lib/navigation/sidebar-modules.ts`, siempre visible si el
rol tiene el módulo.

## Modelo de datos

Migración base: `supabase/migrations/20260521800000_finance_expenses.sql`.

| Tabla | Columnas clave | Notas |
|---|---|---|
| `payment_platforms` | `name`, `slug` (único por org si no es null), `currency`, `account_label` | Destino de cobro. `client_payments.payment_destination_platform_id` apunta acá (`20260716100000_client_payment_tracking`) |
| `fixed_expenses` | `name`, `category` (`infrastructure/professional/marketing/tools/other`), `amount`, `currency`, `frequency` (`monthly/annual`), `status` (`active/paused`) | |
| `subscriptions` | `name`, `amount`, `currency`, `billing_cycle` (`monthly/annual`), `status`, `icon` | Sólo se leen las `active` |
| `team_compensation` | `member_id` (**text**, no FK), `member_name`, `role_label`, `has_fixed_salary`, `fixed_amount`, `has_commission`, `commission_basis`, `commission_percentage`, `commission_fixed_per_event`, `estimated_this_month` | `commission_basis`: `per_deal`, `monthly_revenue`, `upsells`, `per_booking`, `custom` (sin CHECK en la base) |
| `stripe_integrations` | `stripe_account_id`, `access_token` (**texto plano**), `livemode`, `status` | Sin policies de lectura; sólo service role. 0 filas en producción (al 2026-09-23) |
| `mercadopago_integrations` | `mp_user_id`, `access_token_encrypted`, `refresh_token_encrypted` (AES-256-GCM, `lib/security/encryption`), `token_expires_at`, `status` | 0 filas en producción (al 2026-09-23) |

**RLS:** las cuatro tablas de configuración filtran sólo por `organization_id = get_my_organization_id()`
(update con `WITH CHECK` desde `20260620200000`). Ninguna mira el rol.

Además lee (no escribe): `clients`, `client_payments`, `closing_calls`, `conversations`, `metrics_snapshots`.

## Cómo fluye el dato

```
FinanceDataProvider (cliente)
  loadFinanceConfigAction ─────────── fixed_expenses, subscriptions(active), team_compensation, payment_platforms
                                      + totales por plataforma sumando listOrganizationPaymentsAction()
  usePlatformData ─────────────────── clients, closingCalls
  listOrganizationPaymentsAction ──── clientPayments (client_payments)
  getSalesMetricsSnapshotsAction ──── último metrics_snapshots (Excel importado) como "baseline"
        │
        ├─ computeExpensesSummary (lib/metrics/compute-expenses-summary.ts)
        ├─ enrichTeamCompensationWithCommissions (lib/metrics/enrich-team-compensation.ts)
        ├─ deriveFinanceSummary  (lib/metrics/derive-finance-summary.ts) → KPIs
        └─ deriveMonthlySeries   (lib/metrics/derive-monthly-series.ts)  → gráficos
```

- **Mutaciones** (`app/finance/actions.ts`): `create/update/delete` de gastos fijos, suscripciones,
  compensación y plataformas. Todas con `requireOrganizationId()` y cliente de usuario (RLS).
  Sólo las de **plataformas** exigen `role === 'founder'` (`requireFounderRole`).
- **Liquidación del mes** (`computeTeamPayrollAction`): calcula en el servidor, por miembro, fijo + comisión
  según `commission_basis`:

| Base | Cálculo |
|---|---|
| `per_deal` | % sobre `closing_calls.outcome.revenue` de las llamadas `closed` del mes cuyo closer matchea al miembro (`lib/metrics/match-closer.ts`) |
| `monthly_revenue` | % sobre la suma de `clients.total_amount` de clientes `active` (lo llama "MRR") |
| `upsells` | % sobre `total_amount` de clientes con `join_date` en el mes |
| `per_booking` | `commission_fixed_per_event` × **todas** las `conversations` `booked` del mes de la org |
| `custom` | `max(0, estimated_this_month − fijo)`, con la columna de la base: se crea en 0 y ninguna pantalla la escribe, así que da 0 |

- **Stripe / Mercado Pago:** OAuth con cookie de `state` (MP con PKCE) en
  `app/api/integrations/{stripe,mercadopago}/{connect,callback,disconnect}/route.ts`. Las actions de lectura
  (`app/stripe/actions.ts`, `app/mercadopago/actions.ts`: balance, transacciones, detalle) **no tienen ningún
  consumidor en la UI**.
- **Cron** `/api/cron/mercadopago-token-refresh` (`0 4 * * *`, `assertCronAuthorized`): refresca todos los tokens
  de MP con refresh token (`refreshAllMercadoPagoTokens`). `getActiveMercadoPagoCredentials` también refresca
  on-demand si vence pronto.
- **Webhook** `/api/webhooks/mercadopago`: rate limit por IP, 503 sin `MERCADOPAGO_WEBHOOK_SECRET`, firma HMAC
  `x-signature` sobre `id:{data.id};request-id:{x-request-id};ts:{ts};`. En desautorización marca la
  integración `disconnected`. En `payment` **sólo** actualiza `last_sync_at`; no guarda el pago.

## Integraciones externas

| Proveedor | Estado | Cliente | Sin conectar |
|---|---|---|---|
| Stripe Connect (`read_only`) | `listed: false` en `lib/integrations/registry.ts`: conectable por URL, no se ofrece | `lib/stripe/{config,api}.ts` | Nada cambia en Finanzas |
| Mercado Pago OAuth | `listed: false`, misma razón ("los cobros pasan por Whop y Commas") | `lib/mercadopago/{config,pkce,tokens,api,webhook-verify}.ts` | Nada cambia en Finanzas |

El registro declara para ambos `dataFlows: lands "payments", transport "webhook"`, pero **ningún código escribe
pagos desde Stripe o MP** y Stripe no tiene webhook. Whop y Commas (área Embudos/Pagos) tampoco alimentan
Finanzas: escriben en `payment_transactions`, que este módulo no lee.

## Reglas de negocio y decisiones no obvias

- ⭐ **Facturación y cash collected salen de Clientes/Cobros**, no de las pasarelas. Si un cobro no está cargado
  en `client_payments`, para Finanzas no existió.
- **Fallback a baseline:** si la facturación en vivo es 0 y hay un `metrics_snapshots` importado, los KPIs usan
  el snapshot. Si el snapshot no trae `cash_collected`, se **estima** como `facturación − gastos`
  (`finance-data-provider.tsx`), y la serie mensual pinta el último mes con `max(0, facturación − gastos)`
  **siempre** (aunque el snapshot traiga `cash_collected`). Es un número
  derivado presentado como dato; ver `[FINANZAS-BASELINE-CASH-ESTIMADO]`.
- **Monedas:** cada gasto y plataforma guarda su `currency`, pero las sumas no convierten. `formatMoney`
  (`lib/finance/format.ts`) sólo formatea.
- **Dos cálculos de comisión:** "Gastos de equipo" usa `enrichTeamCompensationWithCommissions` (sólo cuenta
  `per_deal`/`custom`/sin base, sobre llamadas cerradas del mes); la "Liquidación" usa `computeTeamPayrollAction`
  (las cinco bases). Comparten `matchesCloser` para `per_deal`, pero para `monthly_revenue`, `upsells` y
  `per_booking` las dos pantallas dan números distintos.
- **Meses en el reloj del servidor/navegador:** la liquidación arma el mes con `new Date(y, m, 1)` en el server
  (UTC en Vercel), no en ART.
- **`team_compensation.member_id` es texto libre**, no FK a `profiles`: el vínculo con el miembro real es por nombre.
- Sólo el founder gestiona plataformas de pago; gastos, suscripciones y compensación los edita cualquiera que
  llegue a la pantalla (o a la action).

## Limitaciones conocidas y deuda

- **Permisos sólo en el render**: cualquier miembro puede invocar las actions de gastos/compensación y escribir
  las tablas por PostgREST; el nivel `view` no impide editar `[PERMISOS-SERVER-ACTIONS]`.
- **Token de Stripe en texto plano** `[FIN-STRIPE-MP-DECIDIR]` (auditoría §3.2).
- **Webhook de MP:** un `payment` de cualquier cuenta actualiza `last_sync_at` de **todas** las integraciones
  activas de todas las orgs; no valida `ts` (replay) `[FIN-MP-WEBHOOK]`.
- **Código muerto de Stripe/MP** (actions de lectura, `deriveMercadoPagoBalance` que suma los últimos 100 pagos
  y lo llama "balance") `[FIN-STRIPE-MP-DECIDIR]`.
- **`per_booking` no es por setter** y `monthly_revenue` usa `total_amount` (valor del contrato) como MRR `[FIN-PAYROLL-BASES]`.
- **Monedas mezcladas**: los totales suman USD y ARS sin convertir `[FIN-MONEDAS]` (misma familia que `[FACTURACION-MONEDAS]`, de Clientes).
- **Mes de la liquidación en UTC** `[FIN-MESES-UTC]`.
- **Sin timeouts** en `lib/stripe` y `lib/mercadopago` `[AUD-CONF-1]`.
- `components/finance/payment-platforms-section.tsx` es huérfano (lo reemplazó el de Configuración).

## Tests

| Archivo | Cubre |
|---|---|
| `lib/metrics/__tests__/match-closer.test.ts` | Qué closer se lleva cada llamada (usado por las dos comisiones) |
| `lib/metrics/__tests__/derive-finance-summary.test.ts` | Resumen de Finanzas: facturación, gastos, margen, por cobrar y por mes, saldo por plataforma, desglose por closer (SCRUM-101) |
| `lib/metrics/__tests__/derive-monthly-series.test.ts` | Serie de los últimos 6 meses, en varias zonas horarias (SCRUM-101) |
| `lib/metrics/__tests__/revenue-period.test.ts` y `revenue-events.test.ts` | Períodos, prorrateo de gastos y en qué fecha cuenta cada cobro (SCRUM-102) |

Sin tests: `compute-expenses-summary.ts`, `enrich-team-compensation.ts`, `computeTeamPayrollAction`,
`lib/mercadopago/*` (incluida la verificación de firma), `lib/stripe/*`. No hay e2e.

## Archivos clave

- `apps/web/providers/finance-data-provider.tsx` — de dónde sale cada número de la pantalla
- `apps/web/app/finance/actions.ts` — CRUD de configuración y liquidación
- `apps/web/lib/metrics/derive-finance-summary.ts`, `derive-monthly-series.ts`, `compute-expenses-summary.ts`
- `apps/web/lib/metrics/enrich-team-compensation.ts`, `apps/web/lib/metrics/match-closer.ts`
- `apps/web/components/finance/finance-metrics.tsx`, `apps/web/components/expenses/expenses-overview.tsx`
- `apps/web/components/settings/payment-platforms-settings-section.tsx`
- `apps/web/lib/expenses/mapper.ts` — fila ↔ tipo de dominio
- `apps/web/app/api/webhooks/mercadopago/route.ts`, `apps/web/lib/mercadopago/tokens.ts`
- `apps/web/app/api/integrations/stripe/callback/route.ts`
- `supabase/migrations/20260521800000_finance_expenses.sql`

## Lo que ya no existe

- **Secciones de Stripe y Mercado Pago dentro de `/finance`** (`stripe-section.tsx`, `mercadopago-section.tsx`):
  borradas.
