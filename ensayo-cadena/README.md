# Ensayo de la cadena de merges del Sprint 2 (no mergear)

Rama de referencia: simula en local, sobre `main` en `f4c02c8b` (con SCRUM-540), el squash de los 10 PR en el orden
acordado: #147 → #148 → #151 → #150 → #152 → #141 → #144 → #146 → #153 → #156. Cada commit "squash #NNN" son los
cambios propios del PR contra su base vieja (equivalente a `rebase --onto`), con los conflictos resueltos.

- `NN-prNNN-*.patch`: el parche de cada paso, tal como quedó después de resolver.
- `log-NNN-tsc.txt` / `log-NNN-test.txt`: typecheck y tests después de cada paso (sufijo `b` = después del arreglo).
- Resultado final: tsc 0 errores, 345 archivos y 5806 tests, lint 0 errores.

Sirve para comparar con la resolución de cada autor antes del merge real. El detalle está en el comentario del #153.
