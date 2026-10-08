// Config de ESLint compartida del monorepo (la misma base que packages/ui).
// Se importa por ruta relativa y no como dependencia "workspace:*" porque la
// imagen de Docker de esta app se arma fuera del monorepo con npm, que no
// entiende ese protocolo. Este archivo no entra en la imagen.
import base from "../../packages/config/eslint/base.js";

export default base;
