# Limitless Webinars: contratos de vista y escenario de ejemplo

SCRUM-542 (A2 del plan "UI primero, datos después"). Qué recibe cada pantalla de Webinars, de dónde sale hoy
y qué cambia cuando lea la base (B4). Es la referencia para construir Inicio (SCRUM-543), Lanzamientos
(SCRUM-544), Leads y la Ficha (SCRUM-545) y la Configuración del lanzamiento.

Código: `apps/web/lib/webinar/vistas/`. Las pantallas todavía no existen.

## La regla

**Cada pantalla llama sólo a su función de lectura y renderiza lo que devuelve.** No consulta la base, no
importa el escenario ni calcula números. Lo controla `las-pantallas-leen-de-su-funcion.test.ts`:

- Recorre los archivos `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` y `.cjs` de `apps/web` de fuera
  del módulo (sin `node_modules`, `.next`, `dist`, `.turbo`, `e2e` ni `coverage`). En cada uno resuelve los
  especificadores de `import ... from`, `import "x"`, `export ... from`, `import()` y `require()`, con
  comillas simples o dobles o un template sin `${}`. El alias `@/` y lo que no empieza con `.` (por el
  `baseUrl` de tsconfig) se resuelven desde la raíz de la app; lo relativo, desde la carpeta del archivo. Con
  o sin extensión. Falla si alguno cae en `lib/webinar/vistas/` y no es `leer`, `contratos` o `dato`.
- Adentro del módulo, con la misma resolución, sólo `leer.ts` importa el escenario.
- Un auto-test del detector prueba cada una de esas formas, y que deja pasar `leer`, `contratos`, `dato` y
  una carpeta que se llama parecido.
- `leer`, `calcular`, `escenario-de-ejemplo`, `org-de-demo` y `sin-lectura-real` empiezan con
  `import "server-only"`, y el mismo test lo verifica: si un Client Component los importa, el build falla.
  `dato` y `contratos` (y `filas`, que tiene sólo tipos) se pueden importar desde el cliente.

Lo que el test **no** ve: un especificador armado en ejecución (`import(variable)` o un template con `${}`),
un alias distinto de `@/`, y que `contratos` o `dato` reexporten `calcular` o `filas` (adentro del módulo
sólo se controla el escenario).

## Un número: `Dato<T>` (`dato.ts`)

Todo número (y toda lista que depende de una fuente) viaja como `{ value, state, source, reason, measuredAt }`:

| `state` | `value` | Qué significa | Qué muestra la pantalla |
|---|---|---|---|
| `medido` | el valor | La fuente respondió y está al día | El número |
| `desactualizado` | el último conocido | Hay valor, pero la última lectura es vieja | El número con una marca y `reason` |
| `sin_fuente` | `null` | La integración que lo mide no está conectada | "Sin fuente" y `reason` (p. ej. "Conectá…") |
| `falta_configurar` | `null` | Falta un dato del lanzamiento para medirlo | "Falta configurar" y `reason` (enlace a Configuración) |
| `error` | `null` | La última lectura de la fuente falló | "Error" y `reason` |

- `reason` es texto para el usuario (voseo); `null` sólo en `medido`.
- `source` es la fuente (`FUENTES_DEL_DATO`: las de `lead_events.source` más `meta_ads`, `configuracion` y
  `calculado`). Etiquetas para la interfaz: `ETIQUETA_DE_FUENTE` y `ETIQUETA_DEL_ESTADO`.
- `measuredAt` es la fecha de la lectura (ISO, UTC); `null` si nunca se leyó.
- Es una unión discriminada: para leer `value` como número hay que mirar `state` o usar `tieneValor(dato)`.
- **Nunca un cero inventado.** Cero sólo aparece si se midió cero.

Los números que salen de otros usan `derivar`, `sumar`, `tasa` y `cociente`: si una entrada no tiene valor,
el resultado tampoco, y toma el estado y el motivo de la peor (error > falta configurar > sin fuente >
desactualizado). Si todas tienen valor y alguna está desactualizada, el resultado se calcula y queda
desactualizado. Una tasa con cero en el denominador es `medido` con `value: null` (se muestra "—").

## Las seis funciones (`leer.ts`)

Server-side (`import "server-only"`), cada una con `requireOrganizationId()`. Sin sesión lanzan el
`ErrorEsperable` de siempre.

| Pantalla | Función | Devuelve |
|---|---|---|
| Inicio del lanzamiento activo (543) | `leerInicio()` | `VistaInicio` |
| Lista de lanzamientos (544) | `leerListaDeLanzamientos()` | `VistaListaDeLanzamientos` |
| Detalle del lanzamiento (544) | `leerDetalleDelLanzamiento(launchId)` | `Lectura<VistaDetalleDelLanzamiento \| null>` |
| Leads (545) | `leerLeads({ launchId, filtro, busqueda, cursor })` | `VistaLeads` |
| Ficha del lead (545) | `leerFichaDelLead(leadId, launchId?)` | `Lectura<VistaFichaDelLead \| null>` |
| Configuración del lanzamiento | `leerConfiguracionDelLanzamiento(launchId)` | `Lectura<VistaConfiguracionDelLanzamiento \| null>` |

Los tipos están en `contratos.ts`. Lo principal:

- Toda vista lleva **`esEjemplo`**. Con `true`, la pantalla pone arriba
  `<CartelDatosDeEjemplo visible={vista.esEjemplo} />` (`components/webinar/cartel-datos-de-ejemplo.tsx`): un
  cartel fijo (sticky) "Datos de ejemplo". Con `false` no dibuja nada, así que se puede poner siempre.
- **Inicio**: `activo: Dato<InicioDelLanzamientoActivo | null>`. `medido` con `null` = no hay lanzamiento
  activo (vacío con botón a crear uno). Adentro: resumen del lanzamiento, días para el cierre (desde el hoy de
  la zona de la organización), próxima sesión,
  registrados (total y últimas 24 h), embudo, tasas, ventas, anuncios (sólo variantes pagas), sesiones,
  pendientes del equipo (levantaron la mano sin contactar, agendados sin cerrar) y el estado de las fuentes.
- **Lista**: `lanzamientos: Dato<FilaDeLanzamiento[]>`, activos primero; cada fila con registrados,
  asistieron, ventas e ingresos.
- **Detalle**: lo mismo que Inicio para cualquier lanzamiento, más registros por origen (`utm_source`).
- **Leads**: selector de lanzamientos, los cinco filtros listos con su conteo (`FILTROS_DE_LEADS`), el total
  del filtro y la búsqueda, la página (50 filas, `LEADS_POR_PAGINA`, del registro más nuevo al más viejo) y
  `siguienteCursor` (opaco; `null` si no hay más). Filtro, búsqueda, lanzamiento y cursor van en la URL; el
  filtro llega como texto y uno que no está en `FILTROS_DE_LEADS` se toma como `todos`. Un
  filtro que depende de una fuente sin conectar trae el conteo, el total y las filas en `sin_fuente`: nunca
  lista a todos los registrados como "sin asistir".
- **Ficha**: datos de contacto, `whatsappUrl` (`null` sin teléfono), registros por lanzamiento con origen y
  calificación, línea de tiempo con la fuente y quién cargó cada evento, `avisosDeFuentes` (las fuentes que
  no están al día: "GoHighLevel no está conectado…"), estado de venta, notas, compras y el equipo para
  asignar responsable.
- **Configuración**: sesiones (ID de Zoom, segundo de la oferta), campañas, productos (principal y VIP), lo
  que falta cargar (`faltantes`, con el motivo de cada uno) y el estado de las fuentes. Sin metas de ventas
  (Martín, 28-oct).

Las tres pantallas de un lanzamiento o de un lead devuelven `Lectura` (`lib/client/correr-accion.ts`):

```tsx
const lectura = await leerDetalleDelLanzamiento(params.id);
if (!lectura.ok) return <ErrorDeCarga motivo={lectura.motivo} />;
if (!lectura.data) notFound();
const vista = lectura.data;
```

Fechas en ISO UTC (las de calendario, `AAAA-MM-DD`), montos en la moneda del lanzamiento, tasas entre 0 y 1.
Las vistas son JSON: se pueden pasar enteras a un Client Component.

## Qué recibe cada organización hoy

- **La organización de demo**: el escenario de ejemplo, con `esEjemplo: true`. Se identifica con la variable
  de entorno de servidor **`WEBINAR_DEMO_ORGANIZATION_ID`** (el UUID de la org). Sin la variable, vacía o con
  algo que no es un UUID, **ninguna** organización ve el ejemplo. Nunca se decide por la URL, una cookie o el
  nombre. Cuál es la org de demo y quién la crea lo decide SCRUM-522; después se carga la variable en Vercel.
- **Cualquier otra**: `esEjemplo: false` y todo `sin_fuente` con el motivo "Todavía no podemos mostrar los
  lanzamientos de tu organización…" (`sin-lectura-real.ts`); las pantallas de un lanzamiento o de un lead,
  "no existe" (`{ ok: true, data: null }`). Nunca un dato inventado ni un "no tenés lanzamientos": no se
  leyó nada. Un test lo verifica con la variable cargada, sin cargar y vacía.

## El escenario de ejemplo (`escenario-de-ejemplo.ts`)

Determinístico (generador con semilla 542, sin `Math.random`). Las fechas se arman hacia atrás desde la hora
actual, así que el lanzamiento activo se ve en curso cualquier día y la paginación es estable dentro de la
hora. Las de calendario (captación y cierre) salen del hoy de la zona de la organización, como las cargaría
el dueño: el activo cierra en 3 días a cualquier hora.

- Un lanzamiento **activo, variante Pago** (USD 997, cierra en 3 días, 2 sesiones de Zoom ya ocurridas) y uno
  **cerrado, Orgánico** (USD 497, 1 sesión).
- **300 leads**: 210 en el activo, 120 en el cerrado, 30 en los dos. Recorridos coherentes: nadie asiste a una
  sesión anterior a su registro, nadie compra sin haber asistido, cada etapa viene después de la anterior.
- Ventas por Whop, llamadas por Calendly, contactos y calificación del equipo (dos setters y una closer de
  ejemplo), notas.
- Los cinco estados: **medido** (registros, asistencia, llamadas, ventas); **sin fuente** (confirmaron el
  email: GoHighLevel sin conectar); **falta configurar** (se quedaron a la oferta: la sesión 2 no tiene el
  minuto de la oferta, y por eso el total); **desactualizado** (inversión en Meta Ads leída hace 3 días, y el
  costo por registro, por venta y el ROAS); **error** (ventas VIP: Commas rechazó la clave).
- Contactos que no son de nadie: emails `@example.com` (RFC 2606) y teléfonos +44 7700 900xxx (rango que
  Ofcom reserva para ficción): el botón de WhatsApp no abre el chat de una persona real. Los IDs empiezan con
  `e1e1e1e1-0000-4000-8`.

"Compraron" incluye a quien compró en la oferta sin llamada: puede superar a "Asistieron a la llamada", nunca
a "Asistieron".

Dos reglas que valen también para los datos reales (viven en `calcular.ts`):

- "Asistieron" y "Se quedaron a la oferta" del lanzamiento cuentan **personas distintas** de las sesiones que
  ya ocurrieron, con el peor estado entre esas sesiones. Si alguien vuelve a otra sesión, suma en el detalle
  de esa sesión pero no en el total.
- Cada reembolso se asocia a una compra concreta: la más vieja todavía cobrada del mismo lead, lanzamiento y
  producto. Con dos compras y un reembolso, una queda cobrada. Un reembolso del VIP no toca las ventas, los
  ingresos ni los reembolsos de la oferta principal. Si un reembolso no corresponde a ninguna compra, los
  ingresos quedan en `error`, porque no se sabe qué producto devolvió.

## Qué cambia en B4

**Queda estable:** los tipos de `contratos.ts` (lo que recibe cada pantalla) y las firmas de las seis
funciones de `leer.ts`. Las pantallas no se tocan.

**Cambia:**

- `leer.ts`: la rama de "cualquier otra organización" deja de devolver `sin-lectura-real.ts` y lee de la base.
- `calcular.ts`: hoy trabaja con **filas de eventos en memoria**, no con conteos. Arma los conjuntos de
  `lead_id` de cada tipo de evento (`leadsPorTipo`), y los filtros de Leads son diferencias entre esos
  conjuntos. La asistencia por sesión, el total de personas distintas y la asociación de cada reembolso con
  su compra recorren los eventos uno por uno. La página y el cursor de Leads también se resuelven en memoria:
  se cortan todos los registros del lanzamiento y el cursor es un desplazamiento (`o<n>`). Pasarle las filas
  de la base tal cual alcanza para una org chica (el escenario tiene unos 300 leads y 1.000 eventos), pero
  con una org grande carga todos los eventos en cada pedido. Una consulta agrupada devuelve conteos, no
  filas, así que no se puede pasar por estas funciones sin cambiarlas. Para leer agregados o paginar en la
  base hay que reescribir esas partes: los conteos por tipo y por sesión, los conjuntos de los filtros, la
  página y el cursor (que puede pasar a ser por clave y sigue opaco para la pantalla). Las reglas de estado
  de cada número (`datoDeFuente`, `derivar` y los motivos) no dependen de eso.
- `filas.ts` copia el modelo propuesto en SCRUM-526 (PR #141) y suma lo que ese modelo todavía no tiene:
  estado de venta (`lead_sales_state`), notas, `report_status` de las sesiones e inversión por lanzamiento
  (SCRUM-535). Si el modelo final cambia un nombre, hay que cambiarlo ahí, en la lectura y en `calcular.ts`.
- La lectura real tiene que resolver el estado de cada fuente de la organización (`EstadoDeFuente`), con su
  regla de "desactualizado". Una consulta caída va como `error` en el número o la lista que no se pudo leer,
  o como `{ ok: false, motivo }` en las tres pantallas de un lanzamiento o de un lead.

## Tests

`apps/web/lib/webinar/vistas/__tests__/` y `components/webinar/__tests__/`: el `Dato` y sus combinaciones;
el escenario (determinismo, tamaño, contactos falsos, coherencia de cada recorrido y del embudo); las seis
vistas (claves estables, los cinco estados en el número que corresponde, coherencia entre pantallas, Leads
con filtros, búsqueda y paginación, reglas de estado sin el escenario, asistentes distintos entre sesiones,
reembolsos asociados a su compra, motivos iguales en el número y en Configuración); las funciones de
lectura (sólo la org de demo recibe el ejemplo, con las fechas en la zona de la org); quién importa el módulo
(con el auto-test del detector) y qué archivos son sólo de servidor; el cartel.

## A definir

- La organización de demo y su id (SCRUM-522).
- Lo que dicen las fichas del día 6 (SCRUM-549): si la lista de Leads es por lanzamiento, qué etapas se
  muestran, si las notas son eventos, qué es "origen". El contrato sigue el borrador.
- Los nombres de los valores de `report_status` (integración de Zoom, Fase 2).
