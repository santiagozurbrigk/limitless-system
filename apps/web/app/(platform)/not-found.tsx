import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@ai-coo/ui";
import { paths } from "@/routes";

/**
 * Lo que se ve cuando una pantalla de la plataforma llama a `notFound()`: un
 * cliente, un SOP o un reporte que no existe o es de otra organización
 * (SCRUM-108). Sin esto Next usaba `app/not-found.tsx`, fuera de la cáscara:
 * desaparecía la navegación. Uno solo para toda la plataforma alcanza: el
 * texto no depende del módulo y la navegación sigue a mano para volver.
 *
 * Una URL que no existe en ningún lado sigue yendo a `app/not-found.tsx`.
 */
export default function NoEncontradoEnLaPlataforma() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-muted/40">
        <SearchX className="h-5 w-5 text-muted-foreground" />
      </div>
      <h1 className="text-lg font-medium text-foreground">
        No encontramos lo que buscás
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Puede que se haya borrado, que sea de otra organización o que el link
        esté mal. Volvé al panel o elegí otro módulo desde la navegación.
      </p>
      <div className="mt-6">
        <Button asChild>
          <Link href={paths.platform.dashboard}>Ir al panel</Link>
        </Button>
      </div>
    </div>
  );
}
