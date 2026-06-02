import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Folder, ArrowLeft, Activity } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
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

// ── Watcher Edit Dialog ───────────────────────────────────────────────────────

function WatcherEditDialog({
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Watcher: {watcher.slug}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={form.name} onChange={set("name")} />
            </div>
            <div className="space-y-1">
              <Label>Cliente (tag)</Label>
              <Input value={form.client} onChange={set("client")} placeholder="BLD, BPO…" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input value={form.description} onChange={set("description")} />
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1">
              <Folder className="h-3.5 w-3.5" /> Pasta de Entrada
            </Label>
            <Input
              value={form.folderInput}
              onChange={set("folderInput")}
              placeholder="\\servidor\share\pasta-entrada"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1">
              <Folder className="h-3.5 w-3.5" /> Pasta de Saída
            </Label>
            <Input
              value={form.folderOutput}
              onChange={set("folderOutput")}
              placeholder="\\servidor\share\pasta-saida"
              className="font-mono text-xs"
            />
          </div>

          {/* Sector visibility */}
          <div className="space-y-2">
            <Label>Setores com acesso</Label>
            <p className="text-xs text-muted-foreground">
              Apenas usuários dos setores selecionados verão este watcher no Ops Center. Admins
              sempre veem tudo.
            </p>
            {loadingSectors ? (
              <p className="text-xs text-muted-foreground">Carregando setores…</p>
            ) : allSectors.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum setor cadastrado.</p>
            ) : (
              <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 max-h-40 overflow-y-auto rounded border p-2">
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
              <p className="text-xs text-amber-600">
                Nenhum setor selecionado — nenhum usuário comum verá este watcher.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-1/10">
          <Activity className="h-5 w-5 text-chart-1" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Config. Ops Center</h1>
          <p className="text-sm text-muted-foreground">
            Configure as pastas de entrada/saída dos watchers e os setores que têm acesso a cada um.
          </p>
        </div>
      </div>


<Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Folder className="h-4 w-4" /> Watchers
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Watcher</TableHead>
                <TableHead>Setores com acesso</TableHead>
                <TableHead>Pasta de Entrada</TableHead>
                <TableHead>Pasta de Saída</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : watchers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                    Nenhum watcher cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                watchers.map((w) => (
                  <TableRow key={w.slug}>
                    <TableCell>
                      <div className="font-medium text-sm">{w.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{w.slug}</div>
                      {w.client && (
                        <Badge variant="secondary" className="text-xs mt-0.5">{w.client}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {(w.sectors ?? []).length === 0 ? (
                        <span className="text-xs text-amber-600 italic">Nenhum — invisível</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(w.sectors ?? []).map((s) => (
                            <Badge key={s.id} variant="outline" className="text-xs">{s.name}</Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell
                      className="text-xs font-mono text-muted-foreground max-w-[180px] truncate"
                      title={w.folderInput ?? ""}
                    >
                      {w.folderInput ?? <span className="italic">—</span>}
                    </TableCell>
                    <TableCell
                      className="text-xs font-mono text-muted-foreground max-w-[180px] truncate"
                      title={w.folderOutput ?? ""}
                    >
                      {w.folderOutput ?? <span className="italic">—</span>}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setEditingWatcher(w)}>
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editingWatcher && (
        <WatcherEditDialog
          watcher={editingWatcher}
          onClose={() => setEditingWatcher(null)}
        />
      )}
    </div>
  );
}
