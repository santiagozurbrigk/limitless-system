import Link from "next/link";
import { Button } from "@ai-coo/ui";
import { es } from "@/lib/locale/es";
import { paths } from "@/routes";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="space-y-2">
        <p className="text-6xl font-semibold text-muted-foreground/40">404</p>
        <h1 className="text-xl font-semibold tracking-tight">
          {es.demo.notFoundTitle}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {es.demo.notFoundDesc}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href={paths.platform.dashboard}>{es.nav.dashboard}</Link>
        </Button>
        {/* El link al recorrido guiado salió con SCRUM-490: `/demo` está cerrada. */}
      </div>
    </main>
  );
}
