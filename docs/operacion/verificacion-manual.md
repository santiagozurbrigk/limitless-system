# Verificación manual — qué probar a mano, por área

> Reescrito el 2026-09-23 a partir de `docs/archivo/PLAN_VERIFICACION.md` (archivado en `docs/archivo/`) y de la
> auditoría de ese día. Sólo quedan los bloques **todavía abiertos**: lo que ya no aplica o ya se probó
> está listado en [`docs/historial/auditoria-docs-2026-09-23.md`](../historial/auditoria-docs-2026-09-23.md).

**Cómo se usa.** Cada bloque dice prerrequisitos, pasos y resultado esperado. Marcas:
⚠️ alta probabilidad de falla · 🔒 verifica seguridad · ⭐ verifica una regla central de diseño.
Cuando un bloque pasa, borralo de acá y anotalo en `CHANGES.md`; si falla, abrí o actualizá el ítem en
`PENDIENTES.md`. **Si construís algo que no podés probar** (falta cuenta, credencial o documentación),
sumá su bloque en la sección de su área con el mismo formato.

| Área | Bloques |
|---|---|
| [Plataforma](#plataforma) | 12 |
| [Clientes](#clientes) | 14 |
| [Ventas](#ventas) | 11 |
| [Marketing](#marketing) | 14 |
| [Embudos y Lanzamientos](#embudos-y-lanzamientos) | 11 |
| [Agente de negocio e IA](#agente-de-negocio-e-ia) | 12 |
| [Operaciones, Finanzas y Producto](#operaciones-finanzas-y-producto) | 8 |
| [Infraestructura](#infraestructura) | 14 |

---

## Plataforma

> Condensado de `docs/archivo/PLAN_VERIFICACION.md` (§13, Permisos por módulo, Bajas, Perfil del bot de Discord)
> y de lo que surgió al auditar el código el 2026-09-23 (commit 038caca).
> Marcas: ⚠️ alta probabilidad de falla · 🔒 verifica seguridad · ⭐ verifica una regla central.

---

### 1. Permisos por módulo con un rol limitado 🔒⭐ — `[PERMISOS-VERIFICAR-SESION]`

**Prerrequisitos:** una org de prueba con founder; una segunda cuenta invitada (`role = 'member'`).

1. Con el founder, abrir Equipo → Roles con un rol creado antes del 2026-09-06. Resultado: los permisos se ven agrupados en 13 módulos.
2. Crear un rol con Finanzas en "Sin acceso" y asignarlo al member. Resultado: en su sesión Finanzas no aparece en la notch nav.
3. 🔒⭐ Con el member, tipear `/finance` en la barra. Resultado: "No tenés acceso a Finanzas".
4. 🔒 Probar `/finance/expenses` y `/team/roles` (con Equipo en "Sin acceso"). Resultado: bloqueadas igual.
5. ⚠️🔒 Estando en `/dashboard`, abrir ⌘K y elegir Finanzas (navegación cliente). Resultado esperado: bloqueado. **Probable falla**: el chequeo vive en el layout, que no se re-renderiza en navegación cliente, y la paleta no filtra permisos (`[PERMISOS-LAYOUT-NAV-SUAVE]`, `[NAV-PALETA-PERMISOS]`).
6. 🔒 Con el member sin Operaciones, tipear `/founder`. Resultado: "No tenés acceso a Operaciones", dentro del marco de la plataforma. Con el founder y con un member que tenga Operaciones, `/founder` muestra el Área del fundador (también sin resumen todavía: el estado vacío no da error). Desde SCRUM-18 `/founder` vive en `app/(platform)` y los tests lo cubren; este paso lo confirma con cuentas reales.
7. ⭐ Invitar a alguien sin rol y entrar. Resultado: puede abrir pantallas por URL (el bloqueo no corre sin rol). Anotar si la notch nav aparece vacía (`[PERMISOS-SIN-ROL-NAV]`).
8. Con el rol limitado, entrar a `/onboarding` y `/holding`. Resultado: entra (rutas libres).
9. ⚠️🔒 Desde la consola del navegador del member, invocar una Server Action de Finanzas o `saveClaudeApiKeyAction`. Resultado hoy: **responde** (`[PERMISOS-SERVER-ACTIONS]`). Sirve de línea base para cuando se agregue el guard.
10. 🔒 Con el member, `PATCH /rest/v1/team_roles?id=eq.<su rol>` con `permissions` en `full` usando su JWT. Resultado hoy: **se acepta** (RLS sin rol). Línea base del mismo ítem.

**Si falla 3 o 4:** revisar `x-pathname` en el middleware y `permissionModuleForPath`.

---

### 2. Onboarding del founder — gate ⭐ — `[ONBOARDING-VERIFICAR]`

**Prerrequisitos:** super admin; `NEXT_PUBLIC_APP_URL` de prod o preview con Supabase.

1. ⭐ Crear una cuenta founder desde Super Admin → Organizaciones → Nueva y entrar. Resultado: **primero** pide cambiar la contraseña, **después** cae en `/onboarding` (sin `ERR_TOO_MANY_REDIRECTS`).
2. ⚠️ El paso 1 debería llegar con moneda y zona horaria sin elegir (la migración `20260831130000` sacó los defaults). **Probable falla**: `getOnboardingGateDefaultsAction` rellena el null con USD y Buenos Aires y los selects no tienen opción vacía, así que llegan preseleccionados (`[ONBOARDING-GATE-DEFAULTS-PRESELECCIONADOS]`).
3. Navegar a `/dashboard` desde el gate. Resultado: vuelve al gate.
4. El gate se muestra sin notch nav.
5. Completar los tres pasos. Resultado: redirige al panel y la animación de bienvenida corre una sola vez.
6. Volver a `/onboarding` a mano. Resultado: redirige al panel.
7. ⭐ Entrar con una cuenta invitada de una org sin oferta. Resultado: entra al panel sin gate.
8. Entrar con una cuenta holding. Resultado: `/onboarding/holding` o `/holding`.
9. Con una org con `skip_onboarding = true` (hoy sólo por SQL, `[ONBOARDING-SKIP-SIN-UI]`). Resultado: entra directo.
10. Salir a mitad del gate y volver. Resultado: retoma en el primer paso sin cumplir.
11. ⚠️ Con el gate abierto, que el agente u otra ruta `/api/` responda. Resultado: no hay redirect a HTML.

### 3. Onboarding — checklist, derivación y cache ⭐ — `[ONBOARDING-VERIFICAR]`

1. Entrar al panel con ítems abiertos. Resultado: tarjeta arriba con progreso y links; contador en la isla derecha.
2. ⭐ Con una org sin actividad (panel en empty state). Resultado: la tarjeta se ve igual.
3. Ocultar un ítem con la X. Resultado: desaparece y sigue oculto al recargar. Ocultar todos: tarjeta y contador desaparecen.
4. ⭐ Con una org que ya tenía oferta y avatar antes del gate. Resultado: ítems cumplidos sin pasar por el wizard.
5. ⭐ Borrar la oferta principal de una org que ya cruzó el gate. Resultado: el ítem se reabre y no la expulsa.
6. Conectar un proveedor por API key (Zernio, GHL, Fathom o pagos — no OAuth desde preview, ver nota). Resultado: `data_source` cumplido en la siguiente carga (≤ 60 s).
7. ⚠️ Desconectar ese proveedor. Resultado: el ítem se reabre. Nunca observado: ninguna org tenía una integración desconectada.
8. ⭐ Entrar con una cuenta invitada. Resultado: ni tarjeta ni contador.
9. ⚠️ Medir la carga del panel de un founder (≈8 counts por request, cache de 60 s por instancia).
10. 🔒 Confirmar que `onboarding_connected_source_count` y `onboarding_org_progress` tienen execute sólo para `service_role`.

**Nota:** OAuth no se prueba desde un preview: las redirect URIs son fijas a producción y la cookie de estado queda en el dominio del preview.

### 4. Onboarding — tours y panel de super admin — `[ONBOARDING-VERIFICAR]`

1. ⭐ Entrar por primera vez a `/funnels`. Resultado: tour de 2 pasos; terminado o cerrado con X/Escape no vuelve.
2. ⭐ Abrir `/funnels`, navegar a otro módulo sin cerrar el tour y volver. Resultado: vuelve a aparecer.
3. Repetir en `/marketing/content`, `/agent`, `/sales/inbox`.
4. ⭐ `/funnels` sin embudos. Resultado: corre sólo con el paso que tiene ancla.
5. Member en un módulo que puede ver: el tour corre; sin permiso: no se ofrece.
6. Popover en tema claro (sólo se verificó en oscuro).
7. ⚠️ Mobile en `/sales/inbox`: las anclas son columnas de escritorio; el tour no debería correr.
8. Super Admin → Onboarding: lista ordenada; una cuenta nueva sin gate aparece primera; a los 3 días dice "Trabada…"; holdings y `skip_onboarding` al final sin barra; el progreso coincide con el panel del cliente.

---

### 5. Bajas del super admin 🔒⭐ ⚠️ — `[BAJAS-SIN-PROBAR]`

**Prerrequisitos:** una org descartable con datos y archivos; acceso a Storage y a `super_admin_deletions`.

1. Abrir el diálogo de baja. Resultado: muestra personas, clientes y archivos antes de habilitar nada (si da cero con datos, el conteo falla).
2. 🔒⭐ Escribir el nombre mal. Resultado: botón deshabilitado.
3. 🔒 Invocar `deleteOrganizationAction` con confirmación incorrecta desde la consola. Resultado: falla en el servidor.
4. ⚠️⭐ Dar de baja y **después intentar entrar con el email de su founder**. Resultado: no entra.
5. Buscar en Storage los archivos de la org (comprobantes, adjuntos). Resultado: no quedan.
6. ⭐ Consultar `super_admin_deletions`. Resultado: fila con ejecutor, alcance y `problemas` vacío.
7. 🔒 Intentar borrar la propia organización (UI y action directa). Resultado: bloqueado con motivo.
8. ⭐ Baja de un holding con negocios. Resultado: avisa que los negocios no se borran y quedan como orgs sueltas.
9. Baja del único founder de una org. Resultado: avisa y deja hacerlo.
10. ⭐ Forzar una falla a mitad (bucket sin permisos). Resultado: "la baja quedó a medias" con el detalle; nunca "listo".

**Si el founder entra después de la baja sin que figure ningún problema:** bug del reporte, más grave que el fallo.

---

### 6. Holding — negocio activo y JWT 🔒⚠️

**Prerrequisitos:** cuenta holding con ≥ 2 negocios; `E2E_HOLDING_*` si se corre `e2e/holding.spec.ts`.

1. ⚠️ Confirmar en Supabase → Authentication → Hooks que `custom_access_token_hook` está activo (la migración no lo activa).
2. Entrar a un negocio desde `/holding`. Resultado: banner "viendo como founder", datos del negocio, cookie `limitless_active_org` httpOnly.
3. 🔒 Con PostgREST y el JWT de esa sesión, leer `clients`. Resultado: filas del negocio, no del holding (prueba que el claim llegó).
4. Salir a la vista del holding. Resultado: cookie borrada, `holding_active_sessions` sin fila, `/holding`.
5. 🔒 Con un miembro del holding que no es founder ni `is_holding_admin`, setear a mano la cookie a un negocio. Resultado esperado: sigue viendo el holding. **Probable falla** (`[HOLDING-PORTFOLIO-ROL]`).
6. Con add-ons distintos en holding y negocio, entrar al negocio. Anotar si la nav muestra los del holding (`[ADDONS-HOLDING]`).

### 7. Auth — callback, signup y rate limit 🔒

1. ⚠️🔒 Abrir `/auth/callback?code=<válido>&next=.example.com` (o `next=@example.com`) tras un login OAuth/magic link. Resultado esperado: queda en la app. **Probable falla**: redirige a otro host (`[AUTH-CALLBACK-NEXT]`).
2. `/login` no muestra "Crear cuenta" (SCRUM-23, 2026-10-09) y `GET https://nrzlylzbmsuowzhpdnjl.supabase.co/auth/v1/settings` (con la anon key) devuelve `disable_signup: true`.
3. 🔒 Seis intentos fallidos con el email de otra persona. Resultado hoy: esa persona queda bloqueada 15 min (`[LOGIN-RATE-LIMIT]`).
4. Contraseña temporal vencida (> 24 h). Resultado: login rechazado con `?error=temp_password_expired`.

---

### 8. Discord — canales y personas ⭐ ⚠️ — `[DISCORD-SIN-PROBAR]`

**Prerrequisitos:** bot desplegado en Railway con `LIMITLESS_*` (o `OTC_*`); servidor real conectado.

1. `/integrations/discord`: los canales monitoreados aparecen como **Comunitario**; los de wins con "Logros".
2. Sacar el canal del equipo de los monitoreados.
3. "Quiénes escribieron acá" en el canal de wins: nombres con sugerencia y nivel (exacto / fuerte / posible / sin sugerencia).
4. Confirmar las personas del equipo. Resultado: baja el contador "sin asociar".
5. ⭐ Asociar una persona a un cliente con "Asociar" y mirar la ficha. Resultado: aparecen sus mensajes viejos.
6. ⚠️⭐ Resolver una vinculación desde el **buzón** (pendientes) y mirar la ficha. Resultado esperado: aparecen sus mensajes viejos. **Probable falla** (`[DISCORD-VINCULO-SIN-REATRIBUIR]`).
7. ⭐ Marcar un canal "De un cliente" con un solo dueño, escribir desde una cuenta no asociada. Resultado: cuenta para ese cliente pero **no** apaga la alerta de silencio.
8. ⭐ Escribir desde una cuenta del equipo en ese canal. Resultado: no se atribuye a nadie ni se clasifica.
9. 🔒⚠️ Escribir `!vincular <email de otro cliente>` desde una cuenta cualquiera. Resultado hoy: queda vinculada a ese cliente (`[DISCORD-VINCULAR-EMAIL-AJENO]`).
10. Mensaje en canal monitoreado → fila en `discord_messages` con `content` lleno (vacío = falta el intent MESSAGE CONTENT).
11. Al día siguiente (cron `daily-signals` 07:20 UTC): `ai_sentiment` lleno en mensajes nuevos, ninguno del equipo clasificado.

### 9. Discord — perfil del bot por servidor ⚠️ — `[DISCORD-PERFIL-SIN-PROBAR]`

1. ⚠️⭐ En un servidor conectado antes del 2026-09-09, guardar un nombre. Resultado: falla con el texto del permiso «Cambiar apodo».
2. ⭐ Subir una foto en ese servidor. Resultado: funciona (llamadas separadas).
3. Reconectar Discord y guardar el nombre. Resultado: el bot aparece con ese nombre.
4. ⚠️ Recargar tras un rechazo. Resultado: el aviso ámbar sigue (`bot_profile_error` persistido).
5. Nombre > 32, WebP, archivo > 4 MB: los frena la app antes de Discord.
6. ⭐ PNG y después JPG: queda un solo archivo en `discord-bot-avatars`.
7. Quitar la foto: vuelve la de la aplicación.
8. 🔒 Con dos orgs, cada una escribe sólo bajo `{organization_id}/`; subir a la carpeta de otra es rechazado.
9. ⭐ En otro servidor con el bot, el nombre y la foto no cambiaron.

---

### 10. Notch nav y UI 

1. Recorrer la plataforma en preview: pill activo, dropdowns, switcher holding, badge de clientes con el número real, menú de perfil (nombre y org), cerrar sesión, drawer mobile (`[NAV-1]`).
2. ⚠️ A 1280 px con los add-ons Operaciones y Producto activos: las islas no se superponen.
3. Pantallas hondas (cliente, SOP, embudo, reporte): la "vuelta" lleva a un lugar útil.
4. ⚠️ Con DevTools, computed de `--glass-bg` sobre `<html>` en claro y oscuro. Esperado según `tokens.css`: card blanca / `rgba(10,10,10,0.88)`. Probable: `rgba(255,255,255,0.03)` en ambos (`[GLASS-TOKENS-PISADOS]`).
5. Cajones laterales: retrospectiva de sprint, versiones de SOP, leads de UTM, llamadas del cliente abren contra el borde derecho y no asoman cerrados (`[LAYOUT-CAJONES]`).
6. Integraciones: conectar VTurb/Hyros/WebinarJam con key inválida → tarjeta "Con error" con texto accionable (`[INTEGRACIONES-VERIFICAR]`).

### 11. Infraestructura tras el renombre del repo — `[REPO-RENOMBRADO-DEPLOYS]`

1. ~~Vercel → Settings → Git muestra `santiagozurbrigk/limitless-system`~~ — ya verificado el 2026-09-23 (los deploys de producción salen de ese repo). Queda Railway; mismo chequeo que V-INFRA-9 (§ Infraestructura).
2. Railway → servicio del bot → Source: mismo repo, Root Directory `apps/discord-bot`.
3. Vercel y Railway tienen `LIMITLESS_WEBHOOK_SECRET` / `LIMITLESS_API_URL` (para poder borrar los `OTC_*`).

### 12. Pantallas de error propias ⭐ (SCRUM-108)

Lo que se probó con un build de producción y Supabase y Sentry falsos (evidencia de SCRUM-108): la pantalla de cada
módulo con la navegación visible, la plataforma andando con una lectura del layout caída, `global-error` y los
eventos en Sentry sin datos sensibles. Queda verlo en producción, sin romper nada: lo único que se puede
provocar a mano sin tocar la base es un `notFound()`.

**Prerrequisitos:** una cuenta de la org de prueba; acceso al proyecto de Sentry.

1. ⭐ Abrir la ficha de un cliente que no existe, por ejemplo `/clients/00000000-0000-4000-8000-000000000000`, y un SOP que no existe (`/sops/00000000-0000-4000-8000-000000000000`). Resultado: "No encontramos lo que buscás" con la notch nav arriba y el botón "Ir al panel"; nunca "Application error".
2. 🔒 Con una cuenta de otra org, abrir la URL de la ficha de un cliente de la org de prueba. Resultado: el mismo "No encontramos lo que buscás". Con un cliente propio, la ficha se ve como siempre.
3. Abrir una URL que no existe, por ejemplo `/no-existe`. Resultado: la 404 general de siempre.
4. ⭐ La próxima vez que una pantalla falle en producción (o en un preview con una variable de Supabase rota a propósito): se ve "No pudimos cargar…" en español, con "Reintentar", el código de referencia y la navegación; nunca un texto en inglés ni un nombre de tabla.
5. En Sentry, buscar el código de referencia que mostró la pantalla (tag `error_digest`). Resultado: un evento del navegador con el tag `boundary` y, si vino del servidor, el evento de `onRequestError` con el mismo código; ninguno con cookies, query ni cuerpo del pedido.
6. Si alguna vez aparece un evento con el tag `lectura_degradada`, la plataforma siguió andando con un valor por defecto (sin selector de holding, sin checklist, con la zona por defecto): revisar qué lectura falló.

---

## Clientes

> Condensado de `docs/archivo/PLAN_VERIFICACION.md` §14–18, 21, 22 y los bloques fechados de Clientes, revisado contra el código
> del 2026-09-23 (commit 038caca). Todas las migraciones están aplicadas; ya no hay que aplicar nada antes de probar.
> Marcas: ⚠️ alta probabilidad de falla · 🔒 verifica seguridad · ⭐ verifica regla central.
> Prerrequisito general: sesión real en producción o preview con base de producción; para los pasos 🔒, una segunda
> cuenta de la misma org con rol limitado y una cuenta de otra org.

---

### 1. Permisos del módulo 🔒 — `[ALTA-CLIENTES-PROBAR]`

**Prerrequisitos:** un miembro con Clientes en «full», otro en «read», otro en «none».

1. Con «full»: `/clients` muestra Nuevo cliente, Cargar clientes, Revisión semanal, Wins, Cobros (si además ve Ventas) y el menú Configurar (Recorrido del cliente, Campos personalizados). Crear un cliente de prueba y borrarlo.
2. Con «read»: la barra no aparece y la próxima tarea no tiene check.
3. Con «none»: tipear `/clients` en la barra → «No tenés acceso».
4. 🔒 ⚠️ Con «read», invocar `deleteClientAction` o `updateClientAction` desde la consola. **Hoy responde** (`[PERMISOS-SERVER-ACTIONS/clientes]`). Registrar el resultado.
5. 🔒 Con un no-founder: en Campos y Recorrido ve la configuración sin botones; llamar a mano `createFieldDefinitionAction` → «Solo el founder…».
6. 🔒 Con una cuenta de otra org: ninguna fila de `clients`, `client_tasks`, `field_definitions`, recorrido, eventos, propuestas, wins, facturación.

**Resultado esperado:** 1–3, 5, 6 como se describe; 4 documenta el agujero conocido.

---

### 2. Campos personalizados (C0) ⭐ — `[C0-PROBAR-PANTALLA]`, `[AVISO-Y-SATISFACCION-SIN-PROBAR]`

**Prerrequisitos:** founder.

1. `/clients/campos` → tres solapas (Wins, Checkpoints, Clientes).
2. ⭐ Crear una columna, renombrarla → la **clave interna no cambia** (mirar `field_definitions.key`).
3. ⭐ Renombrar una opción → se guarda `value`, cambia `label`; los datos viejos muestran la etiqueta nueva.
4. ⭐ Sacar una opción ya usada → rechaza y ofrece archivar. Archivarla → deja de ofrecerse.
5. Crear «Tipo de Win» cuando existe «Tipo de win» → rechaza (misma clave). Sólo emojis → rechaza.
6. ⭐ Borrar una columna con datos (en wins, checkpoints, clientes **o sólo en un cliente-de-cliente**) → rechaza y ofrece archivar.
7. ⭐ Archivar «Objetivo general» y guardar otra cosa en la ficha de un cliente que lo tenía → el valor viejo sigue (bloque de sólo lectura).
8. ⭐ Vaciar un campo activo y guardar → queda vacío tras F5.
9. Campo fecha con «avisar a 15 días»; cargar una fecha dentro de ese rango → se pinta en alerta con «faltan N días».
10. Texto de >20.000 caracteres en dos campos a la vez → el error nombra **los dos** con sus números.

**Resultado esperado:** lo descrito en cada paso. Si 2 falla, todo el mecanismo está roto.

---

### 3. Recorrido: catálogo (C1) — `[C1-PROBAR-PANTALLA]`

1. `/clients/checkpoints` con recorrido vacío → «Cargar un recorrido de ejemplo» crea 3 fases.
2. Checkpoint con plazo 5, «pasa a: Activo» y una métrica obligatoria.
3. ⭐ Renombrar la columna de la métrica en Campos → el checkpoint muestra el nombre nuevo.
4. ⭐ Archivar esa columna → la métrica queda marcada como no disponible.
5. ⭐ Borrar una fase con checkpoints → rechaza. Borrar un checkpoint alcanzado por algún cliente → rechaza/ofrece archivar.
6. Reordenar fases y checkpoints → persiste.

---

### 4. Recorrido: registro en la ficha (C2) ⭐ — `[C2-PROBAR-FICHA]`

**Prerrequisitos:** recorrido con al menos un checkpoint con métricas y uno con `sets_client_status`.

1. Ficha → Recorrido → Registrar uno sin métricas → fecha y nota.
2. ⭐ Uno con métricas → pide exactamente las configuradas. «mil» en un monto → rechaza, no guarda 0. Fecha futura → rechaza.
3. ⭐ Registrar el que «pasa a: Activo» → cambia el estado en el encabezado.
4. ⭐ Deshacer ese registro → avisa que el estado no vuelve solo; el estado **no** cambia; la fase sí se recalcula.
5. Registrar el mismo checkpoint dos veces → edita, no duplica.

---

### 5. Fase manual y tabla ⚠️⭐ — `[CLIENTES-VER-CON-DATOS]`

1. Cliente sin hitos → selector «Fase» → tercera fase → la ficha la muestra con «fijada a mano»; los hitos anteriores en gris «salteado», sin fecha.
2. Tabla `/clients`, columna Etapa → dice esa fase.
3. ⚠️ ⭐ Cliente **con** un hito en la fase 1 y fase manual en la fase 3 → la ficha dice fase 3. **La tabla hoy dice fase 1** (`[CLIENTES-ETAPA-TABLA-VS-FICHA]`). Anotar.
4. Registrar un hito de una fase más avanzada que la manual → gana la derivada en ficha y tabla.
5. Volver el selector a «Sin empezar» → manda la derivada.
6. 🔒 Fijar una fase con un id de otra org (a mano) → «Esa fase no existe en tu recorrido».
7. ⭐ «n de m» de la tabla = checks de **esa fase** en la ficha (sin archivados).
8. Un hito sin plazo, o con el anterior sin registrar → no muestra vencimiento. Un atrasado → «trabado hace N días», nunca fecha y atraso juntos.

---

### 6. Buzón de propuestas (C3 + cron) ⚠️⭐

**Prerrequisitos:** recorrido configurado; Discord con mensajes atribuidos o llamadas `delivery` con cliente; `CRON_SECRET`.

1. `curl -X POST "$APP/api/cron/daily-signals?organizationId=<uuid>" -H "Authorization: Bearer $CRON_SECRET"` → tres pasos con números o error por paso.
2. ⚠️ `clasificacion.vacios` alto → falta el intent MESSAGE CONTENT del bot.
3. Sin recorrido → los pasos de propuestas devuelven 0 sin llamar a la IA.
4. Correrlo dos veces → la segunda no reevalúa (`checkpoint_checked_at`).
5. ⭐ En la ficha, cada propuesta dice fuente y motivo. Aceptar → crea el evento con las mismas validaciones (una propuesta con métricas inválidas no se acepta y queda pendiente). Descartar → no crea nada.
6. ⚠️ Mirar `client_checkpoint_events.source` del aceptado → hoy queda `manual` (`[C3-ORIGEN-PROPUESTA]`).
7. ⭐ Tras dos semanas, contar `accepted` vs `rejected` (`[PROPUESTAS-CALIDAD-SIN-VER]`). >50% rechazadas → subir `MIN_MATCH_CONFIDENCE`.

---

### 7. Wins ⚠️⭐ — `[TRACKERS-PROBAR-CON-SESION]`

1. Cargar un win sin número → entra. ⭐ Clave sin número → rechaza.
2. Columnas de C0 (entity win) aparecen en el tracker.
3. ⚠️ Subir una captura a un win nuevo y a uno ya guardado → miniatura por signed URL.
4. ⚠️ Borrar el win con captura → desaparece la fila **y el objeto** del bucket `client-wins` (`[A-PROBAR-CAPTURAS]`).
5. ⭐ Autorizado sin «cómo aparecer» → rechaza. «Nombre, sin los números» → guarda; filtro «Con permiso» lo levanta.
6. ⭐ Marcar Reservada y después cargar un uso → pasa a Usada solo.
7. Dashboard: ⭐ un solo número → «Sin medir» con «Hay un solo número: falta otro para comparar»; ⭐ USD y ARS → «Los números están en unidades distintas…», no resta; mismo día → sin plazo; métrica que bajó → negativa en rojo.
8. Baseline desde el lápiz del dashboard → pasa a ser el punto inicial. ⭐ Objetivo con otra clave → no se muestra.
9. Candidatos: convertir un testimonio → crea win con el mensaje como origen; «No es un testimonio» → desaparece también de la ficha.

---

### 8. Revisión semanal ⭐

1. `/clients/revision` → cuatro secciones; las vacías dicen por qué.
2. ⭐ «¿Quién no se movió?» = trabados de la tabla. Un cliente sin plazo no aparece.
3. ⭐ «En riesgo» sólo con dos señales o más.
4. Fecha de egreso dentro de 60 días → aparece en «cerca del egreso»; una pasada → «ya egresó hace N días».
5. Anotar estado → «anotado el <fecha>»; borrar → se borra texto y fecha. ⭐ La nota libre de la ficha no se pisa.

---

### 9. Ficha: tareas, notas, satisfacción, facturación — `[FICHA-VER-CON-DATOS]`, `[AVISO-Y-SATISFACCION-SIN-PROBAR]`

1. Tareas: Enter crea «le toca al cliente»; con detalles, del coach con fecha. ⭐ «Próxima» = la de fecha más cercana (vencidas primero); la tabla muestra la misma. Tildar en la tabla → pasa a la siguiente.
2. Mandar una tarea del coach al tablero → aparece en Tablero con el nombre del cliente; sigue en la ficha; segunda vez no duplica.
3. Nota → «última edición» con fecha; F5 → sigue.
4. Satisfacción → queda con fecha y tu nombre; tocar el mismo nivel → se borra con su autor.
5. (Add-on) Facturación: mismo mes dos veces → corrige; mes en 0 → sin píldora en el siguiente. ⚠️ Un mes en ARS y el siguiente en USD → hoy muestra variación (`[FACTURACION-MONEDAS]`).
6. Medir el tiempo hasta que la ficha termina de dibujarse (`[FICHA-LENTA]`).

---

### 10. Sesiones 1-1 por link ⚠️🔒⭐ — `[1A1-MANUALES-SIN-PROBAR]`

**Prerrequisitos:** una grabación 1-1 real con link «Compartir»; clave de Anthropic válida (org o global).

1. ⭐ Pegar el **mismo link otra vez** → «Esa llamada ya estaba»; no duplica tareas, timeline ni problemas.
2. ⚠️ Subir el link de una llamada que la sync ya había bajado → reusa la fila (si se duplica, `props.call.id` ≠ `recording_id`).
3. ⚠️ ⭐ Link de una grabación de **otra cuenta de Fathom** → funciona igual. Si falla, hace falta el camino de pegar el transcript.
4. Link privado (`fathom.video/calls/…`) o texto cualquiera → pide el link de Compartir.
5. ⭐ Leer las tareas extraídas: compromisos hacia adelante, separados cliente/coach; sin consejos ni cosas ya hechas.
6. Segunda 1-1 → contador 2 con «cada N días»; en la tabla «· 2».
7. 🔒 `clientId` de otra org en `uploadOneOnOneFromShareLinkAction` / `taskId` ajeno en `retryOneOnOneTasksAction` → no devuelven nada.

---

### 11. Identidades y «Última 1-1» ⚠️ — `[B-SEMBRAR-IDENTIDADES]`

**Prerrequisitos:** Fathom conectado.

1. Entrar a `/clients/pending-calls` desde el botón «Llamadas sin asociar» de la barra de `/clients` (muestra la cantidad pendiente).
2. «Cargar identidades desde el CRM» → dice cuántas cargó y cuántas quedaron afuera por repetidas. Repetirlo → no duplica ni pisa `manual_confirmation`.
3. Esperar el cron de procesamiento; `select purpose, count(*) from fathom_calls group by purpose` → aparecen `delivery`.
4. ⭐ Confirmar una llamada → nueva fila en `client_identities` con `source='manual_confirmation'`; la próxima grabación con ese alias se resuelve sola.
5. ⚠️ Medir falsos positivos de las fechas con «?» en «Última 1-1»: >1 de 5 → dejar de mostrar candidatos.

---

### 12. Import de clientes ⚠️

1. CSV con la plantilla de «Cargar clientes» → todo o nada; un error de fila no inserta ninguna.
2. ⚠️ Excel (`/integrations/import`) con montos `1.500`, `1.500,00` y `$2,500.00` → hoy entran como 1,5 / 0 / 2500 (`[CLIENTES-IMPORT-EXCEL-MONTOS]`). Fecha vacía → hoy.
3. ⚠️ Excel con columna Email → el cliente queda **sin** mail (`[CLIENTES-SIN-MAIL]`).
4. Reimportar el mismo archivo → saltea por nombre; `/clients` muestra los nuevos sin F5.

---

### 13. Clientes de clientes (add-on) 🔒⭐ — `[CLIENTES-DE-CLIENTES-PROBAR]`

1. 🔒 Org con add-on → tarjetas «Clientes» y «Facturación del negocio»; sin «Información del cliente». Org sin add-on → ninguna, sin columna Facturación, sin plantillas en Campos.
2. 🔒 Sin add-on, llamar `createSubClientAction` / `saveClientRevenueAction` → «Esta función no está habilitada…».
3. Agregar «Ana» + `@ana.coach` → link a Instagram; `juan perez` → error.
4. Cargar Avatar y GHL → contadores 1/7 y 1/8; el otro creador vacío; F5 persiste.
5. ⭐ Growth partner con valores de sección propios → aviso «Hay N datos…» → «Pasarlos a…» → se mueven; un destino que ya tenía el campo no se pisa y el aviso lo sigue mostrando.

---

### 14. Onboarding por link (add-on) 🔒⭐ — `[ONBOARDING-CLIENTES-PROBAR]`

**Prerrequisitos:** org con add-on (hoy sólo Limitless); ventana de incógnito.

1. ⭐ Campos → «Preguntas del onboarding» → «86 campos cargados»; de nuevo → «Ya estaban todos». 76 «Onboarding» + 10 «Sistemas»; ninguna «Obligatoria»; «Próximo lanzamiento» es fecha.
2. ⭐ Editar «¿Qué campañas corrés?» y guardar sin tocar → en el formulario sigue condicionada a «¿Corrés anuncios?» = Sí.
3. Generar link de un creador; generarlo otra vez (otra pestaña) → el mismo.
4. 🔒 Abrir en incógnito → formulario sin login. Cambiar una letra → «no está activo». Desactivar → «no está activo». Apagar el add-on → «no está activo».
5. Continuar sin completar → errores por pregunta. Cerrar y volver → mismo paso con lo escrito.
6. Enviar → «¡Listo, gracias!»; ficha → historial con quien lo completó; timeline «Onboarding completado: {creador}».
7. ⭐ Editar una respuesta en la ficha, reabrir el link (aparece lo editado), cambiarla y enviar → pisa y el historial muestra «Antes: …».
8. ⚠️ Más de 10 envíos en 10 minutos desde la misma IP → mensaje de límite, no error.
9. Paso 12 (sistemas) → estado en la solapa Sistemas, con «Cargado por el equipo» intacto.
10. 🔒 ⭐ Link general: pide tu nombre y el del creador; enviar → «1 sin asignar», ninguna ficha cambia. Asignar a un creador existente → caen sus respuestas y sale de la bandeja. «+ Cliente nuevo» → growth partner en `pending_onboarding` con monto 0. Descartar → sale sin tocar nada. Desactivar el general → «no está activo», la bandeja sigue.
11. ⭐ Umbral «Clientes sin novedades»: 0 → no deja; 10 → un growth partner sin actividad en 10 días muestra «Sin novedades 10d» con tooltip de la última fuente; cargarle una nota → desaparece. ⚠️ Un cambio de datos (nombre, fase) no cuenta como novedad: confirmar que es lo deseado.
12. «Próximo lanzamiento» de un creador a 7 días → «Próximo lanzamiento · {creador} · faltan 7 días» y pastilla «Fechas cerca»; a 30 días o pasada → no aparece.

---

## Ventas

> Condensado de `docs/archivo/PLAN_VERIFICACION.md` (§14 Seguimiento, §20 Llamadas, "Cobros en Ventas",
> "Auditoría de backend") más bloques nuevos de esta auditoría. Verificado contra el código el
> 2026-09-23 (commit 038caca).
> Marcas: ⚠️ alta probabilidad de falla · 🔒 verifica seguridad · ⭐ verifica regla central.

---

### 1. Llamadas de venta en `/sales/llamadas`

**Prerrequisitos:** sesión de founder en una org con Fathom conectado y al menos una grabación con `purpose = 'sales'`.

1. Entrar a **Ventas → Llamadas**.
2. En la base: `select count(*) from fathom_calls where organization_id = '<org>' and purpose = 'sales'`.
3. Revisar logs del servidor de esa request.

**Resultado esperado:** la lista muestra la misma cantidad de llamadas que el count (tope 100), cada una
con su análisis si hay fila en `call_analyses` con ese `fathom_call_id`, y sin errores
`[getSalesCallsAction]` en los logs. Corregido el 2026-09-28 (`[LLAMADAS-EMBED-ROTO]`); en prod había
18 llamadas de venta y ningún análisis atribuible (los 19 análisis tienen `fathom_call_id` null), así que
hoy se ven sin análisis: eso es `[FATHOM-DEEP-ANALISIS-ALCANCE]`, no esta pantalla.

---

### 2. Closing muestra los turnos recientes ⚠️⭐

**Prerrequisitos:** org con más de 1.000 `closing_calls` (consultar `select organization_id, count(*) from closing_calls group by 1`).

1. Abrir **Ventas → Closing → Calendario** en el mes actual.
2. Comparar contra `select count(*) from closing_calls where organization_id = '<org>' and scheduled_at >= date_trunc('month', now())`.
3. Repetir en **Lista**.

**Resultado esperado:** mismos turnos que en la base. Desde SCRUM-4 (2026-10-04) se trae todo paginado y filtrado por la org activa; si faltan, abrir un ítem nuevo.

---

### 3. Seguimiento en tabla con valores propios ⭐

**Prerrequisitos:** sesión real; ninguna cuenta externa. Nunca se vio renderizado.

1. **Ventas → Closing → Seguimiento.** Esperado: tabla de nueve columnas; el pill Pendientes coincide con los accionables.
2. ⭐ Pasar a **Todos**: aparecen ganados, perdidos y agendados (~1.250 leads en prod).
3. Buscar por nombre y por mail: filtra sobre el total, no sobre la página. Pasar de página: `51–100 de N`.
4. Elegir un **próximo paso** en una fila: se guarda solo y la columna Estado cambia. ⭐ Recargar: persiste.
5. Cambiar la **fecha** a futuro: pasa de "Seguimiento vencido" a "Seguimiento agendado".
6. Elegir **Dar por perdido**: fecha deshabilitada, estado "Perdido".
7. ⭐ Cambiar el próximo paso de una fila con nota y responsable: nota y responsable **no se borran**.
8. Asignar responsable y verificar `closing_calls.next_action_owner_id` en la base.
9. Escribir una nota y hacer click afuera: se guarda; Escape vuelve al valor anterior.
10. Click en el nombre: panel lateral con el hilo completo.
11. **Crear valor…** con "Necesita fecha": queda seleccionado y disponible en todas las filas.
12. ⭐ Crear uno con "Cierra el hilo" y elegirlo: se comporta como `lost`.
13. Crear un valor con nombre repetido: "Ya existe un valor con ese nombre".
14. ⭐ Archivar un valor en uso: desaparece del selector, las filas lo muestran tachado.
15. 🔒 Con un usuario de otra org: no ve ni crea valores ajenos en `sales_follow_up_options`.
16. Elegir un paso que pide fecha sin fecha: se guarda a **pasado mañana** (deliberado; confirmar que se entiende).

**Resultado esperado:** todo lo anterior. Si falla el paso 4 tras recargar, el guardado optimista miente.

---

### 4. Cargar resultado de un turno ⭐⚠️

**Prerrequisitos:** un turno `scheduled` o `attended` ya pasado.

1. Abrir el turno → **Marcar como no cerrada**: el modal pide motivo, notas y el bloque de seguimiento.
2. Guardar con próximo paso: toast "Resultado y seguimiento guardados"; la fila aparece en Seguimiento.
3. ⭐ Guardar sin próximo paso: avisa que queda "Sin próximo paso" y no lo bloquea.
4. **Marcar como no show**: mismo modal sin motivo.
5. ⭐ Un turno "Asistió — sin resultado" tiene los tres botones.
6. Reabrir el modal con otro turno: campos en blanco.
7. ⚠️ **Marcar como cerrada** con pago y comprobante; verificar en la base: `closing_calls.status = 'closed'` y `status_source = 'manual'`, cliente creado con `closing_call_id`, `sales_leads.client_id` completado, fila en `client_payments`.
8. ⚠️ Repetir el paso 7 cortando la red antes de terminar (DevTools offline después del primer request).
9. Esperar la próxima corrida del cron de Calendly/GHL y verificar que el turno sigue `closed`/`not_closed`.

**Resultado esperado:** 7 deja las cuatro escrituras. En 8 cualquier estado parcial confirma
`[CLOSING-CIERRE-ATOMICO]`. En 9 el sync no pisa lo manual (⭐ regla `status_source`).

---

### 5. Cobros en Ventas ⚠️ — `[COBROS-PROBAR]`

**Prerrequisitos:** sesión real; un cliente con plan en cuotas.

1. **Ventas → Cobros:** una fila por cliente con plan, días restantes, tipo de pago, adeudado, monto.
2. ⭐ Comparar el adeudado de dos o tres clientes contra cálculo manual (`computeOutstandingBalance`).
3. Filtrar "Con saldo": las tres tarjetas de arriba suman lo filtrado.
4. **Ver pagos:** historial, barra de progreso y plan de cuotas.
5. ⚠️ **Registrar una cuota** con comprobante: la cuota pasa a pagada y el adeudado baja.
6. Ir a Finanzas sin recargar: el pago aparece.
7. ⚠️ F5 en `/sales/cobros`: el pago sigue.
8. Registrar un pago **sin** comprobante: se guarda (`storage_path` null).
9. 🔒 Bucket `client-payment-receipts` en el dashboard de Supabase: privado (no está en migraciones).
10. 🔒 Miembro con Clientes total y Ventas "Sin acceso": no ve "Cobros" en Clientes; `/sales/cobros` a mano muestra "sin acceso".
11. 🔒 Miembro con Ventas "Solo lectura": ve la tabla, no ve "Crear planes" ni el lápiz.
12. Abrir `/sales/cobros?cliente=<id>`: el historial de ese cliente abre desplegado.

**Resultado esperado:** todo lo anterior; si 7 pierde el pago, falló `revalidatePaymentScreens`.

---

### 6. Fathom por miembro (keys, webhooks, privacidad) ⚠️🔒 — probado 2026-10-03 (SCRUM-47)

**Prerrequisitos:** cuenta real de Fathom para dos miembros; `ENCRYPTION_MASTER_KEY` configurada.

**Resultado 2026-10-03 (SCRUM-47):** probado con la cuenta real de Santiago Zurbrigk en Optimiza tu Control.
- Al conectar la key desde la sección por miembro, se creó el webhook en Fathom (destino `https://www.optimizatucontrol.com/...`, scopes My Recordings y My Team-Shared Recordings) y se dedujo bien el mail.
- Se grabó una llamada de 2 min a las 00:49 UTC. Fathom **no disparó el webhook**: en 25 min no llegó ningún pedido a `/api/integrations/fathom/webhook/*` y `fathom_webhook_events` siguió vacía, aunque la grabación ya aparecía en `GET /meetings`.
- "Sincronizar mis llamadas" la trajo a nombre del miembro (`user_id`), y entró al pipeline.
- Decisión: el cron horario sincroniza también las keys por miembro (SCRUM-448), así la grabación entra sola igual. El webhook queda activo: si Fathom lo dispara, la llamada entra al instante.
- Si algún día llega una entrega, revisar que `fathom_webhook_events` la tenga sin `error`.

0. ⚠️ Estado al 2026-10-02: las 8 filas de Fathom en `team_member_integrations` vienen de la conexión **de la organización** (`connectFathomAction` registra a quien conectó como miembro), que no crea webhook: ninguna tiene `webhook_id`. Para probar el webhook, el miembro tiene que conectar (o volver a conectar) su key desde la sección de cuentas por miembro de **Integraciones → Fathom** (`connectMemberFathomAction`), que es la que lo crea.
1. Un miembro conecta su key en **Integraciones → Fathom**: se valida antes de guardar y figura conectado.
2. ⭐ Se le muestra el mail deducido de su cuenta para confirmar; no se asume.
3. 🔒 En un entorno sin `ENCRYPTION_MASTER_KEY`: falla con motivo y no guarda nada.
4. En Fathom → Settings → Webhooks aparece el webhook creado por Limitless.
5. ⚠️ Grabar una llamada (2 minutos alcanzan): llega sola (`/api/integrations/fathom/webhook/[token]`). Mirar `fathom_webhook_events`: tiene que haber una fila con `processed_at` y `error` vacío, y en `fathom_calls` la llamada con `ingest_source = 'webhook'`, título e invitados. Si el evento tiene `error`, el cuerpo real de Fathom no tiene la forma de `/meetings`: anotar `payload` y abrir un ítem. Si no hay evento y el miembro figura con "firma inválida", la firma no coincide con la de la doc (`webhook-id`/`webhook-timestamp`/`webhook-signature`).
6. ⭐ Dos miembros en la misma llamada: una sola fila en `fathom_calls`.
7. `fathom_calls.user_id` dice quién grabó.
8. 🔒 ⭐ Una llamada sin vincular a cliente la ve sólo quien grabó; al vincularla a cliente la ve toda la org.
9. 🔒 Una llamada vinculada sólo a un **lead** (`counterparty_lead_id`) o a un turno (`closing_call_id`): la ve el founder y el resto de la org (decisión 2026-10-03, SCRUM-157).
10. Revocar la key en Fathom: la fila pasa a "revocada" y avisa.
11. Desconectarse: el webhook desaparece de la cuenta de Fathom.
12. El resumen de la llamada llega (antes `default_summary` era objeto y no llegaba).
13. `resolution_method` tiene valor en cada llamada clasificada.

**Resultado esperado:** todo lo anterior. Falla de firma = ninguna llamada llega y el panel dice "firma inválida".

---

### 7. Cruce grabación ↔ turno y clasificación ⚠️⭐ — `[LLAMADAS-VERIFICAR-FATHOM]`, `[B-SEMBRAR-IDENTIDADES]`

**Prerrequisitos:** Fathom conectado, turnos de Calendly/GHL con `lead_email`.

1. ¿`calendar_invitees` viene poblado en las grabaciones? `select count(*) filter (where calendar_invitees = '[]'::jsonb) from fathom_calls`.
2. ⚠️ Sembrar identidades: **Clientes → Llamadas sin asociar → "Cargar identidades desde el CRM"**. Verificar filas en `client_identities` y la lista de ambiguos.
3. Dejar correr `/api/integrations/fathom/process` y medir `select purpose, resolution_method, count(*) from fathom_calls group by 1,2`.
4. ⭐ Tomar 10 grabaciones con `purpose = 'sales'`: ¿cuántas cruzaron un turno (`closing_call_id not null`)? Las que no, confirman que el peldaño 5 marca venta sin cruce (`[FATHOM-CRUCE-AGENDA-DESCONECTADO]`).
5. Medir falsos positivos del peldaño `name_match`: si más de 1 de cada 5 está mal, dejar de mostrar candidatos.
6. En **Integraciones → Fathom → Grabaciones sin turno**, vincular una a mano: `closing_call_id` se completa y `appointment_match.confidence = 'manual'`.
7. ¿La ventana de 45 min (match sólo por horario) es la correcta? Revisar los cruces provisionales.

**Resultado esperado:** con identidades sembradas, la mayoría de las llamadas de clientes se resuelven solas.

---

### 8. Análisis profundo y ranking ⚠️

**Prerrequisitos:** QStash configurado; una llamada de venta ≥10 min vinculada a cliente y una 1-1 de entrega ≥10 min.

1. Esperar el procesamiento y mirar `call_analyses` de las dos.
2. Mirar `call_analyses.closer_name` / `closer_id`.
3. **Ventas → Métricas → ranking de equipo.**

**Resultado esperado (regla):** sólo la de venta se analiza y queda con su closer.
**Probable hoy:** las dos se analizan y `closer_name` queda null → ranking "Sin nombre" (`[FATHOM-DEEP-ANALISIS-ALCANCE]`).

---

### 9. Calendly de closers y leads ⚠️

**Prerrequisitos:** un closer con Calendly propio conectado en `/settings`.

1. Agendar un turno en el Calendly del closer con un mail nuevo.
2. Esperar `/api/cron/calendly-sync-closers`.
3. Verificar `closing_calls.closer_id` y `lead_id`.
4. Buscar el lead en **Closing → Seguimiento → Todos**.

**Resultado esperado:** `closer_id` seteado y el lead en la tabla. **Probable hoy:** `lead_id` null y el
lead no aparece (`[CALENDLY-CLOSER-SIN-LEAD]`). Revisar también logs de choque entre los dos crons de Calendly.

---

### 10. Holding en Closing 🔒⚠️

**Prerrequisitos:** usuario holding con dos negocios con turnos.

1. Activar el negocio A y abrir **Closing → Lista**.
2. Buscar turnos del negocio B.
3. Intentar marcar un resultado y editar una fila de Seguimiento en el negocio A.

**Resultado esperado:** sólo turnos de A y las ediciones funcionan. Si aparecen turnos de B o las ediciones fallan, confirma `[CLOSING-HOLDING-MEZCLA]`.

---

### 11. Webhook legacy de Fathom 🔒

**Prerrequisitos:** dos o más orgs con `fathom_integrations.webhook_secret` igual (el global).

1. Enviar a `/api/integrations/fathom/webhook` un evento firmado con el secreto global.

**Resultado esperado:** 409 "use the per-member webhook URL". Esas orgs tienen que pasar a la URL por miembro.

---

## Marketing

Marcas: ⚠️ alta probabilidad de falla · 🔒 verifica seguridad · ⭐ verifica regla central

### V1. Una org sin Zernio no ve datos de otra cuenta 🔒
Desde 2026-09-29 el código no usa ninguna key global de Zernio y hay tests que lo cubren. Falta verlo en pantalla,
con una sesión real.
**Prerrequisitos:** acceso a Vercel y una org de prueba **sin** Zernio conectado.
0. En Vercel → Settings → Environment Variables, confirmar que `ZERNIO_API_KEY` ya no existe (Production y Preview).
   Si sigue, borrarla: ningún código la lee.
1. Con esa org, abrir `/marketing/anuncios` y `/comentarios`.
2. Correr `curl -X POST "$APP_URL/api/cron/capture-ad-metrics" -H "Authorization: Bearer $CRON_SECRET"` y mirar `ad_metrics_daily` por `organization_id`.

**Esperado:** Anuncios muestra "Zernio no está conectado" y Comentarios "Conectá Zernio"; la respuesta del cron sólo lista orgs con integración activa y no aparecen filas para las demás.

### V2. Sync de contenido e historias (BUG-1) ⭐
**Prerrequisitos:** org con Zernio conectado a Instagram y una historia publicada hace < 24 h.
1. Abrir `/marketing/content` (o esperar > 30 min desde la última sync para que dispare).
2. En los logs de Vercel buscar `[syncZernioContent] stories sync` → `fromDedicatedEndpoint > 0`.
3. En la biblioteca, filtrar Historias.
4. Confirmar que ningún reel quedó tipado como `story`.

**Esperado:** la historia aparece con `type='story'` y thumbnail persistida (URL de `content-thumbnails`, no del CDN de Instagram). Si existía como `post` de una sync vieja, queda corregida por el UPDATE.

### V3. Métricas: un analytics vacío no es un cero ⭐
**Prerrequisitos:** org con Zernio y piezas con métricas.
1. `curl -X POST "$APP_URL/api/cron/sync-content-metrics?organizationId=<org>" -H "Authorization: Bearer $CRON_SECRET"`.
2. Mirar `attempted`, `updated`, `failed` y, en las piezas, `metrics_updated_at`, `metrics_checked_at`, `metrics_intentos_sin_dato` y `metrics_reintentar_desde`.
3. Repetir: primero entran las piezas nuevas, después las que tienen métricas; una pieza sin dato no vuelve hasta su `metrics_reintentar_desde`. Una historia se pide una sola vez, desde las 30 h de publicada, y queda en `infinity`; la que pasa 7 días sin pedirse (o no tiene fecha) se cierra sin pedirla. Si Zernio responde 401 o 403, la corrida de esa org se corta sin escribir nada y queda en Sentry.

**Esperado:** piezas con analytics no reconocido quedan en `failed`, conservan sus métricas y `metrics_updated_at`, su `metrics_checked_at` queda con la hora de la corrida y su `metrics_reintentar_desde` en el futuro. Una org con muchas historias sin analytics sigue refrescando sus reels y posts: cada historia ocupa un solo lugar del lote (SCRUM-172, reabierta). Lo mismo con la sync manual de contenido (SCRUM-172): comparar una pieza antes y después de abrir `/marketing/content`; si Zernio no manda números, conserva los que tenía.

### V4. Trial Reels de punta a punta ⚠️
**Prerrequisitos:** Google conectado con Drive, Zernio con Instagram, `REEL_WORKER_URL`, `QSTASH_TOKEN`, `WORKER_AUTH_SECRET` en Vercel y Fly; una pieza con video de Drive vinculado (< 500 MB).
1. En el detalle de la pieza → Trial Reels → generar.
2. `fly logs -a otc-reel-worker`: `auth via … OK`, las 5 variantes y `preview_ready`.
3. Revisar V3 (música) y V5 (color).
4. Elegir delay 0 h y publicar.
5. Revisar en Zernio los borradores y el mail al founder.

**Esperado:** 5 previews, V5 con el LUT (`lut3d`), borradores en Zernio con el video adjunto, job `done`, mail recibido. ⚠️ V3 sale **en silencio** aunque la org tenga `reel_music_path` (`[TRIAL-REELS-MUSICA]`). ⚠️ El LUT sólo está si Fly se redeployó después de que entró `warm.cube` al repo.

### V5. Secretos del worker 🔒
1. En los logs de Vercel buscar `[TrialReels] QStash published OK` y en la consola de QStash la URL destino.
2. En `fly logs`, provocar un 401 (POST sin secreto) y mirar el warning.

**Esperado:** el secreto no aparece en ningún log ni URL. Hoy aparece (`[TRIAL-SECRET-EN-URL]`): rotar `WORKER_AUTH_SECRET` después de arreglarlo.

### V6. Holding: contenido del negocio activo 🔒⚠️
**Prerrequisitos:** cuenta holding con dos negocios, al menos uno con Zernio. Custom Access Token Hook activo.
1. Cambiar al negocio con Zernio y abrir `/marketing/content`.
2. Abrir el detalle de una pieza, intentar Trial Reels y Administrar.

**Esperado:** se ven las piezas del negocio activo. Probable falla hoy: biblioteca vacía o error, porque esas acciones usan la org del perfil (`[MKT-HOLDING-ORG]`).

### V7. Anuncios y foto diaria (PLAN_VERIFICACION §2, I-1) ⚠️
**Prerrequisitos:** Zernio con anuncios activos.
1. `curl -X POST "$APP_URL/api/cron/capture-ad-metrics" -H "Authorization: Bearer $CRON_SECRET"` → `ok: true`.
2. Sin header → 401.
3. `ad_metrics_daily`: una fila por anuncio del día anterior; correr dos veces no duplica; `?date=YYYY-MM-DD` rellena.
4. Comparar `spend` con el panel de Meta.

**Esperado:** coinciden. ⚠️ Si difiere por 100, el monto viene en centavos. Hoy la tabla tiene 0 filas en prod.

### V8. Webhook de Zernio 🔒⚠️ — `[ZERNIO-WEBHOOK-SIN-EVENTOS]`
1. Confirmar `ZERNIO_WEBHOOK_SECRET` en Vercel y el webhook registrado en el dashboard de Zernio (eventos `message.*`, `comment.received`, `account.*`).
2. Mandar un evento de prueba desde Zernio.
3. POST sin firma → 401; sin la variable → 503.

**Esperado:** fila en `zernio_comments` / `zernio_messages`. Hoy ambas tablas tienen 0 filas: si la firma no valida, el header o el formato supuesto son incorrectos (no hay doc local).

### V9. Comentarios
1. `/comentarios`: listar, responder uno, ocultar otro.
2. Detalle de pieza → tab Comentarios: paginar.

**Esperado:** la respuesta y el ocultamiento se ven en Instagram. ⚠️ `hideComment` no manda `accountId`; no está verificado que Zernio no lo pida.

### V10. Formularios ⚠️
**Prerrequisitos:** Google conectado con Forms (3 orgs en prod) y un form con respuestas.
1. `curl -X POST "$APP_URL/api/integrations/google-forms/sync?organizationId=<org>" -H "Authorization: Bearer $CRON_SECRET"`.
2. Mirar `responsesSynced`, `responsesScored`, `permissionDenied`.
3. Abrir `/marketing/forms/[id]` y correr el análisis.

**Esperado:** respuestas con `ai_lead_score`. Hoy hay 38 forms y 0 respuestas en prod (`[MKT-FORMS-SIN-RESPUESTAS]`).

### V11. UTMs de punta a punta ⭐
**Prerrequisitos:** un link UTM creado; `NEXT_PUBLIC_UTM_ORGANIZATION_ID` si se prueba con la landing de Limitless.
1. Abrir la landing con `?utm_source=youtube&utm_medium=video&utm_campaign=<campaña>` → `clicks` +1.
2. Anotarse en la waitlist o hacer `POST /api/utm/track` con `organization_id`, `utm_campaign`, `lead_email` → `utm_lead_captures` +1.
3. `POST /api/utm/track` con una campaña inexistente → no registra.
4. Agendar en Calendly con el mismo email → `utm_booking_attributions`; crear el cliente → `utm_sale_attributions` y `revenue_attributed`.

**Esperado:** el funnel del link en `/marketing/utms` muestra lead → booking → venta. Hoy `utm_lead_captures` tiene 0 filas en prod.

### V12. Secretos de integraciones cerrados a miembros 🔒
(De la auditoría 2026-09-22.)
1. Con JWT de un viewer: `GET /rest/v1/zernio_integrations` y `GET /rest/v1/youtube_integrations`.

**Esperado:** listas vacías; contenido, inbox y YouTube siguen funcionando.

### V13. Análisis IA de una pieza
**Prerrequisitos:** `OPENAI_API_KEY`, pieza con video de Drive (< 25 MB de audio).
1. Detalle → Análisis → analizar.

**Esperado:** `analysis`, `transcript`, `hook_type` guardados en ≤ 300 s. ⚠️ ffmpeg (`@ffmpeg-installer/ffmpeg`) tiene que estar en el bundle de la lambda de Vercel.

### V14. Triggers de Zernio en Embudos (PLAN_VERIFICACION §9, compartido con Embudos) ⭐
1. Bindear el paso Trigger del embudo DM a comentarios de Zernio; pedir un período de hace 6 meses.

**Esperado:** "sin datos", no `0`. Zernio desconectado → "sin datos".

---

## Embudos y Lanzamientos

> Condensado de `docs/archivo/PLAN_VERIFICACION.md` §1–12, verificado contra el código el
> 2026-09-23 (commit 038caca). Ninguno de estos bloques tiene evidencia de haberse corrido. Los cubre `[EMBUDOS-CUENTAS-REALES]`.
> Marcas: ⚠️ alta probabilidad de falla · 🔒 verifica seguridad · ⭐ verifica regla central.

### V1. Módulo base (sin cuentas externas)
**Prerrequisitos:** org de prueba; un usuario founder y otro con rol sin permiso `funnels`; un usuario de otra org.
1. Entrar como founder → "Embudos" aparece en la barra. Entrar con el rol sin `funnels` → no aparece, y `/funnels` por URL muestra el bloqueo del layout.
2. `/funnels` sin embudos → empty state. Crear DM (5000 USD) → redirige al detalle. Crear Webinar y VSL → conviven.
3. ⭐ Detalle recién creado: 7 etapas; **Spend** "no aplica" en los tres; **Lead** "no aplica" en el VSL; el resto "sin datos" en ámbar; **ningún `0`, `0%` ni `$0`** donde no hay dato.
4. Cambiar 7d/30d/90d → `?period=` en la URL, se mantiene al recargar y al cambiar de embudo con el switcher.
5. `/configurar`: una fila por paso; guardar una fuente → tilde; "Sin fuente" → el paso vuelve a "sin datos"; el select no ofrece fuentes de otra etapa.
6. 🔒 Usuario de otra org abre la URL de un embudo ajeno → 404.
7. 🔒 Con un rol de sólo lectura sobre `funnels`, llamar a `createFunnelInstanceAction`/`setFunnelStepBindingAction` → hoy **funciona** (esperado a futuro: rechazo; ver [EMBUDOS-PERMISOS-ACCIONES]).
**Resultado esperado:** 1–6 pasan; 7 documenta el hueco.

### V2. I-1 Métricas de anuncios
**Prerrequisitos:** Zernio conectado con anuncios activos; `CRON_SECRET`.
1. `curl -X POST "$APP_URL/api/cron/capture-ad-metrics" -H "Authorization: Bearer $CRON_SECRET"` → `ok: true`, `captured > 0`. Sin header → 401.
2. ⚠️ Comparar `spend`, `impressions`, `reach`, `clicks` de una fila de `ad_metrics_daily` contra Meta (factor ×100 = centavos).
3. Correr dos veces el mismo día → no duplica. `?date=YYYY-MM-DD` rellena un día pasado.
4. ⭐ Con dos embudos en la org, verificar que muestran **el mismo** spend (medida org-wide; documentar hasta resolver [EMBUDOS-MEDIDAS-POR-EMBUDO]).

### V3. I-2 Pagos Whop y Commas ⚠️ — `[EMBUDOS-PAGOS-VERIFICAR]`
**Prerrequisitos:** cuentas Whop y Commas con permisos de webhook; `ENCRYPTION_MASTER_KEY`.
1. `/integrations` → Pagos → conectar con el secreto (`ws_...` en Whop, `whsk_...` en Commas); `webhook_secret_encrypted` no está en claro.
2. Registrar la URL `.../api/webhooks/{whop|fanbasis}?organizationId=<uuid>`; compra de prueba.
3. ⚠️ `payment_webhook_events.status` = `processed`; si `unmapped`, leer `error_message` y corregir `lib/payments/normalize.ts` + su test con el payload real.
4. ⭐ Monto de Whop = `settlement_amount` (decimales); Commas `amount_cents: 2900` → `29`.
5. ⭐ Suscripción Commas con `auto_expire_after_x_periods` = 6 × 500 → `contract_value` 3000; indefinida → `unmapped`.
6. Reembolso → `kind='refund'`, monto positivo; cash collected del embudo = pagos − reembolsos.
7. 🔒 Sin firma / firma inventada → 401; sin `organizationId` → 400.
8. ⭐ Commas: evento válido que no se sabe interpretar → 200 (no reintenta nunca).
9. ⚠️ Simular falla de base (p. ej. secreto correcto con la tabla bloqueada en un branch) → responde 500 (Whop reintenta; en Commas queda el log `[ALERTA][fanbasis]` con el payload).
10. Desconectar → secretos borrados, `payment_orders`/`payment_transactions` intactos.

### V4. I-3 Detección de fuente vacía ⭐
**Prerrequisitos:** org con llamadas de cierre reales.
1. Período con todas las llamadas `scheduled` → show rate y close rate "sin datos".
2. Marcar una `no_show` → asistencia `0%` real. Marcar una `closed` → números.
3. Org sin ninguna conversación jamás → Lead "sin datos". Con conversaciones viejas y ninguna en el período → `0`.
4. ⚠️ Org sin conversaciones: `dm.replied` y `dm.set` → hoy muestran `0` en vez de "sin datos" ([EMBUDOS-SIGNAL-INCONSISTENTE]).

### V5. I-4 Oportunidades de GHL ⚠️⭐ — `[EMBUDOS-GHL-ENTREGA]`
**Prerrequisitos:** sub-cuenta GHL con pipeline y oportunidades; GHL conectado (PIT + Location ID).
1. "Sincronizar pipelines" → cantidades. ⚠️ Mirar `ghl_pipeline_stages.raw`: id de etapa en `id`/`_id`, `position` coherente con la UI de GHL.
2. Regenerar el secreto → la URL con secreto se muestra una sola vez.
3. ⚠️ Workflow "Opportunity Stage Changed" + acción Webhook a esa URL. Mover una oportunidad → fila en `ghl_webhook_events`. **Mirar el crudo:** `type` `Opportunity*`, id de oportunidad, **`pipelineStageId`**, `webhookId`. Sin `type`, la ruta devuelve `ignored` y no guarda nada. Sin `pipelineStageId`, I-4 depende de [FEAT-GHL-OAUTH].
4. ⭐ Lead → Engaged → Intent: tres filas en `ghl_stage_transitions`, `from` encadenado, `occurred_at` = hora de recepción.
5. Oportunidad preexistente: primera transición con `from` en `NULL` y `kind = 'created'` (infla "creadas" hasta [EMBUDOS-GHL-BACKFILL]).
6. Reenvío con el mismo `webhookId` → sin transición extra. Renombrar sin mover → sin transición. Borrar → `status = 'deleted'`, sin transición.
7. ⚠️ Mover a otra etapa una oportunidad ya ganada → hoy suma otra vez en "ganadas" del período ([EMBUDOS-GHL-WON]).
8. ⭐ Período ciego: antes del primer webhook, y con un período que empieza antes del borde → "Fuera del historial registrado"; empezando después → conteo real.
9. ⭐ `ghl_stage_entered` sin etapa → "Falta configurar la fuente" en la fila (y el aviso "Falta elegir un parámetro de la fuente…" arriba); con etapa → número.
10. 🔒 Sin firma ni secreto → 401; secreto incorrecto → 401; `X-GHL-Signature` inventada + secreto correcto → 401; secreto de la org B en su URL → los datos entran en B; evento no `Opportunity*` → 200 `ignored` sin guardar.

### V6. I-6 VTurb ⚠️⭐ — `[EMBUDOS-VTURB-PITCH]` (paso 3)
**Prerrequisitos:** cuenta VTurb con un VSL con tráfico; API key de Analytics.
1. Conectar → sincroniza players. ⚠️ Un 401 con key válida → probar `X-Api-Version: v3`.
2. ⚠️ Período cerrado vs dashboard de VTurb: `total_viewed` (visitantes de página), `total_started` (plays), `engagement_rate` (% promedio), y qué dedupe muestra el dashboard (`_device_uniq`/`_session_uniq`).
3. ⭐ Player con `pitch_time` → "Llegaron al CTA" con número; con `pitch_time = 0` → "sin datos". Cruzar `total_over_pitch` con `/times/user_engagement` en ese segundo.
4. Caché: segunda apertura no llama a la API; tres pasos al mismo video = una llamada; período cerrado `is_final`; abierto se refresca a los 30 min; un 429 guarda `resets_at` en `error_message`.
5. ⭐ Desconectar → "sin datos"; fuente sin video → "Falta configurar la fuente"; video sin `duration` → M11 "sin datos".

### V7. I-5 WebinarJam / EverWebinar ⚠️⭐
**Prerrequisitos:** 🔑 API key aprobada por WebinarJam; un webinar ya realizado.
1. Conectar → trae webinars de los dos prefijos, etiquetados. ⚠️ `schedules` con ids del detalle (`/webinar`), no los de la pestaña Schedules.
2. ⚠️ `signup_at` vs fecha real (segundos/milisegundos); `attended_live = true` para alguien que asistió; clave del array (`registrants`/`users`/`data`).
3. ⚠️ `schedule_external_id` nunca nulo; correr el sync dos veces y verificar que no se duplican filas ([EMBUDOS-WJ-SCHEDULE-NULL]). Un webinar de más de 5.000 registrantes se corta sin aviso.
4. ⭐ Sin `pitch_second` → "Se quedaron hasta la oferta" "sin datos"; cargarlo y re-sincronizar → stick rate; contrastar con el panel; cambiarlo cambia el conteo; el sync de webinars no lo pisa.
5. ⭐ El paso "Clicked CTA / booked call" queda "sin fuente" y no se ofrece ninguna fuente de WebinarJam.
6. ⭐ Registrantes sin ninguna asistencia registrada → "Asistieron" "sin datos"; fuente sin webinar → "Falta configurar la fuente".
7. Recordar que los números no se actualizan solos: hay que apretar "sincronizar" ([EMBUDOS-SYNC-PROGRAMADO]).

### V8. I-9 Retención y LTV ⚠️⭐
**Prerrequisitos:** pagos conectados con historia (idealmente un año).
1. ⚠️ Comparar el LTV de Limitless contra el que usa el cliente; si difiere mucho, revisar la definición de M32/M33.
2. ⭐ Cambiar el período del embudo → M32 casi no se mueve (ventana 365 días).
3. ⭐ Org sin cuotas ni suscripciones → M33 "sin datos", LTV sin calcular. Cohorte que empezó dentro del período → "sin datos".
4. Reembolso no cuenta como pago; órdenes sin comprador identificable se excluyen.
5. ⚠️ Pagos en dos monedas → hoy se suman ([EMBUDOS-MONEDAS]).

### V9. I-10 Triggers de Zernio ⭐
**Prerrequisitos:** Zernio con comentarios reales.
1. Bindear `dm.trigger` a comentarios de Zernio → número si la ventana alcanza.
2. ⭐ Período de hace 6 meses → "sin datos"; Zernio desconectado → "sin datos".
3. Historias: no hay fuente (Meta sólo expone 24 h).

### V10. I-8 Hyros ⚠️⭐
**Prerrequisitos:** cuenta Hyros de un cliente con la API habilitada en su plan.
1. Conectar → trae cuentas publicitarias. ⚠️ 401/403 puede ser el plan. Key de agencia → `Accessible-Account-Id`.
2. ⚠️ Revenue atribuido vs dashboard (mismo período y modelo). Decidir si corresponde `revenue` o `total_revenue` (incluye rebills).
3. ⚠️ `new_visits` = "visitantes" para el cliente.
4. ⭐ ROAS by-source ≠ ROAS blended. Cambiar el modelo cambia los números (caché por modelo).
5. Opt-ins Hyros vs `form_submissions` no tienen por qué coincidir.
6. ⭐ Desconectar → "sin datos" (no `0×`); todas las cuentas inactivas → "sin datos"; una cuenta falla y otra responde → números parciales + error; 429 guarda `Retry-After`.

### V11. Verificación final con todo conectado ⭐
**Prerrequisitos:** V2–V10 pasados.
1. DM: 6 etapas con números; Webinar: 7 filas; VSL: Lead "no aplica", el resto con números.
2. Ninguna tasa entre etapas > 100%.
3. ⭐ Números cerca de las bandas de la sección 02 del documento.
4. Cash collected = dashboard del proveedor.
5. Cambiar de período mueve todo junto.
6. ⚠️ Dos embudos de precio distinto en la misma org: spend, revenue y KPIs idénticos (limitación conocida, [EMBUDOS-MEDIDAS-POR-EMBUDO]).

---

## Agente de negocio e IA

Marcas: ⚠️ alta probabilidad de falla · 🔒 verifica seguridad · ⭐ verifica regla central.

### 1. Sin clave propia no hay IA: avisos y agente ⭐⚠️ — SCRUM-7
**Prerrequisitos:** acceso a los logs de Vercel y a la base de producción; una org sin clave de Claude y otra con clave válida; para el caso 3, una org de prueba con una clave `sk-ant-` que después se revoca en la consola de Anthropic.
1. Entrar como founder de la org **sin** clave: arriba de toda la plataforma aparece "Las funciones de inteligencia artificial están desactivadas", con el link "Cargar la clave" (un miembro que no es founder ve "Avisale a quien administra la cuenta").
2. En esa org, mandar un mensaje en `/agent`: responde "Las funciones de IA están desactivadas: falta la clave de Claude de tu organización…", no "No pudimos generar la respuesta".
3. Con la org de prueba: revocar la clave en Anthropic y mandar un mensaje en `/agent` (o esperar el cron de Fathom). `select claude_api_key_status from organizations where id = '<org>'`.
4. Cargar una clave válida en Ajustes → IA: el aviso desaparece y el agente responde.
5. Logs del cron de Fathom: para las orgs sin clave, `[anthropic] La organización … no tiene clave de IA usable: se saltea` y ningún `401`.

**Resultado esperado:** 1–2 → como se describe; 3 → status `invalid`, barra roja "dejó de funcionar" y el agente dice que la clave fue rechazada; nunca se usa otra clave; 4 → todo vuelve; 5 → ninguna org usa una clave que no sea la suya.

### 2. Clave de Claude de la plataforma (super-admin) ⭐ — SCRUM-71
**Prerrequisitos:** cuenta de super admin; una clave de Anthropic de la plataforma.
1. Sin clave cargada: Super-admin → Cerebro de IA → generar resúmenes por lote.
2. Super-admin → Infraestructura → "Clave de Claude de la plataforma": cargar la clave.
3. Generar resúmenes y, cuando el lote termine, sincronizar los resultados.
4. `select organization_id, feature, total_cost_usd from token_usage where feature = 'super_admin_brain_summary_batch' order by created_at desc limit 5`.

**Resultado esperado:** 1 → error "Falta la clave de Claude de la plataforma…" y no se usa la clave de ninguna org; 3 → los resúmenes se guardan; 4 → filas con `organization_id` nulo y el costo a mitad de precio (Batch).

### 3. El agente respeta permisos por módulo 🔒⚠️
**Prerrequisitos:** miembro con rol que incluye `agent` y **no** `finance` ni `clients`.
1. Como ese miembro, preguntar en `/agent`: "¿cuánto facturamos este mes?" y "listame los clientes con mayor ticket".
2. Preguntar "¿de qué habló el founder con vos esta semana?".

**Resultado esperado (regla):** el agente no devuelve finanzas ni clientes, y no cita conversaciones de otros usuarios. **Hoy fallaría** (`[PERMISOS-SERVER-ACTIONS/agente-ia]`).

### 4. `search_rag_chunks` cerrada a usuarios 🔒
**Prerrequisitos:** JWT de un usuario cualquiera y anon key.
1. `POST /rest/v1/rpc/search_rag_chunks` con `org_id` de otra org.
2. En `/agent`, preguntar algo que esté en un documento indexado.

**Resultado esperado:** 1 → `permission denied`; 2 → la respuesta usa el documento (el agente llama con service role).

### 5. Pulso diario: primera lectura real ⭐ — `[REPORTES-PULSO-DIARIO]`
**Prerrequisitos:** una org con datos (ventas/marketing) y el cron `executive-report-daily` corriendo.
1. Leer los últimos 3–5 `executive_reports` con `period = 'daily'`.
2. Comparar con lo que pasó ese día en la operación.

**Resultado esperado:** reportes cortos, `recommendations` vacío, un día normal dicho en una oración. ⚠️ El prompt recibe 14 días de datos: si el texto habla de "la última quincena", confirma `[REPORTES-VENTANA-FIJA]`.

### 6. Reporte mensual ⚠️⭐
**Prerrequisitos:** acceso de lectura a `executive_reports`.
1. Contar filas `period = 'monthly'` y ver su `period_start` y `title`.
2. Revisar logs del 2026-09-01 13:00 UTC (`sin reportes semanales en …`).

**Resultado esperado (regla):** un mensual por org y mes, del mes **cerrado** (desde SCRUM-67, el cron del día 1 toma el mes anterior). Los mensuales generados antes del 2026-10-02 pueden faltar o estar titulados con el mes nuevo. Para contarlos: `select count(*), min(period_start), max(period_start), count(distinct organization_id) from executive_reports where period = 'monthly';`

### 7. Reintentos de QStash en inteligencia y tono ⚠️ — `[INTELIGENCIA-SIN-REINTENTO]`
**Prerrequisitos:** QStash configurado; poder forzar un fallo (p. ej. org con clave sin créditos).
1. Disparar `POST /api/cron/intelligence-snapshot` con `CRON_SECRET`.
2. Mirar en la consola de QStash el estado del job de esa org.

**Resultado esperado hoy:** el job figura exitoso aunque el snapshot falló (200). Tras el arreglo: 500 y reintento.

### 8. Base de conocimiento: indexado de punta a punta ⭐
**Prerrequisitos:** `OPENAI_API_KEY` y QStash configurados.
1. Subir un PDF de 2–3 páginas y crear una nota de texto.
2. Esperar que el estado pase a indexado (Realtime, sin recargar).
3. Preguntar al agente algo que sólo esté en el PDF.
4. Borrar el documento y repetir la pregunta.

**Resultado esperado:** `business_context_documents.status = 'indexed'`, `rag_documents.embedding_status = 'done'` con chunks; el agente responde con el dato; tras borrar, ya no lo encuentra.

### 9. SOP desactivado sale del RAG ⚠️
**Prerrequisitos:** un SOP activo indexado.
1. Pasar el SOP a draft o archivarlo.
2. `select * from rag_documents where source_type='sop' and source_id='<id>'`.

**Resultado esperado (regla):** la fila no existe. ⚠️ Hoy sigue (`[RAG-SOP-HUERFANO]`).

### 10. Canvas y archivos generados ⚠️
**Prerrequisitos:** conversación en `/agent`.
1. Pedir "armame un SOP de onboarding paso a paso": tiene que abrir Canvas y crear el SOP en draft.
2. "Guardar en base de conocimiento" desde el Canvas y buscarlo en `/business-context/documents`.
3. Pedir "exportame las tareas a Excel", descargar, volver a la conversación una hora después y reintentar la descarga.

**Resultado esperado:** 1 ok; 2 ⚠️ hoy no aparece en la lista (`[RAG-CANVAS-INVISIBLE]`); 3 ⚠️ hoy el link venció (`[AGENTE-LINKS-VENCIDOS]`).

### 11. Compaction no toca la DB ⭐
**Prerrequisitos:** una conversación con más de 20 mensajes.
1. Mandar un mensaje más.
2. Leer logs `[agent] compacting conversation` y contar `agent_messages` de esa conversación.

**Resultado esperado:** el log aparece; la cantidad de filas sólo sube en 2 (usuario + asistente), sin resúmenes guardados.

### 12. Costos en `token_usage` ⭐
**Prerrequisitos:** acceso a `/super-admin/costs` y a la base.
1. Hacer una pregunta al agente, dictar un audio, subir un documento a la base de conocimiento.
2. Mirar las filas nuevas de `token_usage`.

**Resultado esperado:** filas `agent_chat`, `agent_context_selection`, `agent_voice_transcription`. ⚠️ No aparece nada por los embeddings (`[IA-COSTOS-INCOMPLETOS]`).

---

## Operaciones, Finanzas y Producto

> Condensado de `docs/archivo/PLAN_VERIFICACION.md` (§19, "Permisos por módulo") y de lo que surgió al revisar el código
> el 2026-09-23 (commit 038caca). Marcas: ⚠️ alta probabilidad de falla · 🔒 seguridad · ⭐ regla central.

---

### 1. SOP desde un video (Loom) ⚠️⭐ — `[D-SOPS-VIDEO-NUNCA-CORRIO]`

**Prerrequisitos:** `OPENAI_API_KEY`, `QSTASH_TOKEN`, `QSTASH_*_SIGNING_KEY`, `NEXT_PUBLIC_APP_URL` en Vercel;
clave de Claude válida en la org; acceso a los logs de Vercel. Antes de empezar, mirar la única fila que ya existe
en `sop_generation_jobs` (`status`, `error`): puede decir dónde falla sin subir nada.

1. SOPs (ítem propio del menú) → `#crear` → modo "video". Subir un mp4 de 2–3 min.
   → Barra de progreso; el job aparece "En cola".
2. ⚠️ Mirar logs de `/api/queue/process-sop-video`. → Sin error de `spawn` de ffmpeg. Es el riesgo #1.
3. Esperar sin recargar. → El estado pasa solo a "Transcribiendo el video…" y "Escribiendo el SOP…" (realtime).
4. Al terminar. → El markdown aparece en el editor del creador.
5. ⭐ Leer el SOP contra el video. → No hay pasos que no se dijeron.
6. ⭐ Mirar "Lo que el video no aclara" con un video incompleto. → Lista huecos reales, no viene vacío.
7. Video cortado a mitad de frase. → La transcripción no repite palabras en el empalme.
8. ⭐ Forzar un fallo de generación (p. ej. clave de Claude inválida) y reintentar. → No vuelve a transcribir:
   `transcript` se conserva y `token_usage` no suma otra fila de Whisper.
9. 💰 `token_usage` después de transcribir. → Una fila con `model = 'whisper-1'`.
10. ⚠️ Video de ~1 h (más de 25 MB de audio). → Se parte en varios pedidos y termina antes de 800 s. Ojo: el tope
    de subida es de 50 MB salvo que `NEXT_PUBLIC_SOP_VIDEO_MAX_MB` diga otra cosa (`lib/sops/constants.ts`); con el
    default, un video de 1 h se rechaza antes de subir.
    Riesgo adicional: el worker baja el video entero a memoria y a `/tmp` (512 MB en Vercel) `[OPS-SOP-VIDEO-MEMORIA]`.
11. ⚠️ Video de más de 500 MB (si `NEXT_PUBLIC_SOP_VIDEO_MAX_MB` lo permite). → Hoy se espera que falle; confirma el ítem.
12. Con 2–3 capturas subidas en el mismo flujo, guardar el SOP. → Las capturas aparecen dentro de los pasos.
13. ⭐ Volver al SOP una semana después. → Las capturas siguen viéndose (se guardó el marcador, no la URL firmada).
14. Borrar un adjunto y abrir el SOP. → "Captura no disponible", no imagen rota.
15. Después de `ready`, mirar el bucket `sop-videos`. → Hoy el video **sigue ahí** `[OPS-SOP-VIDEO-NO-SE-BORRA]`.

---

### 2. Permisos por módulo en estas áreas 🔒⭐ — `[PERMISOS-SERVER-ACTIONS]`

**Prerrequisitos:** una segunda cuenta (no founder) con un rol custom.

1. Abrir Equipo → Roles con un rol creado antes del 2026-09-06. → Los permisos aparecen en 13 módulos.
2. Rol con Finanzas en "Sin acceso"; entrar con esa cuenta. → Finanzas no está en el menú.
3. 🔒⭐ Tipear `/finance`, `/finance/expenses`, `/team`. → "No tenés acceso a …".
4. 🔒 Rol con Operaciones en "Sin acceso": probar `/operations/sops`, `/sops/<id>`, `/product`. → Bloqueado
   (Producto hereda de Operaciones).
5. ⚠️🔒 Rol con Finanzas en **"Ver"**: entrar a Gastos y editar un gasto. → Hoy **guarda**: `view` no se aplica.
6. ⚠️🔒 Desde esa sesión, invocar una Server Action de Finanzas o Producto desde la consola. → Hoy responde.
7. ⭐ Cuenta invitada sin rol asignado. → Navega todo (sin rol no se bloquea, a propósito).

---

### 3. Desactivar un miembro 🔒⚠️ — `[EQUIPO-DESACTIVAR-NO-BLOQUEA]`

**Prerrequisitos:** cuenta de prueba de miembro, sesión abierta en otro navegador.

1. Como founder, Equipo → desactivar al miembro. → La fila queda inactiva.
2. ⚠️🔒 En la sesión abierta del miembro, recargar `/dashboard` y abrir `/clients`. → Esperado: sin acceso.
   **Hoy se espera que siga entrando.**
3. ⚠️🔒 Cerrar sesión e iniciar de nuevo con sus credenciales. → Esperado: rechazo. Hoy se espera que entre.

---

### 4. Alta de miembros con contraseña temporal 🔒

1. Equipo → Invitar, con un rol custom. → Devuelve email y contraseña temporal.
2. Entrar con esas credenciales. → El middleware obliga a cambiar la contraseña.
3. 🔒 Invocar `inviteTeamMemberAction` con un `customRoleId` de **otra** org. → Esperado: error. Hoy se espera
   que lo acepte `[EQUIPO-CUSTOM-ROLE-ORG]`.
4. Abrir `/invite?token=cualquiera`. → "Esta invitación no existe…" (nada crea invitaciones hoy).
5. 🔒 Aceptar una invitación sin crear cuentas (SCRUM-495; aplicar antes la migración `20261005150000`).
   Antes de nada: en el panel de Supabase → Authentication → Sign In / Providers → Email, "Confirm email" tiene
   que estar **prendido** (o `curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/settings" -H "apikey: <anon key>"` da
   `"mailer_autoconfirm":false`). Si está apagado, anotarlo: la aceptación deja de probar que la cuenta es del
   dueño del email (`docs/operacion/entorno-y-deploy.md` § Configuración de Supabase Auth).
   Preparar: en Supabase → Authentication, crear una cuenta de prueba con "Auto Confirm User" y **no** entrar con
   ella (queda sin perfil); en el SQL editor, una fila en `team_invitations` para la org de prueba con ese email
   (cualquier caja) y un `custom_role_id` de esa org. El link es `/invite?token=<token de la fila>`.
   - Sin sesión, abrir el link. → Org, rol, quién invitó y el email; botón "Iniciar sesión"; **ningún campo de
     contraseña**. En Authentication no aparece ninguna cuenta nueva.
   - "Iniciar sesión" con la cuenta de prueba. → Vuelve a la invitación (no al panel) y muestra "Unirme al equipo".
   - "Unirme al equipo". → Entra al panel como miembro con el rol de la invitación; la fila queda `accepted`.
   - Volver a abrir el link. → "Esta invitación ya se usó…".
   - Con otra fila pendiente, abrir el link con la sesión de **otra** cuenta. → "Iniciaste sesión como…" y botón
     para cerrar sesión; la fila sigue `pending`.
   - Con una invitación para el email de alguien del staff (`super_admin_users`), entrar con esa cuenta y tocar
     "Unirme al equipo". → "Esta cuenta es del equipo de Limitless…"; la fila sigue `pending` y no se crea perfil.
   - Al terminar, borrar las filas y la cuenta de prueba.

---

### 5. Tablero de trabajo ⭐

**Prerrequisitos:** dos miembros en la org, un sprint activo.

1. Crear tarea con dos responsables. → Tarjeta con los dos avatares; el filtro por cualquiera la encuentra.
2. Moverla a "Hecho" con el segundo responsable. → Modal de tiempo; `completed_by` = ese usuario.
3. Reabrirla. → `completed_by`/`completed_at` se limpian.
4. ⚠️ Pedirle al agente "reasigná la tarea X a <tercero>". → Esperado: el tercero aparece. Hoy se espera que la
   tarjeta siga mostrando los dos originales `[WORKBOARD-ASIGNACION-AGENTE]`.
5. Crear un sprint nuevo. → El anterior pasa a "completado" y las tareas nuevas caen en el nuevo.
6. Adjuntar un PDF de 5 MB y abrirlo. → Se sube y se abre con URL firmada.
7. 🔒 Dashboard de Supabase → Storage: `workboard-task-attachments` y `sop-attachments` existen y son **privados**
   `[OPS-STORAGE-BUCKETS]`.
8. Vista "Tiempo por persona" con tarifa por hora cargada. → Horas y costo por miembro (todo al primer responsable).

---

### 6. Inputs y reporte semanal

1. Cargar inputs en 2 departamentos (tab "Por departamento"). → Se habilita "Generar reporte".
2. Generar. → `weekly_reports.status = ready`; Operaciones → Overview muestra resumen, riesgos y recomendaciones.
3. ⚠️ Con el mismo usuario, cargar un "Input rápido" en uno de esos departamentos. → Esperado a decidir; hoy
   reemplaza el input anterior `[OPS-INPUT-RAPIDO-PISA]`.
4. Editar y borrar un input propio; intentar con uno ajeno siendo no-founder. → El ajeno da error.

---

### 7. Finanzas ⭐

**Prerrequisitos:** org con clientes y cobros cargados en Ventas → Cobros, una plataforma en Configuración → Pagos.

1. ⭐ Registrar un cobro en Cobros e ir a `/finance` sin recargar. → Aparece en Cash collected y en la plataforma.
2. Cargar un gasto fijo en USD y otro en ARS. → ⚠️ Hoy se suman como si fueran la misma moneda `[FIN-MONEDAS]`.
3. Cargar compensación de un setter con `per_booking` y de un closer con `per_deal`. Comparar "Gastos de equipo"
   con "Pagos del equipo" → "Calcular mes" (en Gastos). → ⚠️ Se espera que difieran para `per_booking` `[FIN-PAYROLL-BASES]`.
4. Con una org sin clientes pero con Excel importado. → Si el snapshot no trae cash collected, el KPI muestra
   facturación − gastos `[FINANZAS-BASELINE-CASH-ESTIMADO]`.
5. 🔒 `curl -i -X POST https://<app>/api/webhooks/mercadopago` sin firma. → 401 o 503, nunca 307.

---

### 8. Producto

1. `/product` sin datos. → Empty state y badge "Sin datos configurados".
2. Crear avatar principal y dos ofertas; marcar una como core offer desde la escalera. → Una sola core offer.
3. Reordenar la escalera. → El orden persiste al recargar.
4. Guardar la propuesta de valor. → Persiste; el agente la menciona en una respuesta nueva.
5. "Auto-completar desde el contexto del negocio" con Fathom o documentos cargados. → Propuesta revisable; al aplicar, el avatar
   sugerido queda como principal.
6. ⚠️ Onboarding: fallar a propósito el paso de oferta y reintentar. → Hoy se esperan dos productos
   `[PRODUCTO-GATE-OFERTA-DUP]`.
7. Arrastrar nodos del grafo y recargar. → Las posiciones persisten. El nodo raíz dice "Mi negocio" aunque la org
   tenga nombre `[PRODUCTO-GRAFO-NOMBRE]`.

---

## Infraestructura

> Bloques abiertos al 2026-09-23 (commit 038caca). Marcas: ⚠️ alta probabilidad de falla · 🔒 verifica seguridad · ⭐ verifica regla central.
> Origen: `docs/archivo/PLAN_VERIFICACION.md` ("Auditoría de backend" pasos 3–5, "Permisos por módulo") y lo encontrado en esta revisión.

---

### V-INFRA-1 · Variables críticas cargadas en producción ⚠️⭐

**Prerrequisitos:** acceso de lectura a Vercel (proyecto `otc-plaform`, team `otcteam`, incluidas las Shared Environment Variables del team).

1. Buscar `ZERNIO_WEBHOOK_SECRET`.
2. Buscar `LIMITLESS_WEBHOOK_SECRET` (hoy sólo está `OTC_WEBHOOK_SECRET`).
3. `curl -i -X POST https://<app>/api/integrations/zernio/webhook -d '{}'`.

**Resultado esperado:** 3 → 401 "Firma inválida" (si da **503**, el webhook de Zernio está muerto: `[ENV-ZERNIO-WEBHOOK-SECRET]`). ⚠️ En el listado del proyecto no aparece `ZERNIO_WEBHOOK_SECRET`. (`ANTHROPIC_API_KEY` ya no hace falta en `apps/web` desde SCRUM-7.)

---

### V-INFRA-2 · Auth Hook del holding habilitado 🔒⭐

**Prerrequisitos:** dashboard de Supabase `OTC`; una cuenta holding con al menos un negocio.

1. Authentication → Hooks → Custom Access Token Hook: tiene que apuntar a `public.custom_access_token_hook`.
2. Con la cuenta holding, entrar a un negocio desde el selector.
3. En el navegador, decodificar el access token de Supabase (cookie `sb-…-auth-token`).
4. Crear algo en un módulo con RLS estándar (p. ej. una tarea del workboard) estando dentro del negocio.

**Resultado esperado:** el JWT trae `active_business_org_id` = id del negocio; la tarea queda con el `organization_id` del negocio, no del holding. Sin el hook, las lecturas salen vacías y las escrituras fallan con error de RLS.

---

### V-INFRA-3 · Resto de la verificación de la auditoría (paso 3) 🔒

**Prerrequisitos:** un usuario founder y uno con rol limitado en la misma org; una cuenta holding.

1. Con el usuario limitado, editar nombre y avatar en **Mi perfil**.
2. Como founder, cambiar tarifa por hora y rol de un miembro en **Equipo**.
3. **Configuración → País**: cambiar, guardar y recargar.
4. Abrir el dashboard del holding.

**Resultado esperado:** 1–3 guardan y persisten al recargar; 4 muestra MRR y actividad de cada negocio (la RPC `get_holding_dashboard_stats` corre con service role).

---

### V-INFRA-4 · Webhooks que antes rebotaban al login 🔒⚠️

**Prerrequisitos:** una integración de Whop o Commas en modo prueba; el bot de Discord corriendo.

1. Disparar un evento de prueba desde Whop o Commas.
2. `curl -i -X POST https://<app>/api/webhooks/mercadopago` sin firma.
3. Registrar un testimonio desde el bot (`/api/discord/testimonial`).
4. `curl -i -X POST https://<app>/api/discord/testimonial -H 'Authorization: Bearer undefined'`.

**Resultado esperado:** 1 → 200 y fila en `payment_webhook_events`; 2 → 401 o 503 (lo responde el handler), **nunca** 307; 3 → aparece en la app; 4 → 401.

---

### V-INFRA-5 · Integraciones que cambiaron de comportamiento con la auditoría 🔒

**Prerrequisitos:** permisos de admin en un servidor de Discord de prueba; si se usa, cuenta de Unipile; orgs con Fathom por la URL legacy.

1. Conectar Discord desde `/integrations`.
2. Unipile (sólo si sigue en uso): mandar un mensaje con el webhook registrado con header `Unipile-Auth`.
3. Webhook legacy de Fathom (`/api/integrations/fathom/webhook`) con dos o más orgs conectadas por esa vía.
4. Cambio de contraseña forzado con un usuario con contraseña temporal; y llamar a la acción sin cambiarla.
5. Provocar un error en un route handler en producción.

**Resultado esperado:** 1 → guarda el servidor correcto (el `guild` sale del token de OAuth; si vuelve `discord=error`, mirar si la respuesta del token trae `guild`); 2 → entra el mensaje (con `UNIPILE_WEBHOOK_SECRET` ya cargado en Vercel); 3 → 409 "use the per-member webhook URL" ⚠️ (hoy `FATHOM_WEBHOOK_SECRET` no está en Vercel: confirmar qué secreto tienen guardado esas orgs); 4 → cambia y baja la marca; sin cambiar, la marca sigue; 5 → el error aparece en Sentry.

---

### V-INFRA-6 · Permisos por módulo con un rol limitado 🔒⭐

**Prerrequisitos:** una cuenta con un rol que tenga Finanzas en "Sin acceso".

1. Abrir Equipo → Roles con un rol creado antes del 2026-09-06.
2. Entrar con la cuenta limitada: Finanzas no aparece en la navegación.
3. Tipear `/finance`, `/finance/expenses` y `/team/roles`.
4. Invitar a alguien sin rol y entrar con esa cuenta.
5. Con la cuenta limitada, entrar a `/onboarding`.
6. Con la cuenta limitada, invocar una Server Action de Finanzas desde la consola, y hacer `PATCH /rest/v1/team_roles` con su JWT.

**Resultado esperado:** 1 → permisos agrupados en 13 módulos; 3 → "No tenés acceso a Finanzas"; 4 → navega todo (a propósito); 5 → entra; 6 → ⚠️ **hoy responde y escribe** (`[PERMISOS-SERVER-ACTIONS]`). Cuando se arregle, tiene que rechazar.

---

### V-INFRA-7 · Buckets de Storage privados 🔒⚠️ — `[AUD-SEG-9]`

**Prerrequisitos:** dashboard de Supabase → Storage.

1. Revisar `client-payment-receipts`, `business-context-documents`, `sop-attachments`, `workboard-task-attachments`, `ai-brain-documents`.
2. Pedir un objeto de cada uno por la URL pública (`/storage/v1/object/public/<bucket>/<path>`).
3. Revisar las policies de `content-thumbnails`.

**Resultado esperado:** los cinco son privados y la URL pública da 400/404; `content-thumbnails` público de lectura (a propósito) y sin listado si no hace falta.

---

### V-INFRA-8 · Worker de reels en Fly.io 🔒

**Prerrequisitos:** `fly` CLI con acceso a la app `otc-reel-worker`.

1. `fly secrets list -a otc-reel-worker`.
2. `curl -i -X POST https://otc-reel-worker.fly.dev/ -d '{}'` sin credenciales.
3. Generar variaciones de un reel desde Marketing y seguir el job hasta `preview_ready`.

**Resultado esperado:** 1 → incluye `WORKER_AUTH_SECRET`, `SUPABASE_*`, `ANTHROPIC_API_KEY`, `QSTASH_*_SIGNING_KEY`; 2 → 401; 3 → llega a `preview_ready`. ⚠️ Si falta `WORKER_AUTH_SECRET` y las signing keys, el worker acepta requests de IPs internas (`[SEG-REEL-WORKER-AUTH]`).

---

### V-INFRA-9 · Railway después del renombre del repo ⚠️ — `[REPO-RENOMBRADO-DEPLOYS]`

**Prerrequisitos:** acceso a Railway.

1. Servicio del bot → Settings → Source.
2. Hacer un cambio trivial en `apps/discord-bot` y mergear a `main`.

**Resultado esperado:** repo `santiagozurbrigk/limitless-system`, `Root Directory = apps/discord-bot`; el merge dispara un deploy y el log muestra "ready". (Vercel ya verificado el 2026-09-23.)

---

### V-INFRA-10 · Crons corriendo y reportando fallas ⭐

**Prerrequisitos:** Vercel → proyecto → Crons y Logs.

1. Revisar que los 19 crons de `apps/web/vercel.json` figuren y su última ejecución.
2. Mirar `calendly-sync` y `calendly-sync-closers` de la misma hora.
3. Correr a mano un cron con `?organizationId=` (`curl -X POST …/api/cron/sync-content-metrics?organizationId=<uuid> -H "Authorization: Bearer $CRON_SECRET"`).

**Resultado esperado:** todos con ejecuciones recientes en 2xx; los fallos devuelven 500 (no `ok: true` con ceros); en 2, ⚠️ puede aparecer un error de índice único por las dos corridas simultáneas (`[AUD-CONF-3]`).

### V-INFRA-11 · Plan, cupos y backups de Supabase; copia de la master key ⚠️🔒 — `[DR-BACKUPS-SUPABASE]`, `[SUPABASE-PLAN-FREE-LIMITES]`

**Prerrequisitos:** acceso de owner a la organización de Supabase del proyecto `OTC`; acceso al gestor de secretos del equipo.

1. Supabase → Organization → Billing: anotar el plan y el uso de Database size y Storage size contra el cupo.
2. Supabase → Storage → Settings: anotar el límite global de subida.
3. Supabase → Database → Backups: ¿hay backups diarios listados? ¿PITR?
4. Confirmar que `ENCRYPTION_MASTER_KEY` de producción está guardada fuera de Vercel y quién tiene acceso (no copiar el valor en ningún doc).
5. Confirmar cuántos owners tienen Supabase, Vercel, Fly y Railway.

**Resultado esperado:** 1 → plan pago o, si sigue Free, uso de Storage < 50 % del cupo; 3 → al menos un backup de menos de 24 h (o el dump automático de `[DR-BACKUPS-SUPABASE]`); 4 → existe copia, con acceso de al menos dos personas; 5 → al menos dos owners. ⚠️ Al 2026-09-23: plan `free` (confirmado con la API de Supabase), sin backups, Storage ≈ 797 MB de 1 GB. Paso 4: la clave original se perdió (la copia que había no era la de producción). El 2026-10-02 se generó una nueva y Santiago Zurbrigk confirma que quedó guardada en el gestor, con acceso también de Martin (dos personas: cumple). Comprobación de que la copia es la buena: paso 0 de [`rotacion-master-key.md`](./rotacion-master-key.md).

### V-INFRA-12 · Ensayo de rotación de la master key 🔒⭐ — `[ENTORNO-STAGING]`

**Prerrequisitos:** el entorno de prueba de `[ENTORNO-STAGING]` (base y clave propias), con una integración cifrada de cada tipo cargada. Procedimiento: [`rotacion-master-key.md`](./rotacion-master-key.md).

1. Pasos 0 a 5 del procedimiento, con clave A = la actual y clave B = una nueva. Después de cargar B + A y redeployar, comprobar Zernio (bandeja), GHL (sync de citas), Fathom por miembro ("Sincronizar mis llamadas") y clave de Claude propia (Ajustes muestra `****xxxx`). Repetir después del re-cifrado y de sacar A.
2. 🔒 Webhook de pagos con secreto que no descifra: cargar una clave distinta sin la anterior y mandar un webhook a `/api/webhooks/whop?organizationId=<org con Whop>`.

**Resultado esperado:** 1 → todo anda con B + A y después sólo con B, y el script termina con 0 fallidas; 2 → responde **500** (no 404) y el log dice `[payments] no se pudo descifrar el secreto`. Anotar los conteos en `CHANGES.md` (sin valores).

### V-INFRA-13 · Fathom por miembro después del re-cifrado del 2026-10-02 🔒 — SCRUM-86

**Prerrequisitos:** un miembro con Fathom conectado en alguna de estas orgs: Academia RNS, Auletta, familiayformacion, Limitless (2 miembros), Limitless tester, Onboarding.

1. Integraciones → "Sincronizar mis llamadas" con ese miembro.

**Resultado esperado:** sincroniza sin error. Si dice que no se puede leer la credencial, el miembro reconecta su key (la nueva se guarda cifrada) y se anota acá.

### V-INFRA-14 · Fechas de noche con la hora de Argentina ⭐ · SCRUM-493

**Prerrequisitos:** preview o producción, una org con zona `America/Argentina/Buenos_Aires` (Ajustes), probar entre las 21:00 y las 23:59 de Argentina (o con el reloj de la computadora en esa franja y esa zona).

1. Closing: marcar una llamada como "no cerró" y elegir un próximo paso con fecha. Resultado: propone pasado mañana contando desde hoy, no un día más.
2. Seguimiento del lead: guardar un próximo paso con fecha. En la tabla de leads la celda muestra la misma fecha; cambiarla, recargar y ver que quedó la elegida.
3. Clientes: una tarea que vence hoy no aparece en rojo en la columna «Próxima tarea», en la ficha ni en el tablero de Workboard; una de ayer sí.
4. Revisión semanal (`/clients/revision`): un cliente con una cuota pendiente que vence hoy no figura con "pago atrasado".
5. Operaciones → Inputs semanales, un domingo a la noche: la semana que muestra es la que termina ese domingo.
6. Nuevo cliente, nuevo win, registrar hito, nuevo sprint y métrica de un lanzamiento: la fecha que aparece cargada es la de hoy.

**Resultado esperado:** en todos los pasos el día es el de Argentina. Si alguno muestra el día siguiente, anotar la pantalla y abrir el ítem en `PENDIENTES.md`.

## Escondido para el release de octubre (SCRUM-490)

**Prerrequisitos:** una sesión de founder en producción.

1. `/login` y `/superadmin/login`: "¿Olvidaste tu contraseña?" aparece desde SCRUM-16; "Crear cuenta" ya no (SCRUM-23).
2. Ajustes: no hay pestaña Notificaciones; `/settings?tab=notificaciones` abre General.
3. Ventas → Closing: no hay pestaña Equipo; `/sales/closing#equipo` muestra el calendario. En un turno con grabación, sólo el botón "Abrir en Fathom".
4. Marketing: el menú entra por Contenido; `/marketing` y `/marketing/sales-connection` llevan a Contenido; el detalle de una pieza no tiene "Atribución de ventas"; Administrar no tiene "Nueva carpeta".
5. Lead Magnets → crear: sólo DM de Instagram (elegido) y Manual.
6. Integraciones: no aparece ManyChat.
7. ⌘K: no aparecen Overview de Marketing, Conexión con Ventas, UTMs, Administrar ni "Recorrido guiado (demo)".
8. `/demo`, `/design-system` y `/redesign-preview` responden 404; `/lanzamientos` lleva al Panel.

## Alertas de procesos de fondo (SCRUM-84)

**Prerrequisitos:** plan Team de Sentry comprado, las reglas de [`alertas.md`](./alertas.md) creadas y `SENTRY_DSN` cargada en Railway y Fly. Hecho el 2026-10-09.

**Verificado el 2026-10-09:** Sentry → Monitors muestra 20 monitores (crons + Error + Uptime), cada uno con las alertas conectadas. `cron-calendly-sync` registra check-ins desde la compra del plan (antes: "Errors were encountered while ingesting check-ins").

1. Sentry → Crons: aparecen los 19 monitores, con el horario de `vercel.json`, después de su primera corrida.
2. ⭐ Error por org: en una org de prueba con GHL, poner un token inválido y esperar la corrida de las :00 de `cron-ghl-sync`. En Sentry aparece el issue con tag `org_id` de esa org y `provider=ghl`, y llega el mail.
3. Cron que no corre: en Sentry → Crons, un monitor sin check-in pasado su horario + 5 min queda en "missed". Se puede forzar pausando un cron en Vercel una hora, y a las 2 faltas llega el mail.
4. Job que agota reintentos: encolar un job de prueba contra un worker que responda 500 (por ejemplo `process-cron-sync-metrics` con una org inexistente). Después de los reintentos llega un issue "QStash: … agotó sus reintentos" con el worker y la org.
5. Bot de Discord y reel-worker: forzar un error (por ejemplo, un job de reel con un archivo inexistente). Aparece en Sentry con `app=reel-worker` / `app=discord-bot`.
6. Anotar fecha, quién recibió el mail y cuánto tardó.

## Salud y producción al día (SCRUM-85)

**Prerrequisitos:** el PR de SCRUM-85 mergeado y desplegado; la migración `20261007120000_corridas_de_procesos`
aplicada en producción (`limitless-auditoria/sql-produccion/scrum-85/`, con `02_verificacion.sql` en `todo_ok`).

1. ⭐ `curl -i https://www.optimizatucontrol.com/api/health` sin sesión: 200, `"status":"ok"`, los tres chequeos en
   `true`, `version.commit` igual a los 7 primeros caracteres del último commit de `main`, `version.entorno` =
   `production` y `Cache-Control: no-store`. Nada de mensajes, tablas ni variables.
2. ⭐ Monitor externo: crear la cuenta y el monitor con los pasos de [`alertas.md`](./alertas.md) § Monitor externo
   (UptimeRobot o Better Stack, aviso por mail o Discord). Forzar una alerta como dice el paso 5 y anotar quién la
   recibió y cuánto tardó. Anotar en este bloque qué servicio y qué cuenta quedaron.
3. ⭐ Workflow "Producción al día": la corrida del push del merge termina en verde (Actions). Para ver la falla sin
   tocar producción: Run workflow con `sha_esperado` = un commit que no esté desplegado y `plazo_segundos` = `60`;
   tiene que fallar con "Producción no está al día" y tiene que llegar el mail de GitHub.
4. Discord (opcional): crear el webhook del canal del equipo, guardarlo como secreto `DISCORD_WEBHOOK_ALERTAS` en
   GitHub y repetir el paso 3: el aviso llega al canal.
5. 🔒 Super-admin → Infraestructura: "Estado de la plataforma" con el commit desplegado y los chequeos en verde;
   "Procesos programados" con los 19 crons, y después de la primera hora, `OK` o `Parcial` con hora y orgs en los
   horarios (los 6 crons con fan-out figuran como `Encolado: N jobs encolados`, nunca como `OK`). Ninguno tiene que quedar `Sin cierre` de forma repetida (si pasa, es el corte de 60 s, `[CRONS-CORTE-60S]`).
6. En Supabase → SQL Editor, la consulta de [`alertas.md`](./alertas.md) § Registro de corridas: las filas coinciden
   con lo que muestra la página; a los 31 días, ninguna fila tiene más de 30 días.


## Tablero: errores como valor y crear sprint atómico (SCRUM-503)

**Prerrequisitos:** la migración `20261008120000_crear_sprint_atomico` aplicada en producción **antes** del merge
(`limitless-auditoria/sql-produccion/scrum-503/`: `00_precheck.sql`, `01_migracion.sql` y `02_verificacion.sql` en
`todo_ok`); el PR de SCRUM-503 mergeado y desplegado. Usar una org de prueba o una donde se pueda crear un sprint.

1. ⭐ Prueba de humo de `crear_sprint`: Tablero → "Nuevo sprint" con nombre y fechas. → Toast "Sprint creado ✓", el
   sprint nuevo aparece activo y el anterior pasa a completado. Es la primera vez que la llamada
   `.rpc("crear_sprint").single()` corre contra PostgREST real: si aparece "Ocurrió un error inesperado", revisar en
   Sentry el evento con `server_action = [createSprint]` (un `PGRST202` es la migración sin aplicar).
2. En Supabase → SQL Editor: `select organization_id, count(*) from public.sprints where status = 'active' group by 1
   having count(*) > 1;` no devuelve filas.
3. Mover una tarea a "Hecho", cargar 30 minutos y confirmar. → La tarea queda hecha con 30 minutos.
4. Con la red cortada (DevTools → Offline), mover una tarea entre columnas. → Toast "No se pudo mover la tarea" con
   "Ocurrió un error inesperado. Intentá de nuevo." y la tarjeta vuelve a su columna; nada del párrafo técnico de Next.

## Rotar el secreto del worker de Trial Reels (SCRUM-51)

Desde SCRUM-51 el secreto `WORKER_AUTH_SECRET` ya no viaja en la URL, pero el valor viejo quedó guardado en la consola de QStash y en logs viejos de Vercel y Fly. Hay que cambiarlo una vez.

1. Generar un valor nuevo: `openssl rand -hex 32` (no pegarlo en chats ni tickets).
2. Vercel → proyecto `otc-plaform` → Settings → Environment Variables → `WORKER_AUTH_SECRET` → reemplazar en Production (y Preview si está).
3. Fly: `fly secrets set WORKER_AUTH_SECRET=<nuevo> --app otc-reel-worker` (reinicia el worker con el valor nuevo) y `fly deploy --config apps/reel-worker/fly.toml` para subir el código que ya no acepta `?workerSecret=`.
4. Vercel → Deployments → el último de producción → **Redeploy** (para que tome la variable).
5. Probar: generar Trial Reels de una pieza. Esperado: el trabajo pasa de "pendiente" a "listo"; en la consola de QStash la URL destino **no** tiene `?workerSecret=`; en `fly logs` aparece `auth via X-Worker-Secret header OK`.
6. Las publicaciones de Trial Reels que ya estaban programadas con el valor viejo fallan con 401: se reintentan desde la pantalla.
## Backup automático de producción (SCRUM-11)

1. Cargar en GitHub (Settings → Secrets and variables → Actions) `SUPABASE_DB_URL` (Session pooler), `SUPABASE_SERVICE_ROLE_KEY` y `BACKUP_PASSPHRASE` (guardar también esta última en el gestor de claves).
2. Actions → **Backup de producción** → Run workflow → `todo`.
3. Esperado: los jobs `base` y `archivos` en verde; artifacts `base-…` (~20–30 MB) y `archivos-…` (~420 MB).
4. Bajar `base-…`, descifrar con la clave y abrir `data.sql`: tiene que tener `COPY` de `public.organizations` y `auth.users`.
5. Al día siguiente, ver que la corrida programada de las 06:23 UTC quedó en verde sola.
6. Ensayo de restauración en un proyecto descartable: `docs/operacion/backups-y-restauracion.md` § Restaurar; anotar tiempos en § Ensayos.

## Recuperar la contraseña (SCRUM-16)

**Prerrequisitos:** Resend configurado como SMTP de Supabase Auth (`entorno-y-deploy.md` § Mails de autenticación, pasos 1-6). Hecho el 2026-10-09.

**Verificado el 2026-10-09 (Santiago, cuenta real):** pasos 1 a 3: el mail llegó desde `noreply@send.limit-less.llc` y la contraseña nueva quedó guardada. Quedan los pasos 4 a 7.

1. `/login` → "¿Olvidaste tu contraseña?" → poner el mail de una cuenta real → aparece el mensaje neutro.
2. Llega el mail desde `noreply@send.limit-less.llc` (revisar spam) con asunto "Recuperá tu contraseña de Limitless".
3. Abrir el link, si se puede desde otro dispositivo: lleva a "Elegí tu contraseña nueva". Guardarla y entrar.
4. Volver a abrir el mismo link: el login avisa que venció o ya se usó.
5. Pedirlo con un mail sin cuenta: el mismo mensaje neutro y no llega nada.
6. Pedirlo 4 veces seguidas con el mismo mail: la cuarta dice que hay demasiados intentos.
7. Con todo bien, prender "Confirm email" (paso 9) y anotar acá la fecha. **Hecho el 2026-10-09** (`mailer_autoconfirm: false`).

