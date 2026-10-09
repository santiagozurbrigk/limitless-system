# Estado de Limitless: resumen para el equipo

Resumen de una página para Agustín, Fernando, Martín, Santiago y Matías. Fecha: 2026-09-23. Responde al
pedido de Fernando del 23/09: tener un documento de requerimientos que diga exactamente lo que el software
hace, del que Martín arme el backlog.

## Qué hay y dónde

| Para qué | Dónde | Para quién |
|---|---|---|
| Qué puede hacer hoy el usuario en cada área y si funciona | [`FUNCIONAL.md`](./FUNCIONAL.md) | Agustín, Martín, Fernando |
| Todo lo pendiente, con prioridad y criterio de aceptación | [`../PENDIENTES.md`](../PENDIENTES.md) | Martín, devs |
| El mismo backlog listo para importar a Jira | [`backlog/jira-import.csv`](./backlog/jira-import.csv) · [cómo importarlo](./backlog/README.md) | Martín |
| Cómo está construido cada área | [`README.md`](./README.md) → `areas/`, `arquitectura/` | Fernando, devs |
| Qué falta probar a mano con cuentas reales | [`operacion/verificacion-manual.md`](./operacion/verificacion-manual.md) | quien pruebe |
| Informe de auditoría (seguridad, confiabilidad, backups) y plan de remediación | [`auditoria/README.md`](./auditoria/README.md) | Fernando, Agustín |

Todo se contrastó contra el código del 23/09. En la base de producción sólo se miró la estructura, no los
datos de clientes.

## Cómo está cada área

228 funcionalidades en total: **106 funcionan**, 63 funcionan con fallas, 12 no funcionan, 22 están a medias
y 25 nunca se probaron con cuentas reales.

| Área | En una frase |
|---|---|
| **Producto** | La más sana: 13 de 15 funcionan. Los "insights" del avatar sólo repiten lo cargado |
| **Clientes** | Sólida: 20 de 28 funcionan. El onboarding por link nunca se usó en producción |
| **Operaciones y equipo** | Funciona casi todo, pero un miembro "desactivado" sigue entrando, y la tarifa por hora no tiene dónde cargarse |
| **Agente de IA** | El agente y la base de conocimiento andan. Reportes e inteligencia leen tablas viejas vacías, y el reporte mensual casi nunca sale |
| **Finanzas** | Anda, pero suma dólares y pesos sin convertir, y cualquier miembro puede editar montos |
| **Ventas** | La bandeja y Closing andan con fallas: Closing pierde los turnos más nuevos pasando los 1.000. La pantalla de Llamadas siempre está vacía, las métricas de DMs están en cero y el Fathom conectado por cada miembro no guarda ninguna grabación automática (sólo entra con el botón de sincronizar) |
| **Embudos** | El motor funciona, pero los avisos de pago de Whop, Commas y GoHighLevel se pueden perder sin aviso. VTurb, WebinarJam y Hyros nunca se probaron |
| **Marketing** | La más afectada: sin Zernio propio, una organización puede ver datos de la cuenta global de Zernio. Varias pantallas leen datos viejos de Instagram |
| **Plataforma** | Permisos sólo de fachada, "¿Olvidaste tu contraseña?" no hace nada y las notificaciones por mail no existen |
| **Discord** | Construido, pero nunca probado contra un servidor real |

## Lo grave: 13 problemas que van antes que cualquier cosa nueva (P0)

La auditoría completa está en [`auditoria/README.md`](./auditoria/README.md) y el orden para arreglarlos, en
[`auditoria/plan-de-remediacion.md`](./auditoria/plan-de-remediacion.md). Cada ítem tiene severidad (cuánto daño
hace), riesgo, impacto y criterio de aceptación en el backlog.

**Críticos (7):**

1. ~~**No hay backups.**~~ Resuelto el 2026-10-09 (SCRUM-11): plan Pro de Supabase con backup diario y dump
   cifrado propio en GitHub Actions (`DR-BACKUPS-SUPABASE`).
2. ~~**Cualquier miembro, aunque sea de sólo lectura, puede borrar su organización entera** con una llamada
   (`DB-VISTA-CLAUDE-STATUS-ESCRIBIBLE`).~~ Resuelto el 2026-09-29.
3. ~~**Se puede conectar una integración a otra organización** conociendo su identificador (`OAUTH-ESTADO-SIN-FIRMA`).~~ Resuelto el 2026-09-30.
4. ~~**Un espacio de archivos viejo deja a cualquier usuario leer y borrar lo que importaron otras organizaciones**
   (`SEG-BUCKET-IMPORT-FILES`; tiene 2 archivos).~~ Resuelto el 2026-09-29 (el bucket se borró).
5. ~~**Un miembro desactivado sigue entrando y viendo todo** (`EQUIPO-DESACTIVAR-NO-BLOQUEA`).~~ Resuelto el 2026-09-29.
6. **Los avisos de pago de Whop, Commas y GoHighLevel se pueden perder sin que nadie se entere** (`EMBUDOS-WEBHOOK-PERDIDA`).
7. ~~**Una organización sin Zernio propio usa la cuenta global de Zernio** (`ZERNIO-KEY-GLOBAL`).~~ Resuelto el 2026-09-29.

**Altos (5):**

8. **Los permisos sólo esconden pantallas**: un usuario de sólo lectura puede editar o darse más permisos por
   detrás (`PERMISOS-SERVER-ACTIONS` y su parte de base de datos `PERMISOS-SERVER-ACTIONS/infra`). Parte A
   resuelta el 2026-09-29: equipo, configuración de la org y borrar clientes ya piden rol; queda el permiso
   por módulo.
9. ~~**La pantalla de Llamadas de venta no muestra ninguna llamada** (`LLAMADAS-EMBED-ROTO`).~~ Resuelto el 2026-09-28.
10. ~~Closing deja afuera los turnos más recientes cuando una organización pasa de 1.000~~ (resuelto 2026-10-04, SCRUM-4).
11. ~~**La IA falla sin clave global confirmada** (`1A1-CLAVE-ANTHROPIC-ROTA`).~~ Resuelto el 2026-10-02 con otra regla: sin clave propia no hay IA, y la plataforma lo avisa (SCRUM-7).

**Medio (1, resuelto):** ~~el link de vuelta del login (`AUTH-CALLBACK-NEXT`)~~. Resuelto el 2026-09-30.

Al escribirse este estado (2026-09-23) ninguno estaba arreglado: la auditoría no toca código. Los marcados como
resueltos se cerraron después, con su fecha. Varios de los críticos se cierran esta misma semana con
cambios de configuración o migraciones de pocas líneas (fase 0 del plan).

## Lo que Fernando temía: documentos que dicen una cosa y código que hace otra

Las especificaciones viejas (hoy en `docs/archivo/`) prometen cosas que no existen o existen distinto. Cada
área de `FUNCIONAL.md` las lista en "Prometido y no existe". Las más relevantes:

- Un panel general con riesgos, oportunidades y recomendaciones de IA: los componentes existen, pero no se muestran.
- Integraciones con Loom, Notion, Airtable y Google Docs/Sheets: no existen.
- Métricas de setters y detección automática de agendas: sólo hay métricas por closer y análisis manual.
- Comparador de embudos, semáforo de salud e historia por período: no existen en pantalla (el semáforo está calculado, pero no se muestra).
- Exportar reportes a PDF, detección de SOPs desactualizados, pronósticos: no existen.
- El super admin crea las cuentas a mano: en realidad, cualquiera puede crearse una cuenta desde el login.

## Lo que tiene que decidir Agustín

1. **Qué entra en octubre.** Completar la columna "Octubre" de `FUNCIONAL.md` (`Sí` / `No` / `Después`).
   Con eso se ordenan los primeros sprints.
2. **Siete decisiones de negocio que ya bloquean trabajo (P1):**
   - ~~¿El alta de cuentas es pública o sólo por invitación?~~ Decidido el 2026-10-09: sólo por invitación (SCRUM-23).
   - Cuánto tiempo se guardan los mensajes de Discord de terceros (`E-RETENCION`)
   - Qué se hace con los clientes viejos sin mail (`CLIENTES-SIN-MAIL`)
   - Cómo se avisa que quien no tiene Ventas deja de ver montos en Clientes (`COBROS-AVISAR-PERMISOS`)
   - Si el dinero y los anuncios se miden por embudo o por organización (`EMBUDOS-MEDIDAS-POR-EMBUDO`)
   - Conseguir la API key de WebinarJam (`WEBINARJAM-API-KEY`)
3. **Prioridad de la investigación de librerías tipo HubSpot/Pipedrive/Salesforce** (`INVESTIGAR-LIBRERIAS-CRM`, hoy en P3).
4. **Jira o `PENDIENTES.md`: cuál manda** una vez importado el backlog.

Además, lo que quedó abierto en la reunión: el rol de Matías y las horas semanales de cada uno.

## Próximos pasos sugeridos

1. **Esta semana, fase 0 del [plan de remediación](./auditoria/plan-de-remediacion.md)**: backup de la base,
   decidir el plan de Supabase, y cerrar la vista que borra organizaciones, el espacio de archivos abierto y el
   secreto filtrado del worker.
2. Agustín completa la columna Octubre y las decisiones de arriba (incluido el plan de Supabase).
3. Martín importa a Jira las primeras 105 filas del CSV (P0 y P1), crea las épicas por área y suma las
   [historias de usuario](./backlog/historias.md) (122, una por funcionalidad que hoy no funciona bien), revisando
   el "para qué" de las que están marcadas para confirmar.
4. Fernando revisa los 13 P0 y el [informe de auditoría](./auditoria/README.md) contra su propia revisión, y
   define con Agustín las prioridades que la severidad sugiere cambiar.
5. Con eso, se arman los dos sprints hasta la segunda semana de octubre: fase 1 (acceso y aislamiento) y fase 2
   (plata, datos y avisos), más lo que Agustín marque para octubre.
