"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button, Dialog, DialogContent, DialogTitle, cn } from "@ai-coo/ui";
import { countPendingFathomCallsAction } from "@/app/fathom/actions";
import { secondaryNavigation } from "@/routes/navigation";
import { paths } from "@/routes";
import { buildPlatformSidebarNav } from "@/lib/navigation/sidebar-modules";
import type { SidebarDirectModule } from "@/lib/navigation/sidebar-nav-config";
import { isPathActive } from "@/lib/navigation/active-path";
import { useEnabledAddOns, usePermissions } from "@/providers/permissions-provider";
import { leerDelMarco } from "@/lib/auth/lecturas-del-marco";
import { SidebarTwoLevelNavigation } from "@/components/navigation/sidebar-two-level-navigation";
import { NavIcon } from "@/components/navigation/nav-icons";
import { AppBrandHeader } from "@/components/brand";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [pendingCalls, setPendingCalls] = useState(0);
  const enabledAddOns = useEnabledAddOns();
  const platformSidebarNav = buildPlatformSidebarNav(enabledAddOns);

  const close = () => setOpen(false);

  // El contador de llamadas sin asignar es de Clientes: sin el módulo no se
  // pide (SCRUM-540) y el ítem queda sin número.
  const permisos = usePermissions();
  useEffect(() => {
    if (!open) return;
    leerDelMarco(permisos, "llamadasPendientes", countPendingFathomCallsAction, 0)
      .then(setPendingCalls)
      .catch(() => setPendingCalls(0));
  }, [pathname, open, permisos]);

  const mapDirectModules = useCallback(
    (modules: SidebarDirectModule[]) =>
      modules.map((entry) =>
        entry.href === paths.platform.clients.root
          ? { ...entry, badge: pendingCalls }
          : entry
      ),
    [pendingCalls]
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="left-0 top-0 flex h-full max-h-full w-[min(100%,280px)] max-w-[280px] flex-col translate-x-0 translate-y-0 rounded-none border-r p-0">
          <DialogTitle className="relative flex min-h-[52px] items-center border-b border-border px-3 py-2.5">
            <AppBrandHeader className="min-w-0 flex-1 pr-10" />
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={close}
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>

          <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
            <SidebarTwoLevelNavigation
              config={platformSidebarNav}
              mapDirectModules={mapDirectModules}
              onLinkClick={close}
              className="relative min-h-0 flex-1 overflow-hidden"
            />
          </nav>

          {secondaryNavigation.length > 0 ? (
            <div className="space-y-1 border-t border-border p-3">
              {secondaryNavigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                    isPathActive(item.href, pathname)
                      ? "bg-muted font-medium"
                      : "text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  {item.icon ? <NavIcon name={item.icon} /> : null}
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
