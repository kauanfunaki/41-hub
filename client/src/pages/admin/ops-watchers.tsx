import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Save, Folder, FolderInput, FolderOutput, ArrowLeft, Activity,
  Pencil, Building2, EyeOff,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/empty-state";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// ── Types ────────────────────────────────────────────────────────────────────

interface OpsWatcherAdmin {
  slug: string;
  name: string;
  description: string | null;
  client: string | null;
  folderInput: string | null;
  folderOutput: string | null;
  isActive: boolean;
  sectors?: { id: string; name: string }[];  // undefined-safe (old server compat)
}

interface SectorRow {
  id: string;
  name: string;
}

// ── Watcher Edit Sheet ─────────────────────────────────────────────────────────

function WatcherEditSheet({
  watcher,
  onClose,
}: {
  watcher: OpsWatcherAdmin;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    name:         watcher.name,
    description:  watcher.description ?? "",
    client:       watcher.client ?? "",
    folderInput:  watcher.folderInput ?? "",
    folderOutput: watcher.folderOutput ?? "",
  });

  // All available sectors
  const { data: allSectors = [] } = useQuery<SectorRow[]>({
    queryKey: ["/api/admin/sectors"],
  });

  // Current sectors for this watcher
  const { data: currentSectorIds = [], isLoading: loadingSectors } = useQuery<string[]>({
    queryKey: [`/api/admin/ops-watcher-sectors/${watcher.slug}`],
  });

  const [selectedSectors, setSelectedSectors] = useState<Set<string> | null>(null);
  // currentSectorIds from API takes precedence; watcher.sectors is a fallback
  const fallbackIds = (watcher.sectors ?? []).map((s) => s.id);
  const activeSectors = selectedSectors ?? new Set(currentSectorIds.length ? currentSectorIds : fallbackIds);

  const toggleSector = (id: string) =>
    setSelectedSectors((prev) => {
      const s = new Set(prev ?? currentSectorIds);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/admin/ops-watchers/${watcher.slug}`, {
        name:         form.name || undefined,
        description:  form.description || null,
        client:       form.client || null,
        folderInput:  form.folderInput || null,
        folderOutput: form.folderOutput || null,
      });
      await apiRequest("PUT", `/api/admin/ops-watcher-sectors/${watcher.slug}`, {
        sectorIds: Array.from(activeSectors),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ops-watchers"] });
      qc.invalidateQueries({ queryKey: [`/api/admin/ops-watcher-sectors/${watcher.slug}`] });
      qc.invalidateQueries({ queryKey: ["/api/ops/watchers"] });
      toast({ title: "Watcher atualizado com sucesso" });
      onClose();
    },
    onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex flex-col sm:max-w-lg p-0" data-testid="sheet-watcher-form">
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-1/10 text-chart-1 shrink-0">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle>Editar Watcher</SheetTitle>
              <SheetDescription className="font-mono text-xs">{watcher.slug}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

            {/* Identidade */}
            <div className="space-y-4">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identidade</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={set("name")} data-testid="input-watcher-name" />
                </div>
                <div className="space-y-2">
                  <Label>Cliente (tag)</Label>
                  <Input value={form.client} onChange={set("client")} placeholder="BLD, BPO…" data-testid="input-watcher-client" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input value={form.description} onChange={set("description")} placeholder="Breve descrição do watcher" data-testid="input-watcher-description" />
              </div>
            </div>

            <Separator />

            {/* Pastas */}
            <div className="space-y-4">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pastas monitoradas</Label>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <FolderInput className="h-3.5 w-3.5" /> Pasta de Entrada
                </Label>
                <Input
                  value={form.folderInput}
                  onChange={set("folderInput")}
                  placeholder="\\servidor\share\pasta-entrada"
                  className="font-mono text-xs"
                  data-testid="input-watcher-folder-input"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <FolderOutput className="h-3.5 w-3.5" /> Pasta de Saída
                </Label>
                <Input
                  value={form.folderOutput}
                  onChange={set("folderOutput")}
                  placeholder="\\servidor\share\pasta-saida"
                  className="font-mono text-xs"
                  data-testid="input-watcher-folder-output"
                />
              </div>
            </div>

            <Separator />

            {/* Acesso por setor */}
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acesso por setor</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Apenas usuários dos setores selecionados verão este watcher no Ops Center. Admins sempre veem tudo.
                </p>
              </div>
              {loadingSectors ? (
                <p className="text-xs text-muted-foreground">Carregando setores…</p>
              ) : allSectors.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum setor cadastrado.</p>
              ) : (
                <div className="grid grid-cols-2 gap-y-2 gap-x-3 max-h-44 overflow-y-auto rounded-lg border p-3">
                  {allSectors.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={activeSectors.has(s.id)}
                        onCheckedChange={() => toggleSector(s.id)}
                      />
                      <span className="text-sm leading-none">{s.name}</span>
                    </label>
                  ))}
                </div>
              )}
              {activeSectors.size === 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  <EyeOff className="h-3.5 w-3.5 shrink-0" />
                  Nenhum setor selecionado — nenhum usuário comum verá este watcher.
                </div>
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-watcher">
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Watcher Card ───────────────────────────────────────────────────────────────

function FolderLine({ icon: Icon, label, path }: { icon: typeof Folder; label: string; path: string | null }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {path ? (
          <p className="text-xs font-mono text-foreground/80 truncate" title={path}>{path}</p>
        ) : (
          <p className="text-xs text-muted-foreground italic">não configurada</p>
        )}
      </div>
    </div>
  );
}

function WatcherCard({ watcher, onEdit }: { watcher: OpsWatcherAdmin; onEdit: () => void }) {
  const sectors = watcher.sectors ?? [];
  return (
    <div className="rounded-xl border bg-card overflow-hidden flex flex-col" data-testid={`watcher-card-${watcher.slug}`}>
      {/* Header */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-chart-1/10 text-chart-1 shrink-0">
          <Folder className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate">{watcher.name}</p>
            {watcher.client && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">{watcher.client}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono truncate">{watcher.slug}</p>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onEdit} data-testid={`button-edit-watcher-${watcher.slug}`}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      {/* Folders */}
      <div className="px-4 pb-3 space-y-2.5">
        <FolderLine icon={FolderInput} label="Entrada" path={watcher.folderInput} />
        <FolderLine icon={FolderOutput} label="Saída" path={watcher.folderOutput} />
      </div>

      {/* Sectors */}
      <div className="mt-auto border-t px-4 py-3 bg-muted/30">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Building2 className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Acesso</span>
        </div>
        {sectors.length === 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <EyeOff className="h-3.5 w-3.5 shrink-0" />
            Nenhum setor — invisível para usuários
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {sectors.map((s) => (
              <Badge key={s.id} variant="outline" className="text-xs">{s.name}</Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AdminOpsWatchers() {
  const [editingWatcher, setEditingWatcher] = useState<OpsWatcherAdmin | null>(null);

  const { data: watchers = [], isLoading } = useQuery<OpsWatcherAdmin[]>({
    queryKey: ["/api/admin/ops-watchers"],
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-1/10">
          <Activity className="h-5 w-5 text-chart-1" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Config. Ops Center</h1>
          <p className="text-sm text-muted-foreground">
            Pastas de entrada/saída dos watchers e os setores com acesso a cada um
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : watchers.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={Folder}
            title="Nenhum watcher cadastrado"
            description="Os watchers aparecem aqui assim que forem registrados pelo serviço de monitoramento."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {watchers.map((w) => (
            <WatcherCard key={w.slug} watcher={w} onEdit={() => setEditingWatcher(w)} />
          ))}
        </div>
      )}

      {editingWatcher && (
        <WatcherEditSheet
          watcher={editingWatcher}
          onClose={() => setEditingWatcher(null)}
        />
      )}
    </div>
  );
}
