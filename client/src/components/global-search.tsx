import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Search,
  Monitor,
  BarChart3,
  Ticket,
  BookOpen,
  LayoutGrid,
  Settings,
  User,
  Loader2,
  Star,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useDebounce } from "@/hooks/use-debounce";
import type { ResourceWithHealth } from "@shared/schema";

// ── Types ────────────────────────────────────────────────────────────────────

interface KbResult {
  id: string;
  title: string;
  categoryName?: string;
}

interface TicketResult {
  id: string;
  title: string;
  status: string;
  priority: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TICKET_STATUS_LABEL: Record<string, string> = {
  ABERTO: "Aberto",
  NA_FILA: "Aberto",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_USUARIO: "Aguardando",
  AGUARDANDO_APROVACAO: "Aprovação",
  RESOLVIDO: "Resolvido",
  CANCELADO: "Cancelado",
};

const PRIORITY_DOT: Record<string, string> = {
  BAIXA: "bg-blue-500",
  MEDIA: "bg-amber-500",
  ALTA: "bg-orange-500",
  URGENTE: "bg-red-500",
};

// ── Open from outside ─────────────────────────────────────────────────────────

export function openGlobalSearch() {
  document.dispatchEvent(new Event("global-search-open"));
}

// ── Trigger button (rendered in header) ──────────────────────────────────────

export function SearchTriggerButton() {
  return (
    <Button
      variant="outline"
      className="hidden sm:flex h-8 items-center gap-2 px-3 text-muted-foreground font-normal text-sm w-44 justify-between"
      onClick={openGlobalSearch}
    >
      <div className="flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span>Buscar...</span>
      </div>
      <kbd className="pointer-events-none inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
        Ctrl K
      </kbd>
    </Button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 280);
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const hasTicketAccess =
    user?.isAdmin || user?.roles?.some((r) => r.roleName === "Coordenador");

  // Keyboard shortcut + custom event
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const openHandler = () => setOpen(true);
    document.addEventListener("keydown", down);
    document.addEventListener("global-search-open", openHandler);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("global-search-open", openHandler);
    };
  }, []);

  // Reset query on close
  useEffect(() => {
    if (!open) setTimeout(() => setQuery(""), 150);
  }, [open]);

  // Resources — use cached data, filter client-side
  const { data: allResources = [] } = useQuery<ResourceWithHealth[]>({
    queryKey: ["/api/resources"],
    enabled: open,
    staleTime: 60_000,
  });

  const filteredResources = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allResources
      .filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.tags?.some((t) => t.toLowerCase().includes(q)) ||
          r.sectorName?.toLowerCase().includes(q),
      )
      .slice(0, 5);
  }, [allResources, query]);

  // KB — debounced server search
  const { data: kbResults = [], isFetching: kbLoading } = useQuery<KbResult[]>({
    queryKey: ["/api/kb", "search", debouncedQuery],
    queryFn: async () => {
      const res = await fetch(
        `/api/kb?q=${encodeURIComponent(debouncedQuery)}`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data as KbResult[]).slice(0, 5);
    },
    enabled: open && debouncedQuery.trim().length >= 2,
    staleTime: 30_000,
  });

  // Tickets — debounced server search (only for users with access)
  const { data: ticketResults = [], isFetching: ticketsLoading } = useQuery<TicketResult[]>({
    queryKey: ["/api/tickets", "search", debouncedQuery],
    queryFn: async () => {
      const res = await fetch(
        `/api/tickets?q=${encodeURIComponent(debouncedQuery)}&includeClosed=true`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data as TicketResult[]).slice(0, 5);
    },
    enabled: open && !!hasTicketAccess && debouncedQuery.trim().length >= 2,
    staleTime: 30_000,
  });

  const isSearching = kbLoading || ticketsLoading;
  const hasQuery = query.trim().length > 0;
  const hasResults =
    filteredResources.length > 0 ||
    kbResults.length > 0 ||
    ticketResults.length > 0;

  const navigate = (url: string) => {
    setOpen(false);
    setLocation(url);
  };

  // Navigation pages shown when no query
  const navPages = [
    { label: "Início", icon: LayoutGrid, url: "/" },
    { label: "Aplicações", icon: Monitor, url: "/apps" },
    { label: "Dashboards", icon: BarChart3, url: "/dashboards" },
    { label: "Favoritos", icon: Star, url: "/favorites" },
    ...(hasTicketAccess
      ? [{ label: "Chamados", icon: Ticket, url: "/tickets" }]
      : []),
    { label: "Base de Conhecimento", icon: BookOpen, url: "/kb" },
    { label: "Meu Perfil", icon: User, url: "/profile" },
    ...(user?.isAdmin
      ? [{ label: "Administração", icon: Settings, url: "/admin" }]
      : []),
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 max-w-xl gap-0" hideClose>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4"
        >
          <CommandInput
            placeholder="Buscar recursos, chamados, artigos KB..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[420px]">

            {/* Empty state: show navigation */}
            {!hasQuery && (
              <CommandGroup heading="Navegar">
                {navPages.map((page) => (
                  <CommandItem
                    key={page.url}
                    value={`nav-${page.url}`}
                    onSelect={() => navigate(page.url)}
                  >
                    <page.icon className="text-muted-foreground" />
                    {page.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Searching indicator */}
            {hasQuery && isSearching && !hasResults && (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                Buscando...
              </div>
            )}

            {/* No results */}
            {hasQuery && !isSearching && !hasResults && (
              <CommandEmpty>
                Nenhum resultado para &ldquo;{query}&rdquo;
              </CommandEmpty>
            )}

            {/* Resources */}
            {filteredResources.length > 0 && (
              <>
                <CommandGroup heading="Recursos">
                  {filteredResources.map((r) => (
                    <CommandItem
                      key={r.id}
                      value={`resource-${r.id}`}
                      onSelect={() => navigate(`/resource/${r.id}`)}
                    >
                      <div
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                          r.type === "APP"
                            ? "bg-primary/10 text-primary"
                            : "bg-chart-2/10 text-chart-2",
                        )}
                      >
                        {r.type === "APP" ? (
                          <Monitor className="!h-3.5 !w-3.5" />
                        ) : (
                          <BarChart3 className="!h-3.5 !w-3.5" />
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{r.name}</span>
                        {r.sectorName && (
                          <span className="text-xs text-muted-foreground">
                            {r.sectorName}
                          </span>
                        )}
                      </div>
                      <CommandShortcut>
                        {r.type === "APP" ? "App" : "Dashboard"}
                      </CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {(ticketResults.length > 0 || kbResults.length > 0) && (
                  <CommandSeparator />
                )}
              </>
            )}

            {/* Tickets */}
            {ticketResults.length > 0 && (
              <>
                <CommandGroup heading="Chamados">
                  {ticketResults.map((t) => (
                    <CommandItem
                      key={t.id}
                      value={`ticket-${t.id}`}
                      onSelect={() => navigate(`/tickets/${t.id}`)}
                    >
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div
                          className={cn(
                            "h-2 w-2 rounded-full shrink-0",
                            PRIORITY_DOT[t.priority] ?? "bg-muted-foreground",
                          )}
                        />
                        <Ticket className="text-muted-foreground" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{t.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {TICKET_STATUS_LABEL[t.status] ?? t.status}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {kbResults.length > 0 && <CommandSeparator />}
              </>
            )}

            {/* KB */}
            {kbResults.length > 0 && (
              <CommandGroup heading="Base de Conhecimento">
                {kbResults.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`kb-${a.id}`}
                    onSelect={() => navigate(`/kb/articles/${a.id}`)}
                  >
                    <BookOpen className="text-muted-foreground shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{a.title}</span>
                      {a.categoryName && (
                        <span className="text-xs text-muted-foreground">
                          {a.categoryName}
                        </span>
                      )}
                    </div>
                    <CommandShortcut>KB</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Loading more (query sent, waiting for debounce or server) */}
            {hasQuery && isSearching && hasResults && (
              <div className="flex items-center gap-1.5 px-4 py-2 text-xs text-muted-foreground border-t">
                <Loader2 className="h-3 w-3 animate-spin" />
                Atualizando resultados...
              </div>
            )}
          </CommandList>

          {/* Footer hint */}
          <div className="border-t px-4 py-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span><kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">↵</kbd> selecionar</span>
            <span><kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">↑↓</kbd> navegar</span>
            <span><kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Esc</kbd> fechar</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
