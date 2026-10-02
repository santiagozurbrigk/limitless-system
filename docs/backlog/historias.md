# Historias de usuario

Una historia por cada funcionalidad de [`../FUNCIONAL.md`](../FUNCIONAL.md) que **hoy no funciona bien**
(estado "Con fallas", "No funciona", "A medias" o "Sin verificar"). Las que ya funcionan no generan trabajo y
quedan como catálogo en el documento funcional.

Armado el 2026-09-23 para Martín (backlog en Jira) y Agustín (qué entra en octubre).

## Cómo se lee cada historia

```
### [H-VEN-10] Título en lenguaje del usuario
- Funcionalidad:  la fila de FUNCIONAL.md de la que sale, con su estado de hoy
- Historia:       Como <quién>, quiero <qué>, para <para qué>.
- Criterios de aceptación: cómo se prueba que quedó hecha (Dado… cuando… entonces…)
- Tareas técnicas: los ítems de PENDIENTES.md que hay que resolver para cumplirla
- Para confirmar: dudas para Agustín o Martín (sobre todo, el "para qué" cuando se dedujo)
```

- **Épicas = áreas** (cada `##` de este archivo).
- **La prioridad no se escribe acá**: la de cada historia es la de su tarea técnica más urgente, y la calcula el
  script. Si cambia la prioridad de una tarea en `PENDIENTES.md`, cambia la de la historia.
  Por eso hay más historias P0 que tareas P0: una misma tarea P0 destraba varias historias (al 2026-09-23, 23
  historias P0 dependen de sólo 8 tareas P0; por ejemplo, el control de permisos está detrás de 7 historias, y la
  clave global de Zernio y la clave de IA, de 4 cada una). Conviene planificar por tarea P0, no por historia.
- **"Octubre" se marca en `FUNCIONAL.md`** (columna Octubre de la fila), no acá. El script la copia a Jira.
- **La seguridad y la deuda técnica pura no son historias**: no son algo que "un usuario quiere" (backups,
  permisos en la base, secretos). Siguen como tareas en [`../../PENDIENTES.md`](../../PENDIENTES.md) y en
  [`jira-import.csv`](./jira-import.csv).

## Para Jira

```bash
python3 docs/backlog/historias_a_jira.py --check   # valida
python3 docs/backlog/historias_a_jira.py           # escribe historias-jira.csv
```

La validación falla si una funcionalidad con problemas no tiene historia, si una historia cita una tarea que no
existe en `PENDIENTES.md`, o si la historia no sigue "Como …, quiero …, para …".

`historias-jira.csv` se importa igual que [`jira-import.csv`](./README.md) (Issue Type `Story`). Conviene
importar primero las tareas técnicas y después las historias; cada historia lista los IDs de sus tareas
(columna "Tareas técnicas" y descripción) para vincularlas en Jira ("is blocked by"). Las etiquetas traen el
área (para asignar la épica en bloque), la prioridad calculada, la severidad, `octubre-*` y `para-confirmar`.

**Qué revisa Martín:** la redacción y, sobre todo, el "para qué" de las historias marcadas `para-confirmar`.
**Qué decide Agustín:** la columna Octubre y las dudas de "Para confirmar".

Quien agregue o cambie una funcionalidad actualiza su historia acá, en el mismo cambio que `FUNCIONAL.md`.

## Plataforma

### [H-PLA-01] Entrar a mi cuenta de forma segura
- **Funcionalidad:** F-PLA-01 · Con fallas
- **Historia:** Como miembro del equipo, quiero entrar con mi email y contraseña sin que un tercero pueda dejarme afuera y sabiendo que quien fue dado de baja ya no entra, para trabajar tranquilo y que los datos del negocio queden sólo en manos de quien corresponde.
- **Criterios de aceptación:**
  - Dado que alguien prueba seis veces una contraseña equivocada con mi email desde otra computadora, cuando yo intento entrar desde la mía, entonces puedo entrar igual.
  - Dado que alguien prueba muchas contraseñas contra emails distintos desde un mismo lugar, entonces queda bloqueado y, después de varios intentos fallidos, la pantalla de ingreso le pide un captcha.
  - Dado un miembro con la sesión abierta, cuando el founder lo desactiva en Equipo, entonces al recargar cualquier pantalla queda sin acceso y si vuelve a intentar entrar con su contraseña es rechazado.
  - Después de entrar, siempre termino dentro de la aplicación (nunca en otro sitio, aunque el link traiga una dirección externa), y hay pruebas automáticas que cubren el ingreso, el bloqueo de desactivados y el caso del holding.
- **Tareas técnicas:** `[LOGIN-RATE-LIMIT]`, ~~EQUIPO-DESACTIVAR-NO-BLOQUEA~~ (resuelta en SCRUM-8), ~~AUTH-CALLBACK-NEXT~~ (resuelta en SCRUM-2), `[TESTS-AUTH]`
- **Para confirmar:** —

### [H-PLA-02] Decidir quién puede crear una cuenta de founder
- **Funcionalidad:** F-PLA-02 · Con fallas
- **Historia:** Como super admin de Limitless, quiero que sólo se creen cuentas de founder por el camino que decidamos, para no pagar uso de IA de cuentas que nadie dio de alta ni cobra.
- **Criterios de aceptación:**
  - La decisión de si el alta de founders es pública o sólo por Limitless (o por la prueba gratis) quedó tomada y escrita en la documentación.
  - Si el alta es cerrada: la pantalla de ingreso ya no muestra "Crear cuenta" y cualquier intento de crear una cuenta por fuera de Limitless es rechazado.
  - Si el alta sigue abierta: el intento repetido desde un mismo lugar queda frenado y el mensaje al registrarse no revela si el email ya tiene cuenta.
- **Tareas técnicas:** `[SIGNUP-PUBLICO]`
- **Para confirmar:** Agustín: ¿el alta de founders es pública o sólo por Limitless / prueba gratis?

### [H-PLA-03] Recuperar una contraseña olvidada
- **Funcionalidad:** F-PLA-03 · A medias
- **Historia:** Como miembro del equipo, quiero recuperar mi contraseña por mail cuando me la olvido, para no quedar afuera esperando que alguien me resetee el acceso a mano.
- **Criterios de aceptación:**
  - Dado que estoy en la pantalla de ingreso, cuando toco "¿Olvidaste tu contraseña?", entonces me pide el mail y muestra el mismo mensaje exista o no una cuenta con ese mail.
  - Dado que mi cuenta existe, cuando abro el link del mail que me llega, entonces caigo en la pantalla para poner una contraseña nueva dentro de la aplicación, la guardo y puedo entrar con ella.
  - Un mail que no tiene cuenta no recibe nada y la pantalla no deja adivinar que no existe.
- **Tareas técnicas:** `[AUTH-RECUPERAR-PASSWORD]`, ~~AUTH-CALLBACK-NEXT~~ (resuelta en SCRUM-2)
- **Para confirmar:** Martín: el login interno del staff de Limitless tiene el mismo link que no hace nada; ¿entra en esta historia o se saca de esa pantalla?

### [H-PLA-06] Que los roles del equipo realmente limiten lo que cada uno puede cambiar
- **Funcionalidad:** F-PLA-06 · Con fallas
- **Historia:** Como founder, quiero que los roles que armo por módulo ("sin acceso", "ver", "completo") limiten también lo que cada persona puede modificar, para confiarle la cuenta a mi equipo sin que nadie se dé más permisos de los que le di.
- **Criterios de aceptación:**
  - Dado un miembro cuyo rol tiene Finanzas, Integraciones y Ajustes en "sin acceso", cuando intenta por fuera de la pantalla cambiar la clave de Claude, desconectar una integración, cambiar comisiones de closers o tocar la configuración de Discord, entonces recibe un error de permiso y no cambia nada.
  - Ese mismo miembro no puede modificar su propio rol para darse acceso completo, ni tocar invitaciones, datos de la organización, finanzas o integraciones; el founder sí puede.
  - Se probó el bloqueo con una segunda cuenta con rol limitado y el resultado de cada paso quedó anotado.
- **Tareas técnicas:** `[PERMISOS-SERVER-ACTIONS]`, `[PERMISOS-VERIFICAR-SESION]`
- **Para confirmar:** —

### [H-PLA-07] Que un miembro no pueda abrir los módulos donde no tiene acceso
- **Funcionalidad:** F-PLA-07 · Con fallas
- **Historia:** Como founder, quiero que un miembro del equipo no pueda abrir de ninguna forma las pantallas de los módulos que le dejé "sin acceso", para que cada uno vea sólo lo que le corresponde.
- **Criterios de aceptación:**
  - Dado un miembro sin acceso a Finanzas que está en el Panel, cuando abre Finanzas desde la paleta ⌘K o desde un link interno, entonces ve "No tenés acceso" igual que si tipeara la dirección, y la paleta ni siquiera le ofrece Finanzas.
  - Dado un miembro sin acceso a Operaciones, cuando abre el Área del fundador, entonces ve "No tenés acceso"; el founder la sigue viendo.
  - Dado un miembro invitado sin rol asignado, cuando entra, entonces el menú y el bloqueo de pantallas se comportan con una misma regla (no puede abrir por dirección lo que el menú no le muestra, ni al revés).
  - Se probó con una segunda cuenta con rol limitado y el resultado de cada paso quedó anotado.
- **Tareas técnicas:** `[PERMISOS-LAYOUT-NAV-SUAVE]`, `[NAV-PALETA-PERMISOS]`, `[PERMISOS-FOUNDER-AREA]`, `[PERMISOS-SIN-ROL-NAV]`, `[PERMISOS-VERIFICAR-SESION]`
- **Para confirmar:** Agustín: un miembro sin rol asignado, ¿ve todo en modo lectura o se obliga a elegir un rol al sumarlo?

### [H-PLA-08] Navegar con un menú que muestre sólo lo que tengo
- **Funcionalidad:** F-PLA-08 · Con fallas
- **Historia:** Como miembro del equipo, quiero que la barra superior y la paleta ⌘K me muestren sólo los módulos que tengo habilitados y que mi organización contrató, para no toparme con pantallas que no puedo usar.
- **Criterios de aceptación:**
  - Dado un miembro sin acceso a un módulo, cuando abre la paleta ⌘K, entonces ese módulo no aparece.
  - Dado un módulo adicional que la organización no contrató, entonces no aparece ni en la barra ni en la paleta.
  - Dado un holding con módulos adicionales distintos a los de uno de sus negocios, cuando entra a ese negocio, entonces el menú muestra los módulos del negocio y no los del holding.
  - Se recorrió la barra con una sesión real (menús desplegables, cambio de negocio del holding, contador de Clientes, perfil y versión celular) y el resultado quedó anotado.
- **Tareas técnicas:** `[NAV-PALETA-PERMISOS]`, `[ADDONS-HOLDING]`, `[NAV-1]`
- **Para confirmar:** —

### [H-PLA-09] Ver el portfolio del holding sólo si lo administro
- **Funcionalidad:** F-PLA-09 · Con fallas
- **Historia:** Como admin del holding, quiero ver el portfolio de mis negocios con sus números y que las personas del holding que no lo administran no puedan verlo, para proteger los datos de clientes de cada negocio.
- **Criterios de aceptación:**
  - Dado que soy founder o admin del holding, cuando abro el portfolio, entonces veo mis negocios con sus números como hoy.
  - Dado un miembro del holding que no es founder ni admin, cuando intenta ver datos de los negocios (incluso forzando el cambio de negocio a mano o por fuera de la pantalla), entonces no ve clientes, llamadas ni conversaciones de ningún negocio.
- **Tareas técnicas:** `[HOLDING-PORTFOLIO-ROL]`
- **Para confirmar:** —

### [H-PLA-10] Operar uno de mis negocios desde el holding
- **Funcionalidad:** F-PLA-10 · Con fallas
- **Historia:** Como admin del holding, quiero entrar a uno de mis negocios, trabajar como si fuera su founder y volver a la vista del holding, para gestionar cada negocio sin tener una cuenta distinta por cada uno.
- **Criterios de aceptación:**
  - Dado que entré a un negocio, cuando cargo contenido, tareas del tablero, comisiones de closers u otros datos del negocio, entonces quedan guardados en ese negocio y no en el holding.
  - Dado que entré a un negocio, entonces el menú muestra los módulos contratados por ese negocio.
  - Sólo el founder o un admin del holding puede entrar a un negocio; otro miembro del holding, aun forzándolo, sigue viendo el holding.
- **Tareas técnicas:** `[AUD-SALUD-ORG-HOLDING]`, `[ADDONS-HOLDING]`, `[HOLDING-PORTFOLIO-ROL]`
- **Para confirmar:** Martín: el perfil y el equipo quizá deban seguir atados al holding a propósito; confirmar con quien lo implemente cuáles quedan afuera.

### [H-PLA-15] Ver en el Panel General números completos y propios
- **Funcionalidad:** F-PLA-15 · Con fallas
- **Historia:** Como founder, quiero que el Panel General muestre mis KPIs, embudo, ingresos, ventas y ranking de closers con todos los datos de mi negocio, para tomar decisiones con números que no estén cortados.
- **Criterios de aceptación:**
  - Dado un negocio con más de 1.000 turnos, cuando abro el Panel, entonces las ventas, el ranking de closers y el embudo incluyen los turnos más recientes (los del mes coinciden con los que hay guardados).
  - Los números del Panel sólo incluyen turnos de mi organización, nunca de otra.
  - El embudo del Panel incluye el tramo de mensajes directos (conversaciones y respuestas), o deja claro que arranca en las llamadas.
- **Tareas técnicas:** `[CLOSING-LIST-1000]`, `[EMBUDO-PANEL-DMS]`
- **Para confirmar:** Agustín: ¿el embudo del Panel tiene que contar los mensajes directos de la bandeja nueva, o alcanza con que arranque en las llamadas?

### [H-PLA-16] Ver mis métricas propias en el Panel
- **Funcionalidad:** F-PLA-16 · A medias
- **Historia:** Como founder, quiero ver en el Panel las métricas propias que armé, para seguir de un vistazo los números que me importan a mí.
- **Criterios de aceptación:**
  - Dado que tengo métricas propias configuradas, cuando abro el Panel, entonces las veo dibujadas con sus valores.
  - Si se decide no mostrarlas, el Panel deja de pedirlas y no queda nada a medio hacer en la pantalla.
- **Tareas técnicas:** `[DASHBOARD-CODIGO-MUERTO]`
- **Para confirmar:** Decisión: construir lo que falta o sacarlo de la pantalla.

### [H-PLA-18] Que sólo quien corresponde cambie los datos de la organización
- **Funcionalidad:** F-PLA-18 · Con fallas
- **Historia:** Como founder, quiero que sólo quien tiene acceso a Ajustes pueda cambiar el nombre, la web, la moneda y la zona horaria de la organización, para que nadie del equipo altere por su cuenta cómo se muestran los números de todos.
- **Criterios de aceptación:**
  - Dado alguien con acceso a Ajustes, cuando edita los datos generales, entonces se guardan como hoy.
  - Dado un miembro con Ajustes en "sin acceso", cuando intenta cambiar esos datos (incluso por fuera de la pantalla), entonces recibe un error de permiso y no cambia nada.
- **Tareas técnicas:** `[PERMISOS-SERVER-ACTIONS]`
- **Para confirmar:** —

### [H-PLA-19] Recibir los avisos que elijo
- **Funcionalidad:** F-PLA-19 · No funciona
- **Historia:** Como founder, quiero que los avisos por mail y en la app que activo en Ajustes me lleguen de verdad, para enterarme a tiempo de conversaciones nuevas, turnos, ventas y alertas sin tener que entrar a mirar.
- **Criterios de aceptación:**
  - Dado que activé un aviso, cuando pasa lo que avisa (por ejemplo una venta cerrada), entonces me llega por el canal elegido; si lo desactivé, no me llega.
  - Los avisos que se decida no ofrecer desaparecen de la pestaña Notificaciones: no queda ningún interruptor que no haga nada.
  - El mail de bienvenida se manda a quien corresponde, o se saca si no se va a usar.
- **Tareas técnicas:** `[NOTIFICACIONES-EMAIL-SIN-ENVIO]`
- **Para confirmar:** Agustín: ¿qué avisos existen de verdad (cuáles de los nueve se construyen y cuáles se sacan)?

### [H-PLA-20] Usar mi propia clave de Claude sin sorpresas
- **Funcionalidad:** F-PLA-20 · Con fallas
- **Historia:** Como founder, quiero cargar mi propia clave de Claude, enterarme si deja de funcionar y que nadie de mi equipo sin permiso la pueda cambiar, para que la IA de mi negocio siga trabajando y se cobre en mi cuenta.
- **Criterios de aceptación:**
  - Dado un miembro con Ajustes en "sin acceso", cuando intenta cambiar o borrar la clave (incluso por fuera de la pantalla), entonces recibe un error de permiso y la clave no cambia.
  - Dado que mi clave es rechazada por Claude, entonces veo el aviso rojo en la aplicación y el trabajo de IA de mi negocio sigue (con la clave de Limitless) o queda claro que está frenado hasta que cargue una nueva.
  - Se probó con la organización que hoy tiene la clave rechazada y el resultado quedó anotado.
- **Tareas técnicas:** `[PERMISOS-SERVER-ACTIONS]`, `[1A1-CLAVE-ANTHROPIC-ROTA]`
- **Para confirmar:** —

### [H-PLA-21] Ver y manejar todas mis integraciones en un tablero confiable
- **Funcionalidad:** F-PLA-21 · Con fallas
- **Historia:** Como founder, quiero ver mis integraciones con un estado que refleje lo que realmente pasa y poder conectarlas o desconectarlas sólo yo o quien autorice, para saber qué datos están entrando y arreglar lo que falla.
- **Criterios de aceptación:**
  - Dado que conecto VTurb, Hyros o WebinarJam con una clave inválida, cuando vuelvo al tablero, entonces la tarjeta aparece "Con error" con un texto que dice qué hacer; probado con cuentas reales y el resultado quedó anotado.
  - Dado un miembro con Integraciones en "sin acceso", cuando intenta desconectar una integración (incluso por fuera de la pantalla), entonces recibe un error de permiso y la integración sigue conectada.
  - Hay una prueba automática que filtra por "requieren atención", abre un detalle y vuelve.
- **Tareas técnicas:** `[INTEGRACIONES-VERIFICAR]`, `[PERMISOS-SERVER-ACTIONS]`, `[INTEGRACIONES-PLAYWRIGHT]`
- **Para confirmar:** —

### [H-PLA-22] Importar mi histórico con los montos correctos
- **Funcionalidad:** F-PLA-22 · Con fallas
- **Historia:** Como founder, quiero importar mis clientes y ventas desde Excel, GoHighLevel o ClickUp con los montos y fechas tal cual los tengo, para que mis ingresos y renovaciones arranquen con números reales.
- **Criterios de aceptación:**
  - Dado un Excel con montos "1.500", "1.500,00" y "1,500.00", cuando lo importo, entonces los tres quedan en 1500.
  - Dado un Excel con una fila con monto o fecha ilegible o vacía, cuando lo importo, entonces esa fila se informa como error y no se guarda con monto 0 ni con la fecha de hoy.
  - Dado un import desde ClickUp con montos "1.500" y "$2,500.00", entonces quedan en 1500 y 2500; un monto ambiguo no se importa y aparece informado en el resultado.
- **Tareas técnicas:** `[CLIENTES-IMPORT-EXCEL-MONTOS]`, `[CLICKUP-MONTOS]`
- **Para confirmar:** —

### [H-PLA-23] Tener un Área del fundador que sea sólo mía
- **Funcionalidad:** F-PLA-23 · Con fallas
- **Historia:** Como founder, quiero un Área del fundador con el resumen de Inteligencia de mi negocio que mi equipo sin permiso no pueda abrir, para revisar la foto general del negocio en privado.
- **Criterios de aceptación:**
  - Dado un miembro sin acceso a Operaciones, cuando abre el Área del fundador, entonces ve "No tenés acceso"; el founder la sigue viendo.
  - El Área muestra lo que se decida que tiene que mostrar (hoy es el mismo resumen de Inteligencia con otra presentación).
- **Tareas técnicas:** `[PERMISOS-FOUNDER-AREA]`, `[FOUNDER-AREA]`
- **Para confirmar:** Agustín: ¿qué debería tener el Área del fundador además del resumen de Inteligencia, o se une con Inteligencia? (la tarea técnica no tiene descripción).

### [H-PLA-26] Dar de baja a un cliente de Limitless sin dejar restos
- **Funcionalidad:** F-PLA-26 · Sin verificar
- **Historia:** Como super admin de Limitless, quiero dar de baja una organización o una persona viendo antes qué se borra, para que un ex cliente no conserve accesos ni archivos en la plataforma.
- **Criterios de aceptación:**
  - Probado con una organización descartable con datos reales y el resultado de cada paso quedó anotado.
  - Dado que di de baja una organización, cuando su founder intenta entrar, entonces no puede, y no quedan archivos de esa organización guardados.
  - La baja queda registrada con quién la hizo, qué alcanzó y ningún problema; si algo falla a mitad, el aviso dice "la baja quedó a medias" con el detalle, nunca "listo".
- **Tareas técnicas:** `[BAJAS-SIN-PROBAR]`
- **Para confirmar:** —

### [H-PLA-28] Ver un puntaje de salud real de cada cliente
- **Funcionalidad:** F-PLA-28 · A medias
- **Historia:** Como super admin de Limitless, quiero un puntaje de salud de 0 a 100 por cliente calculado con datos que se siguen cargando, para detectar a tiempo qué clientes están en riesgo de irse.
- **Criterios de aceptación:**
  - Dado un cliente que usa todo lo que mide el puntaje, entonces puede llegar a 100 (hoy el máximo real es 75).
  - Ninguna de las señales del puntaje lee datos que dejaron de cargarse, y el puntaje no se corta en clientes con mucho volumen.
- **Tareas técnicas:** `[CLIENT-HEALTH-LEGACY]`
- **Para confirmar:** Agustín: ¿qué señal reemplaza a "conversaciones" (la bandeja vieja que quedó vacía)?

### [H-PLA-30] Mantener el cerebro de IA general sin usar la clave de un cliente
- **Funcionalidad:** F-PLA-30 · Con fallas
- **Historia:** Como super admin de Limitless, quiero cargar y resumir los documentos del cerebro de IA general usando sólo la cuenta de Limitless, para no cobrarle a un cliente trabajo de la plataforma ni usar su clave sin permiso.
- **Criterios de aceptación:**
  - Dado que falta la clave de Claude de Limitless, cuando genero resúmenes del cerebro, entonces la pantalla muestra un error claro y no usa la clave de ningún cliente.
  - Dado que la clave de Limitless está cargada, cuando genero resúmenes, entonces el costo de cada lote queda registrado como gasto de la plataforma, no a nombre de un cliente.
- **Tareas técnicas:** `[IA-CLAVE-DE-CLIENTE-EN-SUPERADMIN]`
- **Para confirmar:** —

---

## Clientes

### [H-CLI-03] Cargar clientes en bloque desde una planilla sin perder datos
- **Funcionalidad:** F-CLI-03 · Con fallas
- **Historia:** Como miembro del equipo, quiero cargar muchos clientes de una vez desde una planilla CSV o Excel con todos sus datos, incluido el mail, para no tener que darlos de alta uno por uno ni completarlos después a mano.
- **Criterios de aceptación:**
  - Dada una planilla con una columna de mail, cuando la cargo con «Cargar clientes», entonces cada cliente creado queda con su mail en la ficha.
  - Dada una planilla con montos con punto decimal, filas vacías o un título en la primera fila, cuando la cargo, entonces los montos se guardan con el valor correcto y las filas vacías se ignoran (queda comprobado con pruebas automáticas).
  - Si una fila tiene un error, se informa cuál es y no se carga ninguna (como hoy).
- **Tareas técnicas:** `[CLIENTES-SIN-MAIL]`, `[T-3]`
- **Para confirmar:**
  - Agustín: ¿la planilla de «Cargar clientes» tiene que aceptar una columna de mail? La tarea sólo dice que hoy no la tiene; si no se quiere, este criterio sale.
  - Agustín: de dónde se completan los mails de los clientes viejos (import, leads de ventas o pagos).

### [H-CLI-04] Importar clientes desde Excel con montos y fechas reales
- **Funcionalidad:** F-CLI-04 · Con fallas
- **Historia:** Como miembro del equipo con acceso a Integraciones, quiero importar clientes desde un Excel y que se guarden con el monto, la fecha y el mail que dice la planilla, para que la facturación, los vencimientos de planes y el cruce con grabaciones y pagos salgan de datos ciertos.
- **Criterios de aceptación:**
  - Dado un Excel con montos escritos «1.500», «1.500,00» y «1,500.00», cuando lo importo, entonces los tres clientes quedan con 1500.
  - Dada una fila con un monto o una fecha que no se entiende (o sin fecha), cuando importo, entonces esa fila aparece como error y no se crea un cliente con monto 0 ni con la fecha de hoy.
  - Dada una fila con columna Email, cuando importo, entonces el cliente queda con ese mail guardado.
  - Con más de 1.000 clientes ya cargados, un cliente que ya existe con el mismo nombre no se duplica.
- **Tareas técnicas:** `[CLIENTES-IMPORT-EXCEL-MONTOS]`, `[CLIENTES-SIN-MAIL]`, `[T-3]`, `[CLIENTES-TECHO-1000]`
- **Para confirmar:** —

### [H-CLI-05] Ver en la tabla de clientes la misma fase que en la ficha
- **Funcionalidad:** F-CLI-05 · Con fallas
- **Historia:** Como miembro del equipo, quiero que la tabla de clientes muestre la fase real de cada uno y a todos los clientes aunque la cartera crezca, para revisar el avance de la cartera sin tener que abrir ficha por ficha.
- **Criterios de aceptación:**
  - Dado un cliente con un hito registrado en una fase temprana y la fase fijada a mano en una más avanzada, cuando abro la tabla de Clientes, entonces veo la misma fase (nombre, color y «n de m») que en su ficha.
  - Dada una organización con más de 1.000 clientes, tareas o hitos, cuando abro la tabla, entonces aparecen todos los clientes y la próxima tarea y la fase de cada uno salen completas.
  - Se hizo la pasada por pantalla con una sesión real (fase, próxima tarea, satisfacción, columnas configurables y filtros) y el resultado quedó anotado.
- **Tareas técnicas:** `[CLIENTES-ETAPA-TABLA-VS-FICHA]`, `[CLIENTES-TECHO-1000]`, `[AVISO-Y-SATISFACCION-SIN-PROBAR]`
- **Para confirmar:** —

### [H-CLI-09] Editar una tarea del cliente ya creada
- **Funcionalidad:** F-CLI-09 · A medias
- **Historia:** Como miembro del equipo, quiero corregir el detalle de una tarea del cliente después de crearla, para no tener que borrarla y cargarla de nuevo cuando cambia lo acordado.
- **Criterios de aceptación:**
  - Dada una tarea existente en la ficha del cliente, cuando edito su detalle y guardo, entonces la tarea muestra el texto nuevo y sigue en el mismo lugar (mismo estado y, si estaba en el Tablero de trabajo, sin duplicarse).
  - Un miembro con Clientes en «Solo lectura» no ve la opción de editar.
- **Tareas técnicas:** `[1A1-EDITAR-DETALLE]`
- **Para confirmar:**
  - Martín: qué campos de la tarea se pueden editar (sólo el texto, o también fecha y responsable); la tarea no lo dice.

### [H-CLI-12] Llegar a las grabaciones sin asignar y dejar que el sistema reconozca a los clientes
- **Funcionalidad:** F-CLI-12 · Con fallas
- **Historia:** Como miembro del equipo, quiero encontrar desde la lista de clientes las grabaciones de Fathom que el sistema no pudo asignar y cargar una sola vez los datos de los clientes desde el CRM, para que las sesiones 1-1 lleguen a la ficha correcta y la «Última 1-1» esté al día.
- **Criterios de aceptación:**
  - Dada la lista de Clientes en computadora, cuando hay grabaciones sin asignar, entonces veo un acceso a «Llamadas sin asociar» con la cantidad pendiente y me lleva a esa pantalla.
  - El aviso de «Última 1-1» que dice «Confirmalo en Llamadas sin asociar» es un link a esa pantalla.
  - Se apretó «Cargar identidades desde el CRM» con la cuenta real, el sistema quedó con los datos de los clientes cargados y quedó anotado cuántas grabaciones pasaron a asignarse solas y cuántas se asignaron mal por nombre.
- **Tareas técnicas:** `[CLIENTES-PENDING-CALLS-HUERFANA]`, `[B-SEMBRAR-IDENTIDADES]`
- **Para confirmar:**
  - Martín: esta funcionalidad es la misma pantalla que F-VEN-25 (Ventas); conviene decidir si se cargan como una sola historia.

### [H-CLI-23] Que cada miembro sólo pueda hacer en Clientes lo que su permiso permite
- **Funcionalidad:** F-CLI-23 · Con fallas
- **Historia:** Como founder, quiero que un miembro con Clientes en «Solo lectura» o «Sin acceso» no pueda borrar ni modificar clientes por ningún camino, para que el permiso por módulo proteja los datos y no sea sólo esconder botones.
- **Criterios de aceptación:**
  - Dado un miembro con Clientes en «Solo lectura» o «Sin acceso», cuando intenta por fuera de la pantalla borrar o editar un cliente, registrar un hito, borrar un win, guardar facturación o subir una 1-1, entonces recibe un error de permiso y no cambia nada.
  - Con Clientes en «full», esas mismas acciones siguen funcionando.
  - Se probó con una cuenta de equipo: con «full» ve los botones (Nuevo cliente, Cargar clientes, Revisión semanal, Wins, Configurar) y puede guardar un cliente de prueba; con «Solo lectura» no aparecen.
- **Tareas técnicas:** `[PERMISOS-SERVER-ACTIONS/clientes]`, `[PERMISOS-SERVER-ACTIONS]`, `[ALTA-CLIENTES-PROBAR]`
- **Para confirmar:** —

### [H-CLI-26] Que cada creador complete su onboarding por un link, sin cuenta
- **Funcionalidad:** F-CLI-26 · Sin verificar
- **Historia:** Como miembro del equipo, quiero generar un link de onboarding para cada creador y que lo que complete llene su ficha, para dejar de usar el formulario viejo y tener sus respuestas con historial dentro de Limitless.
- **Criterios de aceptación:**
  - Probado con la organización real que tiene el add-on (formulario de 86 preguntas cargado, link por creador, completado en una ventana sin sesión) y el resultado quedó anotado; si algo falló, se abrió una tarea nueva.
  - Dado un link de un creador, cuando el creador completa el formulario y lo envía, entonces sus respuestas aparecen en su ficha, con quién lo completó en el historial y «Onboarding completado» en la línea de tiempo.
  - Si se cambia una letra del link o se desactiva, el formulario dice que no está activo.
  - El equipo fue avisado de que el formulario viejo queda reemplazado y que sus respuestas no se importan.
- **Tareas técnicas:** `[ONBOARDING-CLIENTES-PROBAR]`
- **Para confirmar:**
  - Agustín: ¿hace falta un aviso (Discord o mail) cuando un creador termina el onboarding para dar esto por bueno? Hoy sólo aparece en la bandeja y la línea de tiempo (lo agrupa la tarea ONBOARDING-CLIENTES-RESTO, que no se incluyó por ser alcance nuevo).

### [H-CLI-27] Recibir onboardings por un link general y asignarlos al cliente correcto
- **Funcionalidad:** F-CLI-27 · Sin verificar
- **Historia:** Como miembro del equipo, quiero compartir un único link de onboarding y después asignar cada respuesta que llega al creador que corresponde (o crearlo), para no tener que generar un link por persona antes de que complete el formulario.
- **Criterios de aceptación:**
  - Probado con la organización real que tiene el add-on (link general, bandeja «sin asignar», asignar, crear cliente nuevo y descartar) y el resultado quedó anotado; si algo falló, se abrió una tarea nueva.
  - Dado un envío por el link general, cuando llega, entonces aparece «1 sin asignar» y ninguna ficha cambia hasta que alguien lo asigna.
  - Cuando lo asigno a un creador existente, sus respuestas caen en su ficha y sale de la bandeja; cuando elijo «Cliente nuevo», se crea el cliente; cuando lo descarto, sale sin tocar nada.
- **Tareas técnicas:** `[ONBOARDING-CLIENTES-PROBAR]`
- **Para confirmar:**
  - Agustín: al crear el cliente desde la bandeja queda con monto 0 hasta que alguien lo complete; confirmar que es lo esperado.

---

## Ventas

### [H-VEN-04] Ver de dónde vino un lead, si agendó y si compró, al lado del chat
- **Funcionalidad:** F-VEN-04 · A medias
- **Historia:** Como setter, quiero ver junto a la conversación de la bandeja de qué contenido o link vino el lead, si agendó y si compró, para responderle sabiendo en qué punto está sin salir a buscarlo en otras pantallas.
- **Criterios de aceptación:**
  - Dado un lead de la bandeja que tiene un turno en Closing, cuando abro su conversación, entonces el recorrido muestra que agendó y la fecha del turno.
  - Dado un lead cuyo turno terminó en venta, cuando abro su conversación, entonces el recorrido muestra la compra.
  - Dado un lead que entró por un link con seguimiento, el recorrido muestra de qué contenido o link vino.
  - Hay pruebas automáticas del recorrido (lead que escribe por varios canales, orden de los pasos, lead sin llamadas).
- **Tareas técnicas:** `[T-9]`, `[LEGACY-INBOX-BORRAR]` — (crear al refinar: armar el recorrido con los turnos y las ventas actuales en vez de la bandeja vieja, que está vacía; hoy con Zernio sólo muestra comentarios)
- **Para confirmar:**
  - Agustín: Decisión: construir lo que falta o sacarlo de la pantalla.
  - Martín: el lead de la bandeja no tiene mail; hay que definir cómo se reconoce que es el mismo lead del turno (hoy se busca por nombre en la bandeja vieja).

### [H-VEN-05] Que los turnos de Calendly del negocio entren a tiempo y de forma segura
- **Funcionalidad:** F-VEN-05 · Con fallas
- **Historia:** Como founder, quiero que los turnos del Calendly del negocio entren solos, sin atrasos y sin que nadie de afuera pueda colar turnos falsos, para que Closing y el seguimiento reflejen la agenda real.
- **Criterios de aceptación:**
  - Dado un turno nuevo que aparece a la vez en el Calendly del negocio y en el de un closer, cuando corre la sincronización, entonces entra en esa misma corrida junto con los demás turnos nuevos (no se pierde el lote hasta la hora siguiente).
  - Una hora de registros de la sincronización no muestra errores de turnos duplicados.
  - Cuando llega un aviso de Calendly firmado hace más de 5 minutos (repetido), el sistema lo rechaza.
  - Las credenciales de la conexión con Calendly quedan guardadas cifradas, y la sincronización sigue funcionando después del cambio.
- **Tareas técnicas:** `[CALENDLY-CRONS-SUPERPUESTOS]`, ~~CALENDLY-WEBHOOK-REPLAY~~ (resuelta en SCRUM-489), `[TOKENS-TEXTO-PLANO]`
- **Para confirmar:** —

### [H-VEN-07] Que los turnos del Calendly de cada closer entren al seguimiento
- **Funcionalidad:** F-VEN-07 · Con fallas
- **Historia:** Como closer, quiero que los turnos de mi propio Calendly entren atribuidos a mí y colgados de su lead, para poder seguirlos desde Seguimiento como cualquier otro turno.
- **Criterios de aceptación:**
  - Dado un turno nuevo agendado en el Calendly de un closer con un mail nuevo, cuando corre la sincronización, entonces el turno queda a nombre de ese closer y el lead aparece en Closing → Seguimiento → Todos.
  - Después de la corrección, los turnos viejos que tienen mail del lead también quedan colgados de su lead (ninguno queda suelto).
  - Si un turno está en el Calendly del negocio y en el del closer, entra igual en la misma corrida.
- **Tareas técnicas:** `[CALENDLY-CLOSER-SIN-LEAD]`, `[CALENDLY-CRONS-SUPERPUESTOS]`
- **Para confirmar:** —

### [H-VEN-08] Ver en Closing todos los turnos del negocio activo, incluidos los más nuevos
- **Funcionalidad:** F-VEN-08 · Con fallas
- **Historia:** Como closer, quiero ver en el calendario y en la lista de Closing todos los turnos de mi negocio, incluidos los de hoy y de esta semana, para poder cargar su resultado a tiempo.
- **Criterios de aceptación:**
  - Dada una organización con más de 1.000 turnos, cuando abro Closing, entonces el calendario y la lista muestran todos los turnos del mes actual (la misma cantidad que tiene guardada el sistema).
  - Nunca aparece un turno de otra organización.
  - Dado un admin del holding con el negocio A activo, cuando abre Closing y Seguimiento, entonces ve sólo turnos y leads de A, y puede marcar un resultado y editar una fila de Seguimiento sin error.
- **Tareas técnicas:** `[CLOSING-LIST-1000]`, `[CLOSING-HOLDING-MEZCLA]`
- **Para confirmar:** —

### [H-VEN-10] Cerrar una venta en un solo paso
- **Funcionalidad:** F-VEN-10 · Con fallas
- **Historia:** Como closer, quiero marcar una venta como cerrada y que se cree el cliente con su primer pago en un solo paso, para no cargar nada dos veces ni quedarme con una venta a medias.
- **Criterios de aceptación:**
  - Dado un turno en Closing, cuando lo marco como cerrado con monto y comprobante, entonces aparece el cliente en Clientes, vinculado al lead y con ese pago registrado.
  - Si se corta la conexión o algo falla en el medio, no queda un turno cerrado sin cliente ni un cliente sin pago; o, si quedó algo a medias, puedo volver a intentarlo y se completa lo que faltaba.
  - Reintentar el cierre del mismo turno nunca duplica el cliente ni el pago.
- **Tareas técnicas:** `[CLOSING-CIERRE-ATOMICO]`
- **Para confirmar:** —

### [H-VEN-13] Calificar al lead antes de la llamada
- **Funcionalidad:** F-VEN-13 · A medias
- **Historia:** Como closer, quiero calificar al lead antes de la llamada además de después, para comparar lo que esperaba con lo que pasó y preparar mejor la llamada.
- **Criterios de aceptación:**
  - Dado un turno abierto en su detalle, cuando elijo una calificación previa y guardo, entonces queda guardada y la veo la próxima vez que abro el turno.
  - La calificación posterior sigue funcionando como hoy y las dos se ven por separado.
- **Tareas técnicas:** `[LLAMADAS-FASE-2-PULIR]`
- **Para confirmar:** —

### [H-VEN-14] Ver el ranking de closers en la pestaña Equipo
- **Funcionalidad:** F-VEN-14 · No funciona
- **Historia:** Como founder, quiero ver en la pestaña Equipo de Closing a cada closer con sus cierres, su facturación y su comisión, para saber quién está vendiendo y cuánto le corresponde.
- **Criterios de aceptación:**
  - Dado un período con al menos una venta cerrada, cuando abro la pestaña Equipo, entonces aparece el closer de esa venta con cierres y facturación distintos de cero.
  - La pestaña no sale vacía por un error: si no hay ventas, lo dice.
  - Quedó escrito de dónde sale la facturación de cada closer (resultado del turno, monto del cliente o pagos registrados).
- **Tareas técnicas:** `[CLOSER-AMOUNT-CLOSED]`
- **Para confirmar:**
  - Agustín: de dónde tiene que salir la facturación por closer (lo que se cargó al cerrar, el monto total del cliente o lo efectivamente cobrado).

### [H-VEN-16] Ver métricas reales de los DMs
- **Funcionalidad:** F-VEN-16 · No funciona
- **Historia:** Como founder, quiero ver cuántos leads entran por DM, cuántos agendan, cuántos dejan de responder y cuánto tarda el equipo en contestar, para saber si el problema de ventas está en la conversación o en la llamada.
- **Criterios de aceptación:**
  - Dada una organización con conversaciones en la bandeja de Zernio, cuando abro Métricas, entonces las tarjetas de DMs muestran números que coinciden con esas conversaciones, no siempre 0.
  - El tramo de DMs del embudo del Panel General muestra los mismos números.
  - Las tarjetas que no se puedan calcular con lo que se guarda de la bandeja no se muestran (en vez de mostrar 0).
- **Tareas técnicas:** `[EMBUDO-PANEL-DMS]`, `[LEGACY-INBOX-BORRAR]`
- **Para confirmar:**
  - Agustín: Decisión: guardar datos de la bandeja de Zernio para calcular estas métricas, o sacar las tarjetas de DMs de la pantalla.
  - Martín: qué métricas de DMs son imprescindibles (leads, agendamiento, fantasma, tiempo de respuesta); cada una depende de guardar distinta información.

### [H-VEN-17] Ver facturación y comisión por closer completas en Métricas
- **Funcionalidad:** F-VEN-17 · Con fallas
- **Historia:** Como founder, quiero ver en Métricas la facturación y la comisión estimada de cada closer sobre todos los turnos del período, para pagar comisiones y comparar closers con números completos.
- **Criterios de aceptación:**
  - Dada una organización con más de 1.000 turnos, cuando abro Métricas, entonces la facturación por closer del mes actual incluye los turnos más recientes y coincide con lo que tiene guardado el sistema para ese mes.
  - Nunca se suman turnos de otra organización.
- **Tareas técnicas:** `[CLOSING-LIST-1000]`
- **Para confirmar:**
  - Agustín: la comisión se calcula con un porcentaje fijo para todos; ¿alcanza o hay que usar la comisión de cada closer? No hay tarea para eso.
  - Martín: no se confirmó que alguna organización pase hoy los 1.000 turnos; si ninguna los pasa, la falla todavía no se ve.

### [H-VEN-18] Ver el ranking del equipo por puntaje de llamadas y sus objeciones
- **Funcionalidad:** F-VEN-18 · Con fallas
- **Historia:** Como founder, quiero ver el ranking de closers según el puntaje de sus llamadas de venta y las objeciones más frecuentes, para saber a quién entrenar y en qué.
- **Criterios de aceptación:**
  - El ranking sólo cuenta llamadas de venta (una 1-1 de entrega con un cliente no aparece).
  - Cada llamada aparece con el nombre de su closer, no agrupada en «Sin nombre».
  - El indicador de tendencia compara contra el período anterior, o no se muestra (hoy dice siempre «estable»).
- **Tareas técnicas:** `[FATHOM-DEEP-ANALISIS-ALCANCE]`, `[RANKING-TREND-FIJO]`
- **Para confirmar:**
  - Agustín: Decisión: calcular la tendencia o sacar el indicador.

### [H-VEN-19] Revisar las llamadas de venta grabadas y su análisis
- **Funcionalidad:** F-VEN-19 · Con fallas
- **Historia:** Como founder, quiero ver en Ventas → Llamadas todas las llamadas de venta grabadas con Fathom y su análisis, para revisar cómo vende el equipo sin ir a buscar cada grabación.
- **Criterios de aceptación:**
  - Dada una organización con llamadas de venta grabadas, cuando abro Ventas → Llamadas, entonces veo la misma cantidad de llamadas que tiene guardadas el sistema, cada una con su análisis cuando existe.
  - Si la carga falla, el error queda registrado para el equipo técnico en vez de mostrar «no hay llamadas».
  - Una llamada de venta con un lead (sin cliente todavía) también tiene su análisis.
- **Tareas técnicas:** `[FATHOM-DEEP-ANALISIS-ALCANCE]`
- **Para confirmar:** —

### [H-VEN-21] Conectar mi propia cuenta de Fathom y que mis grabaciones lleguen solas
- **Funcionalidad:** F-VEN-21 · No funciona
- **Historia:** Como closer, quiero conectar mi cuenta de Fathom y que cada grabación nueva llegue sola a Limitless, para no depender de apretar «Sincronizar mis llamadas» ni de la cuenta del negocio.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Fathom y el resultado quedó anotado (incluido si Fathom acepta el aviso de grabación nueva); si falló, se abrió una tarea nueva.
  - Dado un miembro con su Fathom conectado, cuando termina una grabación, entonces aparece en Limitless a su nombre y en la siguiente pasada se clasifica como venta, entrega o equipo.
  - Una grabación que no quedó vinculada a nada sólo la ve quien la grabó; una vinculada a un lead la ve quien se decida (ver Para confirmar).
- **Tareas técnicas:** `[FATHOM-WEBHOOK-MIEMBRO-ROTO]`, `[B-FATHOM-NUNCA-PROBADO]`, `[FATHOM-PRIVACIDAD-LEAD]`
- **Para confirmar:**
  - Agustín: una venta grabada por un closer con su cuenta y vinculada a un lead, ¿la tiene que ver el founder? Hoy sigue siendo privada del closer.

### [H-VEN-22] Que cada grabación se cruce con su turno y se clasifique bien
- **Funcionalidad:** F-VEN-22 · Sin verificar
- **Historia:** Como founder, quiero que cada grabación se cruce sola con el turno de la agenda y quede clasificada como venta, entrega o equipo, para que las métricas, los análisis y el ranking de ventas se armen sólo con llamadas de venta.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Fathom y la agenda real, y el resultado quedó anotado: cuántas grabaciones de venta cruzaron un turno y si las ventanas de tiempo usadas son correctas; si falló, se abrió una tarea nueva.
  - Se cargaron las identidades de los clientes desde el CRM y quedó anotado cuántas grabaciones se clasificaron por cada vía y cuántas se asignaron mal por nombre.
  - Dada una grabación que cruzó un turno de un lead, entonces queda vinculada a ese lead.
  - Dada una grabación con alguien de afuera que no cruzó ningún turno, entonces no se cuenta como venta.
- **Tareas técnicas:** `[LLAMADAS-VERIFICAR-FATHOM]`, `[B-SEMBRAR-IDENTIDADES]`, `[FATHOM-CRUCE-AGENDA-DESCONECTADO]`
- **Para confirmar:**
  - Agustín: una grabación con un externo que el sistema no reconoce y no cruzó ningún turno, ¿queda sin clasificar o se cuenta como venta? La tarea deja la decisión abierta.

### [H-VEN-23] Que el análisis profundo se haga sobre las llamadas de venta y a nombre de su closer
- **Funcionalidad:** F-VEN-23 · Con fallas
- **Historia:** Como founder, quiero que cada llamada de venta tenga su análisis (puntaje por sección, objeciones, si vendió) a nombre del closer que la hizo, para evaluar a cada closer con sus propias llamadas y no gastar en analizar llamadas que no son de venta.
- **Criterios de aceptación:**
  - Dada una 1-1 de entrega de 10 minutos o más con un cliente, entonces no genera análisis de venta.
  - Dada una llamada de venta cruzada con el turno de un lead, entonces genera su análisis con el closer del turno.
  - El ranking del equipo en Métricas muestra el nombre del closer en vez de «Sin nombre».
- **Tareas técnicas:** `[FATHOM-DEEP-ANALISIS-ALCANCE]`
- **Para confirmar:** —

### [H-VEN-25] Asignar a mano las grabaciones pendientes a un cliente
- **Funcionalidad:** F-VEN-25 · Con fallas
- **Historia:** Como founder, quiero asociar a un cliente las grabaciones que el sistema no pudo asignar y cargar desde el CRM los datos de mis clientes, para que cada llamada termine en la ficha correcta sin riesgo de mezclar datos con otra empresa.
- **Criterios de aceptación:**
  - Cuando asigno una grabación a uno de mis clientes, queda en su ficha como hoy.
  - Si alguien intenta asignar una grabación a un cliente de otra empresa, recibe un error y no se guarda nada en ninguna de las dos.
  - Llego a la pantalla de grabaciones pendientes desde la lista de Clientes, con la cantidad pendiente a la vista.
  - Se apretó «Cargar identidades desde el CRM» con la cuenta real y quedó anotado cuántas grabaciones pasaron a asignarse solas.
- **Tareas técnicas:** ~~FATHOM-CLIENTID-SIN-VALIDAR~~ (resuelta en SCRUM-43), `[B-SEMBRAR-IDENTIDADES]`, `[CLIENTES-PENDING-CALLS-HUERFANA]`
- **Para confirmar:**
  - Martín: es la misma pantalla que F-CLI-12 (Clientes); conviene decidir si se cargan como una sola historia.

### [H-VEN-28] Limitar por rol quién ve Ventas y los montos
- **Funcionalidad:** F-VEN-28 · Con fallas
- **Historia:** Como founder, quiero que un miembro sin permiso de Ventas no pueda ver ni cambiar turnos, leads, cobros ni llamadas por ningún camino, para que los montos y los datos comerciales queden sólo para quien los necesita.
- **Criterios de aceptación:**
  - Dado un miembro con Ventas en «Sin acceso», cuando intenta por fuera de la pantalla leer o modificar turnos, leads, cobros o llamadas, entonces recibe un error de permiso y no ve ni cambia nada.
  - Con Ventas en «full», todo sigue funcionando.
  - Quedó decidido qué roles necesitan el permiso de Ventas para ver montos en Clientes, y los roles configurados se ajustaron a esa decisión.
- **Tareas técnicas:** `[PERMISOS-SERVER-ACTIONS/ventas]`, `[PERMISOS-SERVER-ACTIONS]`, `[COBROS-AVISAR-PERMISOS]`
- **Para confirmar:**
  - Agustín: qué roles (por ejemplo, quien lleva la cuenta del cliente) tienen que ver montos en Clientes aunque no trabajen en Ventas.

---

## Marketing

### [H-MKT-01] Ver toda mi biblioteca de contenido, siempre al día
- **Funcionalidad:** F-MKT-01 · Con fallas
- **Historia:** Como founder, quiero ver todas mis publicaciones de Instagram y YouTube en la biblioteca, con sus números reales y actualizadas solas, para saber qué contenido me funciona sin revisar cada red por separado.
- **Criterios de aceptación:**
  - Dada una cuenta con más de 50 publicaciones (en producción hay 150), cuando abro la biblioteca, entonces puedo llegar a todas, no sólo a las 50 primeras.
  - Dado un usuario de un holding que cambió al negocio activo, cuando abre Contenido, entonces ve las publicaciones de ese negocio y la actualización corre contra ese negocio (hoy ve la biblioteca vacía o un aviso de "Zernio no está conectado").
  - Dada una empresa que no conectó Zernio, cuando entra a la biblioteca, entonces ve el aviso de "no conectado" y nunca contenido de otra cuenta.
  - Cuando Zernio devuelve una publicación sin números reconocibles, entonces la biblioteca conserva los números que ya tenía en vez de mostrarla en cero.
- **Tareas técnicas:** `[MKT-CONTENT-LIMITE-50]`, `[MKT-HOLDING-ORG]`, `[AUDITORIA §3 confiabilidad 11]`
- **Para confirmar:** Martín: la solución de las 150 piezas puede ser paginar o filtrar por tipo y fecha; que Agustín elija cuál prefiere ver en pantalla.

### [H-MKT-02] Ver mis historias de Instagram como historias
- **Funcionalidad:** F-MKT-02 · Sin verificar
- **Historia:** Como founder, quiero que mis historias de Instagram de las últimas 24 horas aparezcan en la biblioteca como historias (y no como reels), para medirlas aparte del resto de mi contenido.
- **Criterios de aceptación:**
  - Dada una historia publicada hace menos de 24 horas, cuando abro la biblioteca y filtro por Historias, entonces aparece ahí con su imagen de portada.
  - Ningún reel aparece marcado como historia.
  - Probado con una cuenta real de Zernio conectada a Instagram y el resultado quedó anotado.
  - Lo que se supone de cómo Zernio entrega las historias quedó escrito, para que no se rompa sin que nadie lo note.
- **Tareas técnicas:** `[BUG-1]`, `[ZERNIO-DOCS]`
- **Para confirmar:** —

### [H-MKT-04] Comparar una publicación con el promedio de todo mi contenido
- **Funcionalidad:** F-MKT-04 · Con fallas
- **Historia:** Como founder, quiero abrir una publicación y ver sus números comparados con el promedio de todo mi contenido, para saber si le fue mejor o peor que de costumbre.
- **Criterios de aceptación:**
  - Dada una cuenta con más de 50 publicaciones, cuando abro el detalle de una, entonces el promedio con el que se compara se calcula sobre todo el contenido, no sólo sobre 50 piezas.
  - Dado un usuario de un holding que cambió al negocio activo, cuando abre el detalle de una publicación de ese negocio, entonces la ve con sus números y la comparación de ese negocio.
- **Tareas técnicas:** `[MKT-CONTENT-LIMITE-50]`, `[MKT-HOLDING-ORG]`
- **Para confirmar:** —

### [H-MKT-05] Vincular el video de Drive a una publicación
- **Funcionalidad:** F-MKT-05 · Con fallas
- **Historia:** Como founder, quiero vincular el archivo original de Google Drive a cada publicación, para poder analizarla con IA y generar sus versiones de prueba.
- **Criterios de aceptación:**
  - Dado un usuario de un holding que cambió al negocio activo, cuando vincula un archivo de Drive a una publicación desde el detalle o desde Administrar, entonces queda vinculado a la publicación de ese negocio.
  - Dado un miembro del equipo sin permiso de Marketing, cuando intenta usar el Drive del founder o vincular archivos por fuera de la pantalla, entonces recibe un error de permiso y no cambia nada.
- **Tareas técnicas:** `[MKT-HOLDING-ORG]`, `[PERMISOS-SERVER-ACTIONS/marketing]`
- **Para confirmar:** —

### [H-MKT-06] Crear una carpeta de Drive desde Administrar
- **Funcionalidad:** F-MKT-06 · No funciona
- **Historia:** Como founder, quiero crear una carpeta nueva en mi Drive desde Administrar, para ordenar mis videos sin salir de Limitless.
- **Criterios de aceptación:**
  - Cuando toco "Nueva carpeta" y le pongo nombre, entonces la carpeta aparece en mi Drive y en el explorador de Administrar.
  - Si se decide no ofrecerlo, el botón "Nueva carpeta" ya no aparece (hoy siempre da error).
- **Tareas técnicas:** `[MKT-DRIVE-CARPETA]`
- **Para confirmar:** Decisión: construir lo que falta (pedirle a Google permiso para crear archivos) o sacar el botón de la pantalla.

### [H-MKT-07] Pedir el análisis con IA de una publicación
- **Funcionalidad:** F-MKT-07 · Con fallas
- **Historia:** Como founder, quiero pedir un análisis con IA de una publicación con video (transcripción, gancho, formato y llamado a la acción), para entender por qué funcionó o no.
- **Criterios de aceptación:**
  - Dado un usuario de un holding que cambió al negocio activo, cuando pide el análisis de una publicación de ese negocio, entonces el análisis se hace y queda guardado en esa publicación.
  - Dado un founder de una empresa común con el video vinculado, cuando pide el análisis, entonces ve la transcripción, el tipo de gancho, el formato y el llamado a la acción en la solapa Análisis.
- **Tareas técnicas:** `[MKT-HOLDING-ORG]`
- **Para confirmar:** —

### [H-MKT-08] Trabajar las variantes de una publicación desde la pantalla
- **Funcionalidad:** F-MKT-08 · A medias
- **Historia:** Como founder, quiero ver las variantes de una publicación que propone la IA y poder mandarlas a Zernio como borrador, para aprovechar las ideas sin copiarlas a mano.
- **Criterios de aceptación:**
  - Dada una variante en la solapa "Borradores", cuando la elijo para publicar, entonces aparece como borrador en Zernio con su texto.
  - Si se decide no construirlo, la solapa "Borradores" deja claro que las variantes sólo se ven (y se borran las partes que quedaron sin uso).
- **Tareas técnicas:** `[MKT-CODIGO-MUERTO]`
- **Para confirmar:** Decisión: construir lo que falta (generar variantes y mandarlas a Zernio desde la pantalla) o sacarlo y dejar sólo la vista.

### [H-MKT-09] Generar las cinco versiones de prueba de un reel
- **Funcionalidad:** F-MKT-09 · Con fallas
- **Historia:** Como founder, quiero generar cinco versiones de prueba de un reel y previsualizarlas, para probar cuál funciona mejor sin editarlas yo.
- **Criterios de aceptación:**
  - Dado un usuario de un holding que cambió al negocio activo, cuando genera las versiones de un reel de ese negocio, entonces se generan a nombre de ese negocio.
  - Si el servicio que arma los videos no está disponible, entonces el trabajo queda marcado como fallido con un mensaje, en vez de quedar "pendiente" para siempre.
  - La clave interna que protege la generación de videos no aparece en ningún registro ni dirección, fue cambiada por una nueva, y un pedido con clave incorrecta se rechaza: nadie ajeno puede pedir videos de otra empresa.
- **Tareas técnicas:** `[TRIAL-SECRET-EN-URL]`, `[MKT-HOLDING-ORG]`, `[TRIAL-FALLBACK-ROTO]`
- **Para confirmar:** —

### [H-MKT-10] Subir a Zernio las versiones de prueba que elijo
- **Funcionalidad:** F-MKT-10 · Con fallas
- **Historia:** Como founder, quiero elegir qué versiones de prueba subir y que queden como borradores en Zernio, escalonadas en el tiempo, con un mail cuando termina, para probarlas sin cargarlas una por una.
- **Criterios de aceptación:**
  - Dadas las versiones elegidas, cuando las subo con una demora, entonces aparecen como borradores en Zernio escalonados y me llega el mail al terminar.
  - Dada una versión que falló al armarse (no al subirse), cuando la veo, entonces el botón "Reintentar" está deshabilitado o vuelve a armarla, en vez de fallar de nuevo igual.
  - La clave interna que protege la subida no aparece en ningún registro ni dirección.
- **Tareas técnicas:** `[TRIAL-SECRET-EN-URL]`, `[TRIAL-RETRY-GENERACION]`
- **Para confirmar:** —

### [H-MKT-11] Usar mi propia música en la versión con música
- **Funcionalidad:** F-MKT-11 · No funciona
- **Historia:** Como founder, quiero subir mi propia música y que la versión con música de mis reels de prueba la use, para que suene a mi marca.
- **Criterios de aceptación:**
  - Dado que estoy en Marketing, Contenido, cuando busco dónde subir mi música, entonces encuentro la opción y puedo subir un archivo.
  - Dada una música subida, cuando genero versiones de prueba de un reel nuevo, entonces la versión con música suena con esa música de fondo (hoy sale con el audio original).
- **Tareas técnicas:** `[TRIAL-REELS-MUSICA]`
- **Para confirmar:** Agustín: si el founder no sube música, ¿la versión 3 lleva una música por defecto libre de derechos (hay que conseguirla, tarea TRIAL-4) o sale con el audio original?

### [H-MKT-14] Guardar el gasto diario de anuncios para Embudos
- **Funcionalidad:** F-MKT-14 · Sin verificar
- **Historia:** Como founder, quiero que todos los días se guarde lo que gasté en anuncios el día anterior, para ver en Embudos cómo evolucionó el gasto.
- **Criterios de aceptación:**
  - Dada una empresa con anuncios activos, cuando pasa un día, entonces queda guardado un registro por anuncio del día anterior, sin duplicados, y el gasto coincide con el panel de Meta.
- **Tareas técnicas:** `[EMBUDOS-CUENTAS-REALES]`, `[EMBUDOS-CRON-ERRORES]`
- **Para confirmar:** Martín: en producción no hay todavía ningún día guardado; hace falta probarlo con una cuenta con anuncios activos (y ver si el monto viene en centavos).

### [H-MKT-16] Recibir al instante los comentarios y mensajes nuevos
- **Funcionalidad:** F-MKT-16 · Sin verificar
- **Historia:** Como founder, quiero que cada comentario o mensaje nuevo que llega por Zernio quede guardado en el momento, para tener un registro histórico aunque después se borre de la red.
- **Criterios de aceptación:**
  - Cuando Zernio avisa un comentario o mensaje nuevo, entonces queda guardado en Limitless (hoy no hay ninguno guardado, con 9 cuentas conectadas).
  - Un aviso que no viene de Zernio se rechaza.
  - Probado con una cuenta real de Zernio (aviso de prueba enviado) y el resultado quedó anotado.
- **Tareas técnicas:** `[ZERNIO-WEBHOOK-SIN-EVENTOS]`, `[ZERNIO-DOCS]`
- **Para confirmar:** Agustín: hoy ninguna pantalla usa esa copia guardada (todo se lee en vivo de Zernio); ¿vale la pena mantenerla? El "para qué" es deducido.

### [H-MKT-17] Ver el resumen de Marketing con mi contenido real
- **Funcionalidad:** F-MKT-17 · No funciona
- **Historia:** Como founder, quiero ver en el Overview de Marketing mis indicadores, mi embudo y el mapa de calor calculados sobre mi contenido de Zernio, para entender de un vistazo cómo viene mi marketing.
- **Criterios de aceptación:**
  - Dada una empresa con contenido sólo en Zernio, cuando abre el Overview, entonces ve indicadores, embudo y mapa de calor con datos de su contenido (hoy los ve vacíos).
  - Abrir el Overview no recalcula nada ni gasta IA en cada visita.
  - Quedó registrada la decisión de Agustín sobre de dónde sale el Overview, y se apagó la sincronización vieja de Instagram que sigue corriendo en segundo plano.
- **Tareas técnicas:** `[MKT-OVERVIEW-LEGACY]`, `[AUDITORIA §3 salud 1]`
- **Para confirmar:** Agustín: ¿el Overview pasa a usar el contenido de Zernio o se rediseña/saca?

### [H-MKT-19] Saber qué contenido me trajo ventas
- **Funcionalidad:** F-MKT-19 · No funciona
- **Historia:** Como founder, quiero ver qué publicaciones trajeron más ventas y el recorrido de mis compradores, para hacer más del contenido que vende.
- **Criterios de aceptación:**
  - Dada una empresa con ventas que vienen de contenido de Zernio, cuando abre Conexión con Ventas, entonces ve el ranking de publicaciones con la plata que trajo cada una (distinta de cero).
  - En el detalle de una publicación con ventas, la sección "Atribución de ventas" muestra esas ventas (hoy siempre dice "Sin atribución").
  - Si el agente de negocio consulta qué contenido vendió más, responde con los mismos números.
  - Si se decide sacarla, la pantalla y la sección ya no aparecen y la dirección lleva a otra pantalla.
- **Tareas técnicas:** `[MKT-SALES-CONN-VACIA]`, `[EMBUDO-PANEL-DMS]`
- **Para confirmar:** Decisión: construir lo que falta o sacarlo de la pantalla. Agustín: para el recorrido de compradores hay que decidir qué se guarda de los mensajes de Zernio.

### [H-MKT-21] Ver las respuestas de mis formularios con el puntaje de cada lead
- **Funcionalidad:** F-MKT-21 · Con fallas
- **Historia:** Como founder, quiero que las respuestas de mis formularios de Typeform y Google Forms entren solas con un puntaje de lead por IA, para saber rápido a quién llamar primero.
- **Criterios de aceptación:**
  - Dado un formulario de Google Forms con respuestas, cuando se sincroniza, entonces las respuestas aparecen con su puntaje; si algo falla, el error queda registrado por formulario en vez de perderse en silencio (hoy hay 38 formularios y 0 respuestas en producción).
  - Un formulario con más de 1000 respuestas nuevas se trae completo.
  - Dos empresas con el mismo formulario conservan cada una sus respuestas sin pisarse.
  - Un miembro del equipo sin permiso no puede desconectar un formulario.
- **Tareas técnicas:** `[MKT-FORMS-SIN-RESPUESTAS]`, `[AUDITORIA-ABIERTOS §6]`, `[PERMISOS-SERVER-ACTIONS/marketing]`
- **Para confirmar:** —

### [H-MKT-23] Saber cuántos clics, leads, llamadas y ventas trajo cada link UTM
- **Funcionalidad:** F-MKT-23 · Sin verificar
- **Historia:** Como founder, quiero que cada link UTM sume sus clics, leads, llamadas agendadas y ventas, para saber qué video de YouTube me trae clientes.
- **Criterios de aceptación:**
  - Dado un link UTM, cuando alguien entra, se anota, agenda en Calendly con el mismo email y termina comprando, entonces el link muestra un clic, un lead, una llamada y una venta con su monto.
  - Un lead de una campaña que no existe no se registra, y un lead no se atribuye al link equivocado cuando hay dos candidatos (cubierto por pruebas automáticas).
  - Probado con una cuenta real (landing, Calendly y alta del cliente) y el resultado quedó anotado.
  - La captura desde la lista de espera de la landing de Limitless está encendida en producción.
- **Tareas técnicas:** `[T-5]`, `[ENV-LIMPIEZA]`
- **Para confirmar:** Martín: el último criterio sólo aplica a la landing propia de Limitless; si no importa para octubre, se saca junto con su tarea.

### [H-MKT-25] Registrar quién pidió cada lead magnet, venga de donde venga
- **Funcionalidad:** F-MKT-25 · A medias
- **Historia:** Como founder, quiero que cada persona que pide un lead magnet quede registrada sin importar el canal (Typeform, Google Forms, landing o ManyChat), para medir qué lead magnet me trae más leads.
- **Criterios de aceptación:**
  - Dado un lead magnet con canal Typeform, Google Forms, landing o ManyChat, cuando alguien lo pide por ese canal, entonces aparece en la lista de leads de ese lead magnet.
  - Si se decide no medir un canal, ese canal ya no se ofrece al crear el lead magnet.
- **Tareas técnicas:** `[MKT-LEAD-MAGNETS-CAPTURA]`
- **Para confirmar:** Decisión: construir lo que falta o sacarlo de la pantalla (qué canales se miden).

### [H-MKT-27] Tener los videos de YouTube y sus números siempre actualizados
- **Funcionalidad:** F-MKT-27 · A medias
- **Historia:** Como founder, quiero que mis videos de YouTube y sus métricas se actualicen solos, para ver cómo rinden con el tiempo y no sólo el día que conecté el canal.
- **Criterios de aceptación:**
  - Dado un canal conectado, cuando pasa un día, entonces aparecen los videos nuevos y las métricas de los existentes cambian respecto del día de la conexión.
  - Al conectar el canal, la primera carga de videos termina completa aunque la pantalla se cierre.
- **Tareas técnicas:** `[YT-SIN-CRON]`
- **Para confirmar:** —

---

## Embudos y Lanzamientos

### [H-EMB-07] Ver los KPIs de plata de cada embudo con números propios
- **Funcionalidad:** F-EMB-07 · Con fallas
- **Historia:** Como founder, quiero ver el CAC, ROAS, costo y ganancia por lead, ticket promedio y LTV de cada embudo con la plata y el gasto que le corresponden a ese embudo, para decidir dónde poner la inversión sin confundir un embudo con el negocio entero.
- **Criterios de aceptación:**
  - Mientras no esté definido cómo se reparte la plata entre embudos, el detalle del embudo aclara que el gasto, la facturación y los KPIs de dinero son "de toda la organización".
  - Una vez definido, dados dos embudos de la misma empresa configurados con productos o cuentas publicitarias distintas, cada uno muestra gasto y facturación distintos.
  - Dados cobros en dos monedas distintas, el embudo no los suma como si fueran la misma: toma sólo los de su moneda (o los convierte) y avisa que hay montos en otra moneda.
  - Los KPIs se probaron con cuentas reales de Meta, Hyros, Whop y Commas y el resultado quedó anotado.
- **Tareas técnicas:** `[EMBUDOS-MEDIDAS-POR-EMBUDO]`, `[EMBUDOS-MONEDAS]`, `[EMBUDOS-CUENTAS-REALES]`
- **Para confirmar:** Agustín: cómo se asignan cobros y gasto a cada embudo (por producto de Whop/Commas, por campaña o cuenta de Meta, por cuenta de Hyros).
  Agustín: con varias monedas, ¿alcanza con filtrar por la moneda del embudo o hace falta convertir? (si se convierte, de dónde sale la cotización).

### [H-EMB-11] Medir las conversaciones del embudo de mensajes directos
- **Funcionalidad:** F-EMB-11 · No funciona
- **Historia:** Como founder, quiero que el embudo de mensajes directos cuente las conversaciones abiertas, las respondidas y las que terminaron en un turno agendado, para saber si mi estrategia por DM está generando llamadas.
- **Criterios de aceptación:**
  - Dado un embudo DM nuevo, sus pasos de conversaciones leen de la fuente de mensajes que se usa hoy (no del inbox viejo, que está vacío).
  - Dado un negocio que nunca tuvo conversaciones cargadas, esos pasos muestran "sin datos" en vez de un cero que parece medido.
  - Con conversaciones reales en el período, los pasos muestran números distintos de cero y coinciden con lo que se ve en el inbox.
- **Tareas técnicas:** `[EMBUDOS-DM-DEFAULTS]`, `[EMBUDOS-SIGNAL-INCONSISTENTE]`, `[EMBUDO-PANEL-DMS]`
- **Para confirmar:** Agustín: de dónde salen las conversaciones del DM (las oportunidades de GoHighLevel, o guardar conteos del inbox de Zernio). Sin esa decisión no se puede construir.

### [H-EMB-12] Que el gasto de anuncios de cada día quede guardado solo
- **Funcionalidad:** F-EMB-12 · Sin verificar
- **Historia:** Como founder, quiero que todas las noches se guarde el gasto, alcance, impresiones y clicks del día anterior de cada anuncio de Meta, para tener la historia de lo invertido sin depender de mirar Meta todos los días.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Zernio con anuncios activos y el resultado quedó anotado: los valores guardados de un día coinciden con los de Meta y correr dos veces el mismo día no duplica nada.
  - Si la captura falla para alguna empresa, la corrida nocturna queda marcada como fallida (y el error se ve en el monitoreo), en vez de figurar como exitosa.
- **Tareas técnicas:** `[EMBUDOS-CUENTAS-REALES]`, `[EMBUDOS-CRON-ERRORES]`
- **Para confirmar:** —

### [H-EMB-13] Contar los comentarios como disparadores del embudo DM
- **Funcionalidad:** F-EMB-13 · Sin verificar
- **Historia:** Como founder, quiero que los comentarios que recibo en mis cuentas conectadas a Zernio cuenten como disparadores del embudo DM, para medir cuánta gente arranca la conversación desde una publicación.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Zernio con comentarios y el resultado quedó anotado: el paso de disparadores muestra un número cuando el período tiene comentarios.
  - Dado un período viejo (fuera de lo que Zernio devuelve) o Zernio desconectado, el paso muestra "sin datos" y no un cero.
- **Tareas técnicas:** `[EMBUDOS-CUENTAS-REALES]`
- **Para confirmar:** Agustín: hoy se cuentan los comentarios de todas las cuentas conectadas, sin separar por red; ¿está bien así o cada embudo debería elegir qué cuenta cuenta?

### [H-EMB-14] Registrar sin pérdidas los cobros de Whop y Commas
- **Funcionalidad:** F-EMB-14 · Con fallas
- **Historia:** Como founder, quiero conectar Whop y Commas y que cada cobro, reembolso y valor contratado quede registrado, para que la facturación de mis embudos sea la real.
- **Criterios de aceptación:**
  - Si falla el guardado de un aviso de cobro, Limitless le responde a Whop que falló para que lo vuelva a mandar; en Commas, que no reintenta, queda una alerta registrada.
  - Un cobro que quedó con error o sin interpretar se puede volver a procesar (por reintento del proveedor o con una herramienta de reproceso) y termina registrado.
  - Probado con cuentas reales de Whop y Commas y el resultado quedó anotado: compra, suscripción con y sin fin, y reembolso quedan procesados y con los mismos montos que el panel del proveedor.
  - Los cobros anteriores a la conexión se pueden traer desde Whop y Commas.
- **Tareas técnicas:** ~~EMBUDOS-WEBHOOK-PERDIDA~~ (resuelta en SCRUM-6), `[EMBUDOS-PAGOS-VERIFICAR]`, `[EMBUDOS-CUENTAS-REALES]`, `[EMBUDOS-PAGOS-BACKFILL]`
- **Para confirmar:** Martín: traer los cobros anteriores ¿entra en esta historia o se separa? Hoy es la condición para que retención y LTV tengan historia (ver H-EMB-15).

### [H-EMB-15] Ver retención y LTV con un año de cobros
- **Funcionalidad:** F-EMB-15 · Sin verificar
- **Historia:** Como founder, quiero ver compras repetidas, retención y LTV calculados con los cobros del último año, para saber cuánto vale un cliente a lo largo del tiempo y cuánto puedo pagar por conseguirlo.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Whop o Commas y el resultado quedó anotado: los números de retención y LTV coinciden con un cálculo a mano sobre los cobros del proveedor.
  - Dado un negocio que acaba de conectar Whop o Commas, el cálculo incluye los cobros de los 365 días anteriores (traídos del proveedor), no sólo los que llegaron desde la conexión.
  - Dados cobros en monedas distintas, no se suman como si fueran la misma.
- **Tareas técnicas:** `[EMBUDOS-PAGOS-VERIFICAR]`, `[EMBUDOS-PAGOS-BACKFILL]`, `[EMBUDOS-MONEDAS]`, `[EMBUDOS-CUENTAS-REALES]`
- **Para confirmar:** —

### [H-EMB-16] Seguir las oportunidades de GoHighLevel etapa por etapa
- **Funcionalidad:** F-EMB-16 · Con fallas
- **Historia:** Como founder, quiero traer mis pipelines de GoHighLevel y que cada cambio de etapa de una oportunidad quede registrado, para ver en el embudo cuántas oportunidades se crean, avanzan y se ganan.
- **Criterios de aceptación:**
  - Probado con una sub-cuenta real de GoHighLevel y el resultado quedó anotado: al mover una oportunidad, el aviso llega, queda guardado y se toma el identificador correcto de la oportunidad (no el del contacto).
  - Si falla el guardado de un aviso, GoHighLevel recibe un error y lo reintenta; un aviso que quedó con error se puede volver a procesar.
  - Al conectar, las oportunidades que ya existían entran con su etapa actual sin contarse como "creadas" en el período.
  - "Ganadas" cuenta sólo las oportunidades que pasaron a ganada en el período, no las que ya estaban ganadas y cambiaron de etapa.
  - Un aviso repetido o viejo reenviado no se registra dos veces, y la clave de conexión no queda escrita en la dirección del aviso.
- **Tareas técnicas:** `[EMBUDOS-GHL-ENTREGA]`, ~~EMBUDOS-WEBHOOK-PERDIDA~~ (resuelta en SCRUM-6), `[EMBUDOS-GHL-BACKFILL]`, `[EMBUDOS-GHL-WON]`, `[EMBUDOS-GHL-WEBHOOK-HARDENING]`
- **Para confirmar:** Martín: son cinco tareas; conviene partirla (verificación y pérdida de avisos primero, conteos después).

### [H-EMB-17] Ver en el embudo cómo rinde el VSL de VTurb
- **Funcionalidad:** F-EMB-17 · Sin verificar
- **Historia:** Como founder, quiero conectar VTurb y ver en el embudo las visitas, reproducciones, % visto, llegadas al pitch y clicks al botón de mi VSL, para saber en qué parte del video pierdo a la gente.
- **Criterios de aceptación:**
  - Probado con una cuenta real de VTurb y el resultado quedó anotado: los números del embudo coinciden con el panel de VTurb.
  - Dado un video con el momento del pitch configurado, el paso "llegó al pitch" muestra un número en vez de quedar vacío.
  - Si VTurb tarda o no responde, la página del embudo igual carga y esos pasos muestran "sin datos".
- **Tareas técnicas:** `[EMBUDOS-CUENTAS-REALES]`, `[EMBUDOS-VTURB-PITCH]`, `[EMBUDOS-TIMEOUTS]`
- **Para confirmar:** Agustín: el momento del pitch ¿se configura sólo en VTurb o también se puede cargar en Limitless (como en WebinarJam)?

### [H-EMB-18] Medir webinars de WebinarJam sin sincronizar a mano
- **Funcionalidad:** F-EMB-18 · Sin verificar
- **Historia:** Como founder, quiero conectar WebinarJam o EverWebinar y ver registrados, asistentes y quiénes se quedaron hasta la oferta, para saber cuánto convierte cada webinar.
- **Criterios de aceptación:**
  - Probado con una cuenta real de WebinarJam y el resultado quedó anotado: la clave está cargada, la conexión trae los webinars y cada webinar a usar tiene cargado el segundo del pitch.
  - Sin tocar ningún botón, el conteo de registrantes de un embudo Webinar se actualiza varias veces por día, y el catálogo de webinars una vez por día.
  - Sincronizar varias veces no duplica registrantes (aunque WebinarJam no mande el horario del webinar), y si se llega al tope de registrantes que se traen, queda avisado.
- **Tareas técnicas:** `[WEBINARJAM-API-KEY]`, `[EMBUDOS-SYNC-PROGRAMADO]`, `[EMBUDOS-WJ-SCHEDULE-NULL]`, `[EMBUDOS-CUENTAS-REALES]`
- **Para confirmar:** Agustín: pedir la clave de WebinarJam es un trámite externo; confirmar que se hace.

### [H-EMB-19] Ver lo que atribuye Hyros en el embudo
- **Funcionalidad:** F-EMB-19 · Sin verificar
- **Historia:** Como founder, quiero conectar Hyros, elegir modelo de atribución y cuentas publicitarias, y ver revenue y gasto atribuidos, opt-ins y visitantes, para medir el embudo con la atribución que ya uso.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Hyros y el resultado quedó anotado: los números del embudo coinciden con el panel de Hyros para el mismo período y modelo.
  - Si Hyros tarda o no responde, la página del embudo igual carga y esos pasos muestran "sin datos".
  - Mientras no esté definido cómo se reparte por embudo, las cifras de Hyros aclaran que son de toda la organización.
- **Tareas técnicas:** `[EMBUDOS-CUENTAS-REALES]`, `[EMBUDOS-TIMEOUTS]`, `[EMBUDOS-MEDIDAS-POR-EMBUDO]`
- **Para confirmar:** —

### [H-EMB-21] Ver en semáforo si cada paso del embudo está sano
- **Funcionalidad:** F-EMB-21 · A medias
- **Historia:** Como founder, quiero ver en verde, amarillo o rojo si cada paso y cada KPI del embudo está sano, en observación o por debajo del estándar, para detectar de un vistazo dónde se rompe.
- **Criterios de aceptación:**
  - Dado un embudo con datos, cada paso y cada KPI muestra su color según las bandas del estándar, en vez del texto de referencia que se ve hoy.
  - Si la empresa definió sus propios valores de referencia, el color usa esos valores.
  - El embudo muestra un diagnóstico de dónde se rompe.
- **Tareas técnicas:** `[EMBUDOS-SALUD]`
- **Para confirmar:** Decisión: construir lo que falta o sacarlo de la pantalla. La tarea está en pausa hasta que Santiago la habilite.

### [H-EMB-22] Guardar la historia de cada embudo y sumarla al pulso diario
- **Funcionalidad:** F-EMB-22 · A medias
- **Historia:** Como founder, quiero que cada embudo guarde sus números por período y que el pulso diario me cuente cómo vienen, para comparar contra meses anteriores y enterarme de una rotura sin entrar a mirar.
- **Criterios de aceptación:**
  - Sin tocar nada, cada embudo activo queda guardado periódicamente con sus números del período.
  - Los números que Zernio sólo muestra por poco tiempo (como los comentarios) siguen visibles para períodos pasados.
  - El pulso diario incluye los números de los embudos (gasto, leads, costo por lead, agendas, roturas), si así se decide.
- **Tareas técnicas:** `[EMBUDOS-SNAPSHOTS]`
- **Para confirmar:** Decisión: construir lo que falta o sacarlo de la pantalla.
  Agustín: ¿el pulso diario que ya existe tiene que sumar los números de los embudos?

### [H-EMB-23] Planificar y analizar lanzamientos
- **Funcionalidad:** F-EMB-23 · A medias
- **Historia:** Como founder, quiero crear lanzamientos con objetivos, cargar sus métricas diarias y generar un post-mortem con IA, para aprender de cada lanzamiento.
- **Criterios de aceptación:**
  - Dado que entro a Lanzamientos desde el menú, puedo crear un lanzamiento con sus objetivos en vez de ver "Próximamente".
  - Puedo cargar métricas diarias y generar el post-mortem, y lo que yo escribí en el lanzamiento no puede alterar las instrucciones que recibe la IA.
  - Si se decide no reactivarlo, se saca lo que no se usa y el tablero sigue pudiendo asignar tareas a un lanzamiento.
- **Tareas técnicas:** `[LANZAMIENTOS-DORMIDO]`
- **Para confirmar:** Decisión: construir lo que falta o sacarlo de la pantalla.

---

## Agente de negocio e IA

### [H-IA-01] Chatear con el agente sin que se corte
- **Funcionalidad:** F-IA-01 · Con fallas
- **Historia:** Como founder, quiero chatear con el agente de negocio y ver la respuesta escribiéndose en vivo aunque la conversación sea larga o mi clave de Claude haya dejado de andar, para no quedarme sin respuesta en medio del trabajo.
- **Criterios de aceptación:**
  - Dada una organización con clave propia de Claude que Anthropic dejó de aceptar, cuando mando un mensaje en el agente, entonces recibo la respuesta igual (con la clave de Limitless) y la clave queda marcada como rechazada en Ajustes.
  - Si el problema con la clave aparece cuando la respuesta ya empezó a escribirse, la respuesta no se duplica ni se vuelve a empezar.
  - Dada una conversación muy larga, cuando mando un mensaje nuevo y falla el paso de resumir lo anterior, igual recibo la respuesta (tomando los últimos mensajes) en lugar de un error.
  - Cuando termino el primer intercambio de una conversación nueva, la conversación queda con su título automático en el historial.
- **Tareas técnicas:** `[AGENTE-SIN-FALLBACK-CLAVE]`, `[AGENTE-COMPACTION-FRAGIL]`
- **Para confirmar:** Martín: la fila también nombra el ahorro de costo por reutilizar contexto (AGENTE-CACHE-INEFECTIVO) y la protección contra textos maliciosos (AUDITORIA-ABIERTOS §3.6); los dejé fuera porque no cambian lo que ve el usuario en el chat (el segundo está en H-IA-13 y H-IA-10).

### [H-IA-03] Que el agente sólo muestre los datos que cada uno puede ver
- **Funcionalidad:** F-IA-03 · Con fallas
- **Historia:** Como founder, quiero que el agente consulte los datos reales de todos los módulos respetando los permisos de cada miembro y con la foto completa del negocio, para que cada uno obtenga respuestas correctas sin ver lo que no le corresponde.
- **Criterios de aceptación:**
  - Dado un miembro del equipo con acceso al agente pero sin acceso a Finanzas ni a Clientes, cuando le pregunta al agente por facturación o por clientes, entonces el agente no le da esos datos.
  - Dado ese mismo miembro, las respuestas del agente no incluyen partes de conversaciones de otros usuarios de la organización.
  - Dada una organización con leads y piezas de contenido cargadas, cuando le pido al agente el resumen del negocio, entonces incluye los datos de DMs/leads y de marketing (no aparecen vacíos).
- **Tareas técnicas:** `[PERMISOS-SERVER-ACTIONS/agente-ia]`, `[INTELIGENCIA-FUENTES-LEGACY]`
- **Para confirmar:** —

### [H-IA-09] Ver y borrar un Canvas guardado en la base de conocimiento
- **Funcionalidad:** F-IA-09 · A medias
- **Historia:** Como founder, quiero que un Canvas que guardo en la base de conocimiento aparezca ahí como cualquier otro documento, para poder verlo, controlarlo y borrarlo si ya no quiero que el agente lo use.
- **Criterios de aceptación:**
  - Dado un Canvas que guardo desde el chat, cuando entro a la base de conocimiento, entonces lo veo como una nota más, con su estado de indexado.
  - Cuando lo borro desde la base de conocimiento, el agente deja de usarlo en sus respuestas.
- **Tareas técnicas:** `[RAG-CANVAS-INVISIBLE]`
- **Para confirmar:** —

### [H-IA-10] Que el agente cree un SOP sólo cuando yo se lo pido
- **Funcionalidad:** F-IA-10 · Con fallas
- **Historia:** Como founder, quiero que el agente arme un SOP en borrador sólo cuando se lo pido en el chat, para que un texto de un tercero (un DM, una llamada, un documento) no pueda hacerle crear SOPs o tareas que nadie pidió.
- **Criterios de aceptación:**
  - Cuando le pido al agente en el chat que arme un SOP, se crea en borrador.
  - Dado un documento de la base de conocimiento que contiene la instrucción escondida para crear un SOP, cuando lo consulto desde el agente, entonces no se crea ningún SOP.
  - Dado un dato de un lead o de una llamada con instrucciones escondidas, cuando el agente lo lee, entonces no crea ni modifica tareas del tablero por su cuenta.
- **Tareas técnicas:** `[AUDITORIA-ABIERTOS §3.6]`
- **Para confirmar:** —

### [H-IA-13] Respuestas con el contexto del negocio, seguras y sin mezclar usuarios
- **Funcionalidad:** F-IA-13 · Con fallas
- **Historia:** Como founder, quiero que el agente responda usando los datos de mi organización, los documentos cargados y el cerebro global de Limitless sin que textos de terceros lo manipulen ni se mezclen conversaciones de otros usuarios, para confiar en lo que me dice.
- **Criterios de aceptación:**
  - Dado un documento o dato con texto que intenta darle órdenes al agente, cuando el agente lo usa como contexto, entonces lo trata como información y no como instrucción (no cambia su respuesta ni hace acciones por eso).
  - Dado un miembro del equipo, cuando pregunta algo, entonces el contexto que usa el agente no incluye fragmentos de conversaciones de otros usuarios de la organización.
  - Dado un miembro sin acceso a Finanzas o Clientes, el agente no le trae datos de esos módulos como contexto.
- **Tareas técnicas:** `[AUDITORIA-ABIERTOS §3.6]`, `[PERMISOS-SERVER-ACTIONS/agente-ia]`
- **Para confirmar:** —

### [H-IA-15] Volver a sincronizar un Google Doc o Sheet importado
- **Funcionalidad:** F-IA-15 · A medias
- **Historia:** Como founder, quiero volver a sincronizar un Google Doc o Google Sheet que ya importé a la base de conocimiento, para que el agente use la versión actual y no la que estaba el día que lo importé.
- **Criterios de aceptación:**
  - Dado un Google Doc importado que después cambié en Google, cuando aprieto "Sincronizar" en la base de conocimiento, entonces el visor muestra el contenido nuevo y el agente responde con la versión actualizada.
  - Si el indexado falla por un corte momentáneo, el sistema lo vuelve a intentar solo y el documento no queda en "error" para siempre.
- **Tareas técnicas:** `[KB-GOOGLE-SIN-RESYNC]`, `[RAG-INGESTA-SIN-REINTENTO]`
- **Para confirmar:** Agustín: decisión: construir el botón "Sincronizar" o sacar la promesa y dejar sólo la importación única.

### [H-IA-18] Recibir el informe de inteligencia completo y a tiempo
- **Funcionalidad:** F-IA-18 · Con fallas
- **Historia:** Como founder, quiero que el informe de inteligencia que se genera dos veces por día use todos los datos reales del negocio y no falle ni salga repetido, para decidir con una foto confiable.
- **Criterios de aceptación:**
  - Dada una organización con leads y piezas de contenido, cuando se genera el informe, entonces en Inteligencia y en el Área del fundador aparecen datos de DMs/leads y de marketing (no vacíos).
  - Si la generación falla por un error momentáneo de la IA, el sistema lo reintenta solo y el informe aparece igual.
  - Un reintento no deja dos informes iguales del mismo momento.
  - Las organizaciones dadas de baja no generan informes.
- **Tareas técnicas:** `[INTELIGENCIA-FUENTES-LEGACY]`, `[INTELIGENCIA-SIN-REINTENTO]`, `[REPORTES-DUPLICADOS]`, `[CRONS-ORGS-INACTIVAS]`
- **Para confirmar:** Agustín: cuánto tiempo guardar los informes viejos (hoy se guardan dos por día para siempre).

### [H-IA-19] Recibir un pulso diario que hable sólo del día
- **Funcionalidad:** F-IA-19 · Con fallas
- **Historia:** Como founder, quiero que el pulso diario de cada mañana resuma lo que pasó en el último día con todos los datos del negocio, para reaccionar a lo de hoy y no a problemas de hace dos semanas.
- **Criterios de aceptación:**
  - El pulso diario usa sólo los datos del último día (y el semanal los de la última semana), no los mismos 14 días.
  - Dada una organización con leads y piezas de contenido, el pulso incluye datos de DMs/leads y de marketing.
  - Se leyeron 3 a 5 pulsos reales contra lo que pasó ese día y el resultado quedó anotado; si inflaban riesgos, se corrigió.
- **Tareas técnicas:** `[REPORTES-PULSO-DIARIO]`, `[REPORTES-VENTANA-FIJA]`, `[INTELIGENCIA-FUENTES-LEGACY]`
- **Para confirmar:** —

### [H-IA-20] Recibir el reporte semanal con la semana correcta
- **Funcionalidad:** F-IA-20 · Con fallas
- **Historia:** Como founder, quiero que el reporte ejecutivo de cada lunes hable de la semana que terminó, con todos los datos del negocio y sin repetidos, para revisar la semana con información correcta.
- **Criterios de aceptación:**
  - Dado el reporte que se genera un lunes, cuando lo abro, entonces el título dice las fechas de la semana anterior (lunes a domingo que ya pasaron).
  - Dada una organización con leads y piezas de contenido, el reporte incluye datos de DMs/leads y de marketing.
  - Si la generación se reintenta, queda un solo reporte para esa semana.
- **Tareas técnicas:** `[REPORTES-SEMANA-ETIQUETA]`, `[INTELIGENCIA-FUENTES-LEGACY]`, `[REPORTES-DUPLICADOS]`
- **Para confirmar:** —

### [H-IA-21] Recibir el reporte mensual del mes que cerró
- **Funcionalidad:** F-IA-21 · No funciona
- **Historia:** Como founder, quiero recibir el día 1 un reporte ejecutivo del mes que acaba de terminar, para ver cómo fue el mes completo.
- **Criterios de aceptación:**
  - Dado el día 1 de un mes, cuando se genera el reporte mensual, entonces está titulado con el mes anterior y resume los reportes semanales de ese mes.
  - El reporte aparece en el historial de reportes ejecutivos (no se saltea en silencio).
  - Dada una organización con leads y piezas de contenido, el reporte incluye datos de DMs/leads y de marketing.
- **Tareas técnicas:** `[REPORTES-MENSUAL-MES-EQUIVOCADO]`, `[INTELIGENCIA-FUENTES-LEGACY]`
- **Para confirmar:** —

### [H-IA-24] Que el agente escriba con el tono real del founder
- **Funcionalidad:** F-IA-24 · Con fallas
- **Historia:** Como founder, quiero que cada lunes el sistema aprenda cómo escribo a partir de todos mis textos reales, para que el agente me responda y redacte con mi tono.
- **Criterios de aceptación:**
  - Dado un founder con DMs y contenido cargados, cuando se analiza el tono, entonces el análisis tiene en cuenta esos textos (no sale vacío por falta de fuentes).
  - Si el análisis falla por un error momentáneo, el sistema lo reintenta solo.
  - Las organizaciones dadas de baja no se analizan.
- **Tareas técnicas:** `[INTELIGENCIA-FUENTES-LEGACY]`, `[INTELIGENCIA-SIN-REINTENTO]`, `[CRONS-ORGS-INACTIVAS]`
- **Para confirmar:** —

### [H-IA-25] Cargar mi clave de Claude y enterarme si deja de andar
- **Funcionalidad:** F-IA-25 · Con fallas
- **Historia:** Como founder, quiero cargar la clave de Claude de mi empresa, que sólo yo pueda cambiarla y que el sistema me avise si deja de funcionar o se queda sin créditos, para que la IA de mi organización no se corte sin que me entere.
- **Criterios de aceptación:**
  - Dado un miembro del equipo que no es founder, cuando intenta cambiar o borrar la clave de Claude, entonces recibe un error y la clave no cambia.
  - Dada la organización con la clave rechazada, cuando el founder entra a la plataforma, entonces ve la barra roja; se probó con esa organización y el resultado quedó anotado.
  - Dada una clave sin créditos, el founder lo ve marcado en Ajustes (o la IA sigue con la clave de Limitless, según lo que se decida).
- **Tareas técnicas:** `[1A1-CLAVE-ANTHROPIC-ROTA]`, `[PERMISOS-SERVER-ACTIONS/agente-ia]`, `[IA-CLAVE-SIN-CREDITOS]`
- **Para confirmar:** Agustín: una organización cuya clave se quedó sin créditos, ¿sigue con la clave de Limitless o queda sin IA hasta que cargue créditos?

### [H-IA-26] Seguir con la IA de Limitless si mi clave es rechazada
- **Funcionalidad:** F-IA-26 · Sin verificar
- **Historia:** Como founder, quiero que si Anthropic rechaza la clave de mi empresa el sistema siga trabajando con la clave de Limitless, para que el análisis de llamadas, los reportes y el agente no se detengan.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Anthropic y el resultado quedó anotado: con la clave de la organización rechazada y la de Limitless cargada, las llamadas de esa organización se procesan y la clave queda marcada como rechazada.
  - Dada una clave rechazada, cuando mando un mensaje en el agente, entonces recibo respuesta igual.
  - Quedó decidido y anotado hasta cuándo una organización con clave rechazada puede usar la clave de Limitless, y se avisó a las organizaciones que están en esa situación.
- **Tareas técnicas:** `[1A1-CLAVE-ANTHROPIC-ROTA]`, `[AGENTE-SIN-FALLBACK-CLAVE]`, `[IA-CLAVES-INVALIDAS]`
- **Para confirmar:** Martín: hoy no se sabe si la clave de Limitless está cargada en producción; confirmar con quien administra Vercel antes de estimar.

### [H-IA-27] Ver el costo real de la IA por organización
- **Funcionalidad:** F-IA-27 · A medias
- **Historia:** Como super admin de Limitless, quiero ver el costo de cada uso de IA por organización con precios correctos y sin usos que falten, para saber cuánto nos cuesta cada cliente.
- **Criterios de aceptación:**
  - El costo registrado de cada modelo coincide con el precio publicado por Anthropic.
  - Los usos que hoy no se cuentan (indexado de documentos y resúmenes del cerebro global) aparecen en el registro de costos.
  - El trabajo de plataforma (cerebro global) queda registrado a nombre de Limitless, no de una organización cliente.
- **Tareas técnicas:** `[IA-COSTOS-INCOMPLETOS]`, `[IA-CLAVE-DE-CLIENTE-EN-SUPERADMIN]`
- **Para confirmar:** —

### [H-IA-28] Cargar el cerebro global sin usar la clave de un cliente
- **Funcionalidad:** F-IA-28 · Con fallas
- **Historia:** Como super admin de Limitless, quiero cargar documentos al cerebro global y generar sus resúmenes usando sólo la clave de Limitless, para no usar ni cobrarle a un cliente trabajo que es de la plataforma.
- **Criterios de aceptación:**
  - Sin la clave de Limitless cargada, generar resúmenes del cerebro global muestra un error claro y no usa la clave de ninguna organización cliente.
  - Con la clave de Limitless cargada, cada tanda de resúmenes deja registrado su costo a nombre de la plataforma.
- **Tareas técnicas:** `[IA-CLAVE-DE-CLIENTE-EN-SUPERADMIN]`
- **Para confirmar:** —

---

## Operaciones y equipo

### [H-OPS-04] Que cerrar una tarea arrastrándola quede registrado
- **Funcionalidad:** F-OPS-04 · Con fallas
- **Historia:** Como miembro del equipo, quiero que al pasar una tarea a Hecho arrastrándola en el tablero quede registrado quién la cerró y cuándo, igual que si la cierro desde el detalle, para que el founder vea bien quién terminó qué.
- **Criterios de aceptación:**
  - Dada una tarea en el tablero, cuando la arrastro a Hecho, entonces queda registrado que la cerré yo y en qué momento.
  - Cuando la arrastro de Hecho a otra columna, se limpia quién la cerró y cuándo.
  - Cerrar desde el detalle sigue funcionando igual.
- **Tareas técnicas:** `[WORKBOARD-CIERRE-ARRASTRANDO]`
- **Para confirmar:** —

### [H-OPS-05] Ver horas y costo por persona
- **Funcionalidad:** F-OPS-05 · A medias
- **Historia:** Como founder, quiero cargar la tarifa por hora de cada miembro y ver cuántas horas y cuánto costo lleva cada uno, para saber cuánto me cuesta el trabajo del equipo.
- **Criterios de aceptación:**
  - Dado que estoy en Equipo como founder o admin, puedo cargar y cambiar la tarifa por hora de un miembro; un miembro común no ve esa opción.
  - Con la tarifa cargada, el reporte muestra el costo de ese miembro según sus horas.
  - En una tarea con varios responsables, el tiempo se le atribuye a quien lo cargó (si así se decide), no todo al primero.
- **Tareas técnicas:** `[EQUIPO-TARIFA-SIN-UI]`, `[WORKBOARD-TIEMPO-PRIMER-RESPONSABLE]`
- **Para confirmar:** Agustín: el tiempo de una tarea compartida ¿va a quien lo cargó o se reparte entre los responsables?

### [H-OPS-08] Que las tareas que crea el agente muestren al responsable correcto
- **Funcionalidad:** F-OPS-08 · Con fallas
- **Historia:** Como founder, quiero que las tareas que crea o cambia el agente, las propuestas de Fathom o "mandar al tablero" queden con los responsables y el cierre bien registrados, para confiar en el tablero sin corregirlo a mano.
- **Criterios de aceptación:**
  - Dada una tarea con dos responsables, cuando le pido al agente que la reasigne, entonces la tarjeta muestra al nuevo responsable.
  - Cuando el agente, Fathom o "mandar al tablero" pasa una tarea a Hecho, queda registrado quién la cerró y cuándo.
  - Hay una prueba automática de la forma común de guardar tareas.
- **Tareas técnicas:** `[WORKBOARD-ASIGNACION-AGENTE]`
- **Para confirmar:** —

### [H-OPS-11] Armar un SOP a partir de un video
- **Funcionalidad:** F-OPS-11 · Sin verificar
- **Historia:** Como founder, quiero subir un video (por ejemplo un Loom) y recibir el SOP escrito con la lista de lo que el video no aclara, para documentar procesos sin escribirlos desde cero.
- **Criterios de aceptación:**
  - Probado con una cuenta real (video subido de punta a punta) y el resultado quedó anotado, incluido qué pasó con el intento que ya existe en producción.
  - Un video del tamaño máximo permitido, y uno de alrededor de una hora, terminan con el SOP listo sin error.
  - Si no se puede leer la duración del video, el proceso termina con un mensaje claro de error en vez de fallar sin explicación.
  - Cuando el SOP queda listo, el video se borra del almacenamiento (la transcripción queda guardada).
- **Tareas técnicas:** `[D-SOPS-VIDEO-NUNCA-CORRIO]`, `[OPS-SOP-VIDEO-MEMORIA]`, `[OPS-SOP-VIDEO-NO-SE-BORRA]`
- **Para confirmar:** Agustín: si el proceso falla, ¿el video se guarda para reintentar o se borra igual?

### [H-OPS-13] Editar o borrar un SOP ya guardado
- **Funcionalidad:** F-OPS-13 · A medias
- **Historia:** Como founder, quiero editar o borrar un SOP que ya guardé y ver sus versiones anteriores, para mantener los procesos al día sin perder lo que había.
- **Criterios de aceptación:**
  - Dado un SOP guardado, cuando lo abro, puedo editarlo y al guardar queda una versión nueva en su historial.
  - Puedo borrar o archivar un SOP y deja de aparecer como vigente.
  - Todo SOP nuevo queda con su primera versión en el historial.
- **Tareas técnicas:** `[SOPS-EDITAR]`
- **Para confirmar:** —

### [H-OPS-19] Dar de alta a un miembro con el rol correcto
- **Funcionalidad:** F-OPS-19 · Con fallas
- **Historia:** Como founder, quiero dar de alta a un miembro con un rol y que reciba una contraseña temporal para su primer ingreso, para sumar gente al equipo con el acceso justo.
- **Criterios de aceptación:**
  - Dado que invito a un miembro con un rol de mi empresa, queda creado con ese rol y su acceso limitado a lo que el rol permite.
  - Si se intenta dar de alta con un rol que no es de mi empresa, da error y no se crea el miembro.
  - Un admin puede (o no) dar de alta miembros según lo que se decida, y la pantalla y el sistema se comportan igual.
- **Tareas técnicas:** ~~EQUIPO-CUSTOM-ROLE-ORG~~ (resuelta en SCRUM-75), `[EQUIPO-ADMIN]`
- **Para confirmar:** Agustín: ¿el rol admin puede gestionar el equipo (dar de alta, cambiar roles, desactivar) o sólo el founder?

### [H-OPS-20] Que los permisos por rol protejan los datos, no sólo las pantallas
- **Funcionalidad:** F-OPS-20 · Con fallas
- **Historia:** Como founder, quiero crear roles y decidir por módulo si no tienen acceso, sólo ven o tienen acceso completo, y que eso se cumpla de verdad, para que cada persona toque sólo lo que le corresponde.
- **Criterios de aceptación:**
  - Dado un miembro con Finanzas o Equipo en "Sin acceso", aunque intente guardar gastos, compensaciones, liquidaciones o cambios de equipo por fuera de la pantalla, no puede y no se guarda nada.
  - Dado un miembro con Finanzas en "Ver", no ve los botones de edición y si intenta editar un gasto, falla.
  - Un miembro no puede cambiar los permisos de su propio rol.
  - Hay una prueba automática de los tres niveles: sin acceso, ver y completo.
- **Tareas técnicas:** `[PERMISOS-SERVER-ACTIONS/ops-fin-prod]`, `[PERMISOS-SERVER-ACTIONS]`
- **Para confirmar:** Agustín: confirmar que "Ver" significa "no puede editar nada del módulo".

### [H-OPS-21] Cambiarle el rol a un miembro
- **Funcionalidad:** F-OPS-21 · Con fallas
- **Historia:** Como founder, quiero cambiarle el rol a un miembro, para ajustar su acceso cuando cambia su función.
- **Criterios de aceptación:**
  - Dado un miembro, cuando le asigno otro rol de mi empresa, su acceso cambia según ese rol.
  - Si se intenta asignar un rol que no es de mi empresa, da error y el miembro no cambia.
  - Hay una prueba automática que cubre los dos casos.
- **Tareas técnicas:** ~~EQUIPO-CUSTOM-ROLE-ORG~~ (resuelta en SCRUM-75)
- **Para confirmar:** —

### [H-OPS-22] Cortarle el acceso a un miembro desactivado
- **Funcionalidad:** F-OPS-22 · No funciona
- **Historia:** Como founder, quiero desactivar a un miembro y que deje de entrar en ese momento, para que alguien que se fue del equipo no pueda ver ni tocar los datos del negocio.
- **Criterios de aceptación:**
  - Dado un miembro con la sesión abierta, cuando lo desactivo en Equipo, al recargar cualquier página queda sin acceso.
  - Si intenta iniciar sesión otra vez con su usuario y contraseña, no puede entrar.
  - Hay una prueba automática que cubre que un miembro inactivo no pasa.
- **Tareas técnicas:** ~~EQUIPO-DESACTIVAR-NO-BLOQUEA~~ (resuelta en SCRUM-8)
- **Para confirmar:** —

---

## Finanzas

### [H-FIN-05] Cargar gastos fijos con totales correctos
- **Funcionalidad:** F-FIN-05 · Con fallas
- **Historia:** Como founder, quiero cargar, editar, pausar y borrar mis gastos fijos, mensuales o anuales, y ver totales que no mezclen monedas, para saber cuánto me cuesta operar.
- **Criterios de aceptación:**
  - Dados gastos en pesos y en dólares, los totales se muestran separados por moneda (o convertidos), o avisan que hay más de una moneda.
  - Un miembro con Finanzas en "Sin acceso" o "Ver" no puede crear, editar ni borrar gastos, ni siquiera por fuera de la pantalla.
- **Tareas técnicas:** `[FIN-MONEDAS]`, `[PERMISOS-SERVER-ACTIONS/ops-fin-prod]`
- **Para confirmar:** Agustín: ¿alcanza con separar por moneda o hay que convertir? (si se convierte, de dónde sale la cotización).

### [H-FIN-06] Cargar suscripciones con totales correctos
- **Funcionalidad:** F-FIN-06 · Con fallas
- **Historia:** Como founder, quiero cargar, editar y borrar las herramientas pagas del negocio y ver su total sin mezclar monedas, para controlar cuánto gasto en suscripciones.
- **Criterios de aceptación:**
  - Dadas suscripciones en pesos y en dólares, el total se muestra separado por moneda (o convertido), o avisa que hay más de una moneda.
  - Un miembro con Finanzas en "Sin acceso" o "Ver" no puede crear, editar ni borrar suscripciones, ni siquiera por fuera de la pantalla.
- **Tareas técnicas:** `[FIN-MONEDAS]`, `[PERMISOS-SERVER-ACTIONS/ops-fin-prod]`
- **Para confirmar:** —

### [H-FIN-07] Definir la compensación del equipo y ver el gasto real del mes
- **Funcionalidad:** F-FIN-07 · Con fallas
- **Historia:** Como founder, quiero definir el sueldo fijo y la comisión de cada miembro y ver el gasto de equipo del mes, para saber cuánto me cuesta el equipo con el mismo número que después voy a pagar.
- **Criterios de aceptación:**
  - Para cada tipo de comisión (por venta, por facturación, por upsell, por agenda, personalizada), el gasto de equipo del mes da lo mismo que la liquidación.
  - La comisión por agenda de un setter cuenta sólo los turnos que agendó esa persona, no los de toda la empresa.
  - Un miembro con Finanzas en "Sin acceso" no puede ver ni cambiar la compensación de nadie.
- **Tareas técnicas:** `[FIN-PAYROLL-BASES]`, `[PERMISOS-SERVER-ACTIONS/ops-fin-prod]`
- **Para confirmar:** Agustín: qué cuenta como facturación mensual para la comisión por facturación, y de dónde sale quién agendó cada turno (Calendly o GoHighLevel).

### [H-FIN-08] Calcular bien la liquidación del mes
- **Funcionalidad:** F-FIN-08 · Con fallas
- **Historia:** Como founder, quiero que la liquidación del mes de cada miembro calcule bien el fijo más la comisión según su tipo, para pagarle a cada uno lo que corresponde.
- **Criterios de aceptación:**
  - Dado un miembro con comisión personalizada, la liquidación muestra la comisión calculada y no cero.
  - Una venta cerrada el último día del mes a la noche (hora de Argentina) cuenta en ese mes y no en el siguiente.
  - La liquidación da lo mismo que el gasto de equipo del mes.
  - Un miembro con Finanzas en "Sin acceso" no puede generar ni ver liquidaciones.
- **Tareas técnicas:** `[FIN-PAYROLL-BASES]`, `[FIN-MESES-UTC]`, `[PERMISOS-SERVER-ACTIONS/ops-fin-prod]`
- **Para confirmar:** —

### [H-FIN-11] Ver cobros y saldo de Stripe
- **Funcionalidad:** F-FIN-11 · A medias
- **Historia:** Como founder, quiero conectar mi cuenta de Stripe y ver mis cobros y saldo, para tener mi plata en un solo lugar.
- **Criterios de aceptación:**
  - Si se sigue: Stripe aparece en Integraciones, la conexión queda guardada de forma segura y los cobros de Stripe se ven en Finanzas.
  - Si no se sigue: la integración se saca y ninguna pantalla dice que Stripe alimenta los cobros.
- **Tareas técnicas:** `[FIN-STRIPE-MP-DECIDIR]`
- **Para confirmar:** Decisión: construir lo que falta o sacarlo de la pantalla.

### [H-FIN-12] Recibir los pagos de Mercado Pago
- **Funcionalidad:** F-FIN-12 · A medias
- **Historia:** Como founder, quiero conectar Mercado Pago y que sus avisos de pago queden registrados en mi cuenta, para ver esos cobros en Finanzas sin cargarlos a mano.
- **Criterios de aceptación:**
  - Si se sigue: un aviso de pago de Mercado Pago queda registrado sólo en la empresa dueña de esa cuenta, no en todas.
  - Si se sigue: un aviso viejo reenviado se rechaza.
  - Si no se sigue: la integración, su renovación diaria y sus avisos se sacan.
- **Tareas técnicas:** `[FIN-STRIPE-MP-DECIDIR]`, `[FIN-MP-WEBHOOK]`
- **Para confirmar:** Decisión: construir lo que falta o sacarlo de la pantalla.

---

## Producto

### [H-PRO-02] Ver insights del avatar cruzados con ventas
- **Funcionalidad:** F-PRO-02 · A medias
- **Historia:** Como founder, quiero abrir la ficha de un avatar y ver insights cruzados con mis ventas (como la objeción que más aparece), para ajustar el mensaje a lo que de verdad frena a ese cliente ideal.
- **Criterios de aceptación:**
  - Dado un negocio con llamadas analizadas, la ficha del avatar muestra al menos un insight basado en esas llamadas en vez de quedar vacía.
  - Si no se puede calcular un insight, la ficha no muestra la sección (o dice por qué), en vez de un espacio vacío.
- **Tareas técnicas:** `[PRODUCTO-METRICAS]`
- **Para confirmar:** Decisión: construir lo que falta o sacarlo de la pantalla.

### [H-PRO-04] Ver estadísticas reales de cada oferta
- **Funcionalidad:** F-PRO-04 · A medias
- **Historia:** Como founder, quiero ver por cada oferta sus clientes, ingresos del mes, tasa de cierre y objeción principal, para saber qué oferta vende mejor y qué la frena.
- **Criterios de aceptación:**
  - La tasa de cierre de una oferta se calcula con las llamadas de esa oferta, no la de toda la empresa (o, si no se puede, el dato no se muestra).
  - La objeción principal sale de las llamadas analizadas de esa oferta en vez de mostrar siempre "Sin datos" (o el campo se saca).
  - Con más de 1.000 llamadas, todas entran en el cálculo.
- **Tareas técnicas:** `[PRODUCTO-METRICAS]`
- **Para confirmar:** Decisión: construir lo que falta o sacarlo de la pantalla.

---

## Discord

### [H-DIS-01] Conectar el servidor de Discord de mi comunidad
- **Funcionalidad:** F-DIS-01 · Sin verificar
- **Historia:** Como founder, quiero conectar el servidor de Discord de mis alumnos desde Integraciones, para que la plataforma empiece a leer la actividad de mis clientes.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Discord y el resultado quedó anotado: desde Integraciones instalo el bot, vuelvo a la plataforma y el servidor queda asociado a mi organización.
  - El bot que queda instalado es el que está al día con el código actual (su despliegue apunta al repositorio vigente).
  - Antes de instalarlo en el servidor de un cliente, está decidido cuánto tiempo se guardan los mensajes y qué aviso ve la comunidad.
- **Tareas técnicas:** `[DISCORD-SIN-PROBAR]`, `[REPO-RENOMBRADO-DEPLOYS]`, `[E-RETENCION]`
- **Para confirmar:** Martín: la prueba manual de Discord arranca con el servidor ya conectado; sumar el paso de conexión al probarla.

### [H-DIS-02] Desconectar Discord desde la pantalla
- **Funcionalidad:** F-DIS-02 · A medias
- **Historia:** Como founder, quiero desconectar mi servidor de Discord desde Integraciones, para dejar de leer esa comunidad cuando ya no la uso o me equivoqué de servidor.
- **Criterios de aceptación:**
  - Dado Discord conectado, cuando abro su tarjeta en Integraciones, entonces tengo la opción de desconectar y, al confirmarla, la tarjeta queda como no conectada.
  - Dado un miembro sin acceso completo a Integraciones, cuando intenta desconectar Discord (incluso por fuera de la pantalla), entonces recibe un error de permiso y sigue conectado.
- **Tareas técnicas:** `[DISCORD-DESCONECTAR-SIN-UI]`, `[DISCORD-PERMISOS]`
- **Para confirmar:** —

### [H-DIS-03] Elegir qué canales se leen y de quién es cada uno
- **Funcionalidad:** F-DIS-03 · Sin verificar
- **Historia:** Como founder, quiero elegir qué canales de mi servidor se leen y marcar cada uno como comunitario, de un cliente o de logros, para que la actividad se asigne bien y el ruido del equipo quede afuera.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Discord y el resultado quedó anotado: los canales leídos aparecen como "Comunitario", los de logros con la marca "Logros", y al sacar un canal deja de leerse.
  - Dado un canal marcado "De un cliente" con un solo dueño, cuando alguien no asociado escribe ahí, entonces cuenta como actividad de ese cliente.
  - Dado un miembro sin acceso completo a Integraciones, cuando intenta cambiar la configuración de canales (incluso por fuera de la pantalla), entonces recibe un error de permiso.
- **Tareas técnicas:** `[DISCORD-SIN-PROBAR]`, `[DISCORD-PERMISOS]`
- **Para confirmar:** —

### [H-DIS-04] Que los canales nuevos de clientes se empiecen a leer solos
- **Funcionalidad:** F-DIS-04 · Sin verificar
- **Historia:** Como founder, quiero que cuando creo un canal para un cliente nuevo (por ejemplo "cliente-juan") se empiece a leer solo y el bot le pida vincularse, para no tener que configurarlo a mano cada vez.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Discord y el resultado quedó anotado: al crear un canal cuyo nombre empieza con el patrón configurado, aparece como canal leído en la pantalla de Discord.
  - Si el bot puede hablar, en ese canal nuevo saluda pidiendo `!vincular`; un canal con otro nombre no se empieza a leer.
- **Tareas técnicas:** `[DISCORD-SIN-PROBAR]`
- **Para confirmar:** Martín: la prueba manual de Discord no tiene un paso para el canal nuevo; sumarlo.

### [H-DIS-05] Que los mensajes de Discord queden guardados a nombre de cada cliente
- **Funcionalidad:** F-DIS-05 · Sin verificar
- **Historia:** Como founder, quiero que lo que escriben mis alumnos en los canales leídos quede guardado a nombre de cada cliente y que lo que escribe mi equipo no se cuente, para ver la actividad real de cada uno.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Discord y el resultado quedó anotado: un mensaje en un canal leído queda guardado con su texto completo.
  - Dado un alumno vinculado, cuando escribe, entonces el mensaje aparece en su ficha; dado alguien del equipo, su mensaje no se asigna a nadie.
  - Los mensajes más viejos que el plazo de guardado decidido se borran solos.
  - Hay pruebas automáticas de cómo el bot decide a qué cliente asignar cada mensaje.
- **Tareas técnicas:** `[DISCORD-SIN-PROBAR]`, `[E-RETENCION]`, `[DISCORD-BOT-SIN-TESTS]`
- **Para confirmar:** Agustín: ¿cuánto tiempo se guardan los mensajes de Discord?

### [H-DIS-06] Que un alumno se vincule a su ficha sin poder hacerse pasar por otro
- **Funcionalidad:** F-DIS-06 · Con fallas
- **Historia:** Como alumno en Discord, quiero vincularme a mi ficha escribiendo `!vincular` con mi email, para que mi actividad y mis logros cuenten a mi nombre y no al de otro.
- **Criterios de aceptación:**
  - Dado que alguien escribe `!vincular` con el email de otro alumno, entonces no se vincula directo: queda pendiente en el buzón (o de confirmar por mail).
  - Un nombre de Discord parecido al de un cliente ya no lo vincula automáticamente.
  - Dado un vínculo que se confirma, entonces los mensajes que esa persona escribió antes aparecen en la ficha del cliente (en el momento o al día siguiente).
  - Hay pruebas automáticas de los casos de `!vincular`.
- **Tareas técnicas:** `[DISCORD-VINCULAR-EMAIL-AJENO]`, `[DISCORD-VINCULO-SIN-REATRIBUIR]`, `[DISCORD-BOT-SIN-TESTS]`
- **Para confirmar:** Agustín: ¿un `!vincular` con email correcto pasa por el buzón del founder o se confirma con un mail al alumno?

### [H-DIS-07] Resolver las vinculaciones pendientes desde un buzón
- **Funcionalidad:** F-DIS-07 · Con fallas
- **Historia:** Como founder, quiero resolver desde un buzón los `!vincular` que no encontraron cliente, asignándolos a mano o descartándolos, para que toda la actividad de mis alumnos quede en su ficha.
- **Criterios de aceptación:**
  - Dado un pendiente en el buzón, cuando lo asigno a un cliente, entonces en la ficha de ese cliente aparecen también los mensajes que esa persona escribió antes del vínculo; probado con un servidor real y anotado.
  - Dado un miembro sin acceso completo a Integraciones, cuando intenta resolver el buzón (incluso por fuera de la pantalla), entonces recibe un error de permiso.
- **Tareas técnicas:** `[DISCORD-VINCULO-SIN-REATRIBUIR]`, `[DISCORD-PERMISOS]`
- **Para confirmar:** —

### [H-DIS-08] Asociar a quienes escriben sin estar vinculados
- **Funcionalidad:** F-DIS-08 · Sin verificar
- **Historia:** Como founder, quiero ver quién escribió en cada canal sin estar asociado, con una sugerencia de a qué cliente o persona del equipo corresponde, para asociarlo con un clic y que sus mensajes viejos pasen a su ficha.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Discord y el resultado quedó anotado: en "Quiénes escribieron acá" aparecen los nombres con su sugerencia y nivel de certeza.
  - Dado alguien sin asociar, cuando lo asocio a un cliente, entonces sus mensajes anteriores aparecen en la ficha; cuando lo marco como equipo, baja el contador de "sin asociar".
  - Dado un miembro sin acceso completo a Integraciones, cuando intenta asociar personas (incluso por fuera de la pantalla), entonces recibe un error de permiso.
- **Tareas técnicas:** `[DISCORD-SIN-PROBAR]`, `[DISCORD-PERMISOS]`
- **Para confirmar:** —

### [H-DIS-09] Ver la actividad de Discord de cada cliente y quién se quedó callado
- **Funcionalidad:** F-DIS-09 · Sin verificar
- **Historia:** Como miembro del equipo, quiero ver en la ficha y en la lista de clientes su actividad en Discord y una alerta cuando llevan 14 días sin escribir, para contactar a tiempo a los que se están enfriando.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Discord y el resultado quedó anotado: la ficha y la lista muestran los mensajes y la última actividad de cada cliente.
  - Dado un cliente que no escribe hace 14 días, entonces aparece la alerta de silencio; un mensaje en su canal escrito por otra persona no la apaga.
  - Dado un cliente vinculado después de haber escrito, entonces su actividad anterior también se ve en la ficha.
- **Tareas técnicas:** `[DISCORD-SIN-PROBAR]`, `[DISCORD-VINCULO-SIN-REATRIBUIR]`
- **Para confirmar:** —

### [H-DIS-10] Recibir los testimonios de Discord como casos de éxito
- **Funcionalidad:** F-DIS-10 · Sin verificar
- **Historia:** Como founder, quiero que los testimonios que mis alumnos escriben en los canales de logros me aparezcan como propuestas de casos de éxito, para aprovecharlos sin tener que leer todo el servidor.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Discord y el resultado quedó anotado: un mensaje de logro de un alumno en un canal de logros aparece como candidato en Clientes → Wins y se puede aceptar.
  - Un mensaje del equipo (por ejemplo "felicitaciones") o uno en un canal que no es de logros no genera candidato.
  - Hay pruebas automáticas del filtro que decide qué mensaje es un testimonio.
- **Tareas técnicas:** `[DISCORD-SIN-PROBAR]`, `[DISCORD-BOT-SIN-TESTS]`
- **Para confirmar:** Martín: la prueba manual de Discord no tiene un paso para testimonios; sumarlo.

### [H-DIS-11] Que la IA me marque cada día qué mensajes necesitan atención
- **Funcionalidad:** F-DIS-11 · Sin verificar
- **Historia:** Como founder, quiero que cada día la IA lea los mensajes nuevos de Discord, me diga el tono, me resuma y marque los que requieren atención, y me proponga hitos del recorrido de cada cliente, para enterarme de lo importante sin leer todo.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Discord y el resultado quedó anotado: al día siguiente de escribir, los mensajes nuevos de alumnos tienen tono y resumen, y los del equipo no se clasifican.
  - Dado un cliente con mensajes que muestran un avance, entonces aparece una propuesta de hito en su recorrido.
  - Si la clave de Claude de la organización deja de funcionar, la clasificación sigue con la clave de Limitless o el founder ve el aviso rojo.
- **Tareas técnicas:** `[DISCORD-SIN-PROBAR]`, `[1A1-CLAVE-ANTHROPIC-ROTA]`
- **Para confirmar:** Martín: la prueba manual de Discord no incluye la propuesta de hitos; sumarla.

### [H-DIS-12] Ponerle nombre y foto propios al bot en mi servidor
- **Funcionalidad:** F-DIS-12 · Sin verificar
- **Historia:** Como founder, quiero que el bot aparezca en mi servidor con el nombre y la foto de mi marca, para que mis alumnos lo sientan parte de mi comunidad.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Discord y el resultado quedó anotado: al guardar nombre y foto, el bot aparece así en mi servidor y en otros servidores no cambia.
  - Si Discord rechaza el cambio (por ejemplo falta el permiso de cambiar apodo), veo un aviso con el motivo que sigue ahí al recargar.
  - Un nombre de más de 32 letras, una imagen WebP o de más de 4 MB se frenan antes de mandarse; al quitar la foto vuelve la original.
- **Tareas técnicas:** `[DISCORD-PERFIL-SIN-PROBAR]`
- **Para confirmar:** —

### [H-DIS-13] Poner el bot en modo silencioso
- **Funcionalidad:** F-DIS-13 · Sin verificar
- **Historia:** Como founder, quiero que el bot pueda leer mi servidor sin escribir nada, para medir la actividad de mis alumnos sin que se note su presencia.
- **Criterios de aceptación:**
  - Probado con una cuenta real de Discord y el resultado quedó anotado: con el modo silencioso activo, el bot no saluda en canales nuevos ni responde a `!vincular`.
  - Con el modo silencioso activo, los mensajes se siguen guardando y asignando igual que antes.
- **Tareas técnicas:** `[DISCORD-SIN-PROBAR]`
- **Para confirmar:** Martín: la prueba manual de Discord no tiene un paso para el modo silencioso; sumarlo.
