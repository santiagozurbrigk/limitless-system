# Backlog para Jira

`jira-import.csv` tiene los ítems abiertos de [`PENDIENTES.md`](../../PENDIENTES.md), listos para importar
a Jira. **No se edita a mano**: `PENDIENTES.md` es la única fuente del backlog y el CSV se regenera con

```bash
python3 docs/backlog/pendientes_a_jira.py           # regenera el CSV
python3 docs/backlog/pendientes_a_jira.py --check   # valida sin escribir
python3 docs/backlog/pendientes_a_jira.py --actualizar-indices   # recalcula la tabla de P0 y el índice por área de PENDIENTES.md, valida y regenera
```

La validación falla si hay un ID repetido, si a un ítem P0/P1 le falta severidad, riesgo, impacto o criterio de aceptación, si una severidad no es de la escala, o si el índice por área de `PENDIENTES.md` no coincide con los ítems.

Una vez que el backlog viva en Jira, lo que se cambie allá no vuelve solo a `PENDIENTES.md`. Hay que decidir
cuál de los dos manda. Mientras no se decida, un ítem cerrado en Jira también se borra de `PENDIENTES.md`
(y se nombra su ID en `CHANGES.md`), como ya indica ese archivo.

## Qué trae cada fila

| Columna | Contenido |
|---|---|
| Summary | `[ID] Título`. El ID es el mismo de `PENDIENTES.md`, así se puede buscar en los dos lados |
| Issue Type | `Bug` para bugs y seguridad, `Story` para features, `Task` para el resto (deuda, tests, verificación manual, decisiones de negocio, investigación) |
| Priority | P0 → Highest · P1 → High · P2 → Medium · P3 → Low |
| Labels | Área, prioridad (`p0`…`p3`), severidad (`sev-critica`, `sev-alta`, `sev-media`, `sev-baja`) y tipo (`seguridad`, `deuda-tecnica`, `verificacion-manual`, `decision-de-negocio`…). Los ítems que son parte del arreglo transversal de permisos llevan `permisos-transversal` |
| Description | Tipo, severidad, estado verificado en el código (el hecho), riesgo, impacto, qué hay que hacer (la recomendación), **criterio de aceptación** y dónde, en formato wiki de Jira. Severidad, riesgo, impacto y criterio son obligatorios en P0/P1 |
| ID Limitless, Área, Prioridad Limitless, Severidad, Tipo Limitless | Copia de los datos originales. Se pueden mapear a campos propios o ignorar |

Los criterios de aceptación están escritos sólo para P0 y P1. Un P2 o P3 recibe el suyo cuando entra en un
sprint, al refinarlo.

## Cómo importarlo (Jira Cloud)

1. En el proyecto: **Configuración del proyecto → Importar** o, desde el menú de Jira, **Sistema → Importación
   externa del sistema → CSV** (según el plan, uno u otro).
2. Subir `jira-import.csv`, codificación **UTF-8**, separador **coma**.
3. Mapear: `Summary` → Resumen, `Issue Type` → Tipo de incidencia, `Priority` → Prioridad,
   cada `Labels` → Etiquetas, `Description` → Descripción. Las cinco últimas columnas se pueden dejar sin mapear (o mapear `Severidad` a un campo propio, si el proyecto lo tiene).
4. Si el proyecto no tiene los tipos `Bug`/`Story`/`Task` con esos nombres (por ejemplo, está en castellano),
   mapear los valores en el paso de "valores de campo" del asistente.

Sugerencia: importar primero sólo P0 y P1 (las primeras filas: 105 al 2026-09-23; el script imprime el conteo por prioridad) para armar los dos primeros sprints, y el
resto después.

## Historias de usuario

[`historias.md`](./historias.md) tiene 122 historias (una por funcionalidad de `FUNCIONAL.md` que no está en
"Funciona"), cada una con sus criterios de aceptación y los IDs de sus tareas técnicas. `historias_a_jira.py` las
valida y genera `historias-jira.csv` (Issue Type `Story`); la prioridad se calcula a partir de las tareas. Su `--check`
falla si el CSV no es el que generaría (alguien cambió una tarea y no lo regeneró) o si `FUNCIONAL.md` cita una
tarea que ya no está en `PENDIENTES.md`. Importar
primero `jira-import.csv` y después las historias, y vincularlas por ID.

## Épicas

No se crean desde el CSV. Si se quiere una épica por área, crearlas a mano y filtrar por la etiqueta de área
para asignarlas en bloque. El agrupador natural para el arreglo de permisos es la etiqueta
`permisos-transversal` junto con el ítem `[PERMISOS-SERVER-ACTIONS]`.

## Lo que no está en este CSV

- Las **funcionalidades** del producto y su estado: están en [`../FUNCIONAL.md`](../FUNCIONAL.md). Ahí
  Agustín marca qué entra en el release de octubre, y eso decide qué ítems de acá van primero.
- Los pasos de las pruebas manuales: están en [`../operacion/verificacion-manual.md`](../operacion/verificacion-manual.md).
