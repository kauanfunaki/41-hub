import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Folder, Users, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
}

interface UserRow {
  id: number;
  name: string;
  email: string;
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

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/admin/ops-watchers/${watcher.slug}`, {
        name:         form.name || undefined,
        description:  form.description || null,
        client:       form.client || null,
        folderInput:  form.folderInput || null,
        folderOutput: form.folderOutput || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ops-watchers"] });
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
        <div className="space-y-3">
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
            <Label className="flex items-center gap-1"><Folder className="h-3.5 w-3.5" /> Pasta de Entrada</Label>
            <Input
              value={form.folderInput}
              onChange={set("folderInput")}
              placeholder="\\servidor\share\pasta-entrada"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1"><Folder className="h-3.5 w-3.5" /> Pasta de Saída</Label>
            <Input
              value={form.folderOutput}
              onChange={set("folderOutput")}
              placeholder="\\servidor\share\pasta-saida"
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {mutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── User Permissions Dialog ───────────────────────────────────────────────────

function UserPermDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: allClients = [] } = useQuery<string[]>({
    queryKey: ["/api/admin/watcher-clients"],
  });

  const { data: userClients = [], isLoading } = useQuery<string[]>({
    queryKey: [`/api/admin/user-watcher-clients/${user.id}`],
  });

  const [selected, setSelected] = useState<Set<string> | null>(null);
  const current = selected ?? new Set(userClients);

  const toggle = (client: string) =>
    setSelected((prev) => {
      const s = new Set(prev ?? userClients);
      s.has(client) ? s.delete(client) : s.add(client);
      return s;
    });

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/admin/user-watcher-clients/${user.id}`, {
        clients: Array.from(current),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/admin/user-watcher-clients/${user.id}`] });
      toast({ title: "Permissões salvas" });
      onClose();
    },
    onError: () => toast({ title: "Erro ao salvar permissões", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Acesso Ops — {user.name}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Selecione quais clientes (tags) este usuário pode visualizar no Ops Center.
          Sem seleção, o usuário não verá nenhum watcher.
        </p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : allClients.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum cliente cadastrado nos watchers.</p>
        ) : (
          <div className="space-y-2">
            {allClients.map((c) => (
              <label key={c} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={current.has(c)}
                  onCheckedChange={() => toggle(c)}
                />
                <span className="text-sm">{c}</span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AdminOpsWatchers() {
  const [editingWatcher, setEditingWatcher] = useState<OpsWatcherAdmin | null>(null);
  const [editingUser,    setEditingUser]    = useState<UserRow | null>(null);

  const { data: watchers = [], isLoading: loadW } = useQuery<OpsWatcherAdmin[]>({
    queryKey: ["/api/admin/ops-watchers"],
  });

  const { data: users = [], isLoading: loadU } = useQuery<UserRow[]>({
    queryKey: ["/api/admin/users"],
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Config. Ops Center</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure as pastas de entrada/saída dos watchers e as permissões de visibilidade por cliente.
        </p>
      </div>

      {/* Watchers config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Folder className="h-4 w-4" /> Pastas dos Watchers
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Watcher</TableHead>
                <TableHead className="w-20">Cliente</TableHead>
                <TableHead>Pasta de Entrada</TableHead>
                <TableHead>Pasta de Saída</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadW ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">Carregando…</TableCell></TableRow>
              ) : watchers.map((w) => (
                <TableRow key={w.slug}>
                  <TableCell>
                    <div className="font-medium text-sm">{w.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{w.slug}</div>
                  </TableCell>
                  <TableCell>
                    {w.client && <Badge variant="secondary" className="text-xs">{w.client}</Badge>}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground max-w-[200px] truncate" title={w.folderInput ?? ""}>
                    {w.folderInput ?? <span className="italic">—</span>}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground max-w-[200px] truncate" title={w.folderOutput ?? ""}>
                    {w.folderOutput ?? <span className="italic">—</span>}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setEditingWatcher(w)}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* User permissions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Permissões por Usuário
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Usuários com role "Usuário" só visualizam os watchers dos clientes que você liberar aqui.
            Coordenadores e Admins sempre veem tudo.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadU ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground text-sm">Carregando…</TableCell></TableRow>
              ) : users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-sm">{u.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setEditingUser(u)}>
                      <Shield className="h-3.5 w-3.5 mr-1" /> Acesso
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editingWatcher && (
        <WatcherEditDialog watcher={editingWatcher} onClose={() => setEditingWatcher(null)} />
      )}
      {editingUser && (
        <UserPermDialog user={editingUser} onClose={() => setEditingUser(null)} />
      )}
    </div>
  );
}
