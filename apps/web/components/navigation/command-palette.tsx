"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  LayoutDashboard,
  MessageSquare,
  FileText,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  cn,
} from "@ai-coo/ui";
import { useCommandPalette } from "@/providers/command-palette-provider";
import { es } from "@/lib/locale/es";
import { paths } from "@/routes";
import { platformNavigation } from "@/routes/navigation";

type PaletteItem = {
  label: string;
  href: string;
  group: string;
  keywords?: string;
};

function flattenNav(): PaletteItem[] {
  const items: PaletteItem[] = [];
  for (const item of platformNavigation) {
    if (item.children?.length) {
      for (const child of item.children) {
        items.push({
          label: `${item.label} → ${child.label}`,
          href: child.href,
          group: item.label,
          keywords: `${item.label} ${child.label}`,
        });
      }
    } else {
      items.push({
        label: item.label,
        href: item.href,
        group: "Plataforma",
        keywords: item.label,
      });
    }
  }
  return items;
}

const QUICK_ACTIONS: PaletteItem[] = [
  // "Recorrido guiado (demo)" salió con SCRUM-490: `/demo` está cerrada.
  {
    label: "Enviar input semanal",
    href: paths.platform.operations.weeklyInputs,
    group: "Acciones",
    keywords: "operaciones contexto semana",
  },
  {
    label: "Crear SOP",
    href: `${paths.platform.sops.root}#crear`,
    group: "Acciones",
    keywords: "sop generar",
  },
  {
    label: "Marketing",
    href: paths.platform.marketing.content,
    group: "Acciones",
    keywords: "contenido marketing drive reels",
  },
  {
    label: "Bandeja de ventas",
    href: paths.platform.sales.inbox,
    group: "Acciones",
    keywords: "ventas conversaciones",
  },
];

const ALL_ITEMS = [...QUICK_ACTIONS, ...flattenNav()];

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_ITEMS;
    return ALL_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords?.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q)
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const item of filtered) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const navigate = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">Paleta de comandos</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Sparkles className="h-4 w-4 shrink-0 text-ai" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={es.common.search}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            autoFocus
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground sm:inline">
            Esc
          </kbd>
        </div>
        <div className="max-h-[min(60vh,400px)] overflow-y-auto p-2">
          {grouped.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Sin resultados para «{query}»
            </p>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-2 last:mb-0">
                <p className="px-2 py-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                  {group}
                </p>
                <ul>
                  {items.map((item) => (
                    <li key={`${group}-${item.href}-${item.label}`}>
                      <button
                        type="button"
                        onClick={() => navigate(item.href)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm",
                          "hover:bg-muted/80 transition-colors"
                        )}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {item.group === "Acciones" ? (
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ai" />
                          ) : item.label.includes("Panel") ? (
                            <LayoutDashboard className="h-3.5 w-3.5 shrink-0 opacity-60" />
                          ) : item.label.includes("Ventas") ? (
                            <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                          ) : (
                            <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
                          )}
                          <span className="truncate">{item.label}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-border px-3 py-2 text-2xs text-muted-foreground flex justify-between">
          <span>
            <kbd className="rounded border border-border px-1">Ctrl</kbd>+
            <kbd className="rounded border border-border px-1">K</kbd> en cualquier pantalla
          </span>
          <Link
            href={paths.platform.dashboard}
            className="hover:text-foreground transition-colors"
            onClick={() => setOpen(false)}
          >
            {es.nav.dashboard}
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
