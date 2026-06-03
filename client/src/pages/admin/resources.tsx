import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Plus, Pencil, Trash2, Layout, Monitor, BarChart3, Activity, Link2, Tag } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Resource, Sector } from "@shared/schema";

const getIcon = (iconName: string) => {
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  return icons[iconName] || LucideIcons.Layout;
};

type ResourceType = "APP" | "DASHBOARD";
type EmbedMode = "LINK" | "IFRAME" | "POWERBI";
type OpenBehavior = "HUB_ONLY" | "NEW_TAB_ONLY" | "BOTH";

interface ResourceFormData {
  name: string;
  type: ResourceType;
  sectorId: string;
  embedMode: EmbedMode;
  openBehavior: OpenBehavior;
  url: string;
  tags: string;
  icon: string;
  isActive: boolean;
}

const defaultFormData: ResourceFormData = {
  name: "",
  type: "APP",
  sectorId: "",
  embedMode: "LINK",
  openBehavior: "BOTH",
  url: "",
  tags: "",
  icon: "Layout",
  isActive: true,
};

export default function AdminResources() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "APP" | "DASHBOARD">("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [deletingResource, setDeletingResource] = useState<Resource | null>(null);
  const [formData, setFormData] = useState<ResourceFormData>(defaultFormData);

  const { data: resourcesRaw, isLoading } = useQuery<Resource[] | unknown>({
    queryKey: ["/api/admin/resources"],
    retry: false,
  });
  const resources: Resource[] = Array.isArray(resourcesRaw) ? resourcesRaw : [];

  const { data: sectors = [] } = useQuery<Sector[]>({
    queryKey: ["/api/admin/sectors"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Resource>) => {
      return apiRequest("POST", "/api/admin/resources", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Recurso criado com sucesso" });
      handleCloseDialog();
    },
    onError: () => {
      toast({ title: "Erro ao criar recurso", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Resource> & { id: string }) => {
      return apiRequest("PATCH", `/api/admin/resources/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      toast({ title: "Recurso atualizado com sucesso" });
      handleCloseDialog();
    },
    onError: () => {
      toast({ title: "Erro ao atualizar recurso", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/resources/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Recurso excluído com sucesso" });
      setIsDeleteOpen(false);
      setDeletingResource(null);
    },
    onError: () => {
      toast({ title: "Erro ao excluir recurso", variant: "destructive" });
    },
  });

  const healthMutation = useMutation({
    mutationFn: ({ id, healthStatus, healthMessage }: { id: string; healthStatus: string; healthMessage?: string }) =>
      apiRequest("PATCH", `/api/admin/resources/${id}/health`, { healthStatus, healthMessage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      toast({ title: "Status de saúde atualizado" });
    },
    onError: () => toast({ title: "Erro ao atualizar saúde", variant: "destructive" }),
  });

  const handleOpenCreate = () => {
    setEditingResource(null);
    setFormData(defaultFormData);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (resource: Resource) => {
    setEditingResource(resource);
    setFormData({
      name: resource.name,
      type: resource.type as ResourceType,
      sectorId: resource.sectorId || "",
      embedMode: resource.embedMode as EmbedMode,
      openBehavior: (resource as any).openBehavior as OpenBehavior || "BOTH",
      url: resource.url || "",
      tags: resource.tags?.join(", ") || "",
      icon: resource.icon || "Layout",
      isActive: resource.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleOpenDelete = (resource: Resource) => {
    setDeletingResource(resource);
    setIsDeleteOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingResource(null);
    setFormData(defaultFormData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const payload = {
      name: formData.name,
      type: formData.type,
      sectorId: formData.sectorId || null,
      embedMode: formData.embedMode,
      openBehavior: formData.openBehavior,
      url: formData.url || null,
      tags: formData.tags.split(",").map((t) => t.trim()).filter(Boolean),
      icon: formData.icon || "Layout",
      isActive: formData.isActive,
    };

    if (editingResource) {
      updateMutation.mutate({ id: editingResource.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filteredResources = resources.filter((resource) => {
    const matchesSearch =
      resource.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resource.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesTab = activeTab === "all" || resource.type === activeTab;
    return matchesSearch && matchesTab;
  });

  const getSectorName = (sectorId: string | null) => {
    if (!sectorId) return "-";
    return sectors.find((s) => s.id === sectorId)?.name || "-";
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-3/10">
          <Layout className="h-5 w-5 text-chart-3" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Recursos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie aplicações e dashboards
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-base font-medium">
              {filteredResources.length} recurso{filteredResources.length !== 1 ? "s" : ""}
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Buscar recursos..."
                className="sm:w-64"
              />
              <Button onClick={handleOpenCreate} data-testid="button-create-resource">
                <Plus className="h-4 w-4 mr-2" />
                Novo Recurso
              </Button>
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="APP">
                <Monitor className="h-4 w-4 mr-1" />
                Apps
              </TabsTrigger>
              <TabsTrigger value="DASHBOARD">
                <BarChart3 className="h-4 w-4 mr-1" />
                Dashboards
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredResources.length === 0 ? (
            <EmptyState
              icon={Layout}
              title={searchQuery ? "Nenhum recurso encontrado" : "Nenhum recurso cadastrado"}
              description={searchQuery ? "Tente outro termo de busca." : "Adicione aplicações e dashboards ao Hub."}
              action={!searchQuery ? <Button onClick={handleOpenCreate}><Plus className="h-4 w-4 mr-2" />Novo Recurso</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recurso</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Modo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        <Activity className="h-3.5 w-3.5" />
                        Saúde
                      </div>
                    </TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredResources.map((resource) => (
                    <TableRow key={resource.id} data-testid={`row-resource-${resource.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-md",
                              resource.type === "APP"
                                ? "bg-primary/10 text-primary"
                                : "bg-chart-2/10 text-chart-2"
                            )}
                          >
                            {resource.type === "APP" ? (
                              <Monitor className="h-4 w-4" />
                            ) : (
                              <BarChart3 className="h-4 w-4" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{resource.name}</p>
                            {resource.tags && resource.tags.length > 0 && (
                              <div className="flex gap-1 mt-0.5">
                                {resource.tags.slice(0, 2).map((tag) => (
                                  <Badge key={tag} variant="secondary" className="text-xs px-1 py-0">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={resource.type === "APP" ? "default" : "secondary"}>
                          {resource.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {getSectorName(resource.sectorId)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{resource.embedMode}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className={resource.isActive ? "text-status-online" : "text-muted-foreground"}>
                          {resource.isActive ? "Ativo" : "Inativo"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const health = (resource as any).healthStatusOverride || "UP";
                          const cfg: Record<string, { dot: string; label: string; badge: string }> = {
                            UP:      { dot: "bg-green-500", label: "OK",        badge: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" },
                            DEGRADED:{ dot: "bg-amber-500", label: "Manutenção",badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
                            DOWN:    { dot: "bg-red-500",   label: "Fora do ar",badge: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
                          };
                          const c = cfg[health] ?? cfg.UP;
                          return (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity", c.badge)}>
                                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", c.dot)} />
                                  {c.label}
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                {Object.entries(cfg).map(([val, item]) => (
                                  <DropdownMenuItem
                                    key={val}
                                    onClick={() => healthMutation.mutate({ id: resource.id, healthStatus: val })}
                                    className="flex items-center gap-2 text-xs"
                                  >
                                    <span className={cn("h-2 w-2 rounded-full shrink-0", item.dot)} />
                                    {item.label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(resource)}
                            data-testid={`button-edit-${resource.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDelete(resource)}
                            data-testid={`button-delete-${resource.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <SheetContent className="flex flex-col sm:max-w-lg p-0" data-testid="sheet-resource-form">
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <div className="flex items-center gap-3">
              <div className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
                formData.type === "APP" ? "bg-primary/10 text-primary" : "bg-chart-2/10 text-chart-2"
              )}>
                {(() => { const Icon = getIcon(formData.icon); return <Icon className="h-5 w-5" />; })()}
              </div>
              <div>
                <SheetTitle>
                  {editingResource ? "Editar Recurso" : "Novo Recurso"}
                </SheetTitle>
                <SheetDescription>
                  {editingResource ? "Altere as informações do recurso" : "Adicione uma nova aplicação ou dashboard"}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* Tipo */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipo</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: "APP" })}
                    data-testid="type-btn-app"
                    className={cn(
                      "rounded-xl border-2 p-4 flex flex-col items-center gap-2 transition-all",
                      formData.type === "APP"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-muted-foreground/60"
                    )}
                  >
                    <Monitor className="h-6 w-6" />
                    <span className="text-sm font-medium">Aplicação</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: "DASHBOARD" })}
                    data-testid="type-btn-dashboard"
                    className={cn(
                      "rounded-xl border-2 p-4 flex flex-col items-center gap-2 transition-all",
                      formData.type === "DASHBOARD"
                        ? "border-chart-2 bg-chart-2/5 text-chart-2"
                        : "border-border text-muted-foreground hover:border-muted-foreground/60"
                    )}
                  >
                    <BarChart3 className="h-6 w-6" />
                    <span className="text-sm font-medium">Dashboard</span>
                  </button>
                </div>
              </div>

              <Separator />

              {/* Identidade */}
              <div className="space-y-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identidade</Label>
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nome do recurso"
                    data-testid="input-resource-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="icon">Ícone</Label>
                  <div className="flex gap-2 items-center">
                    <div className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                      formData.type === "APP" ? "bg-primary/10 text-primary border-primary/20" : "bg-chart-2/10 text-chart-2 border-chart-2/20"
                    )}>
                      {(() => { const Icon = getIcon(formData.icon); return <Icon className="h-4 w-4" />; })()}
                    </div>
                    <Input
                      id="icon"
                      value={formData.icon}
                      onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                      placeholder="Layout"
                      data-testid="input-resource-icon"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Nome do ícone Lucide (ex: Monitor, FileText, Globe)</p>
                </div>
              </div>

              <Separator />

              {/* Acesso */}
              <div className="space-y-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acesso</Label>
                <div className="space-y-2">
                  <Label htmlFor="url" className="flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" />
                    URL
                  </Label>
                  <Input
                    id="url"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    placeholder="https://..."
                    data-testid="input-resource-url"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Modo de Exibição</Label>
                    <Select
                      value={formData.embedMode}
                      onValueChange={(v) => setFormData({ ...formData, embedMode: v as EmbedMode })}
                    >
                      <SelectTrigger data-testid="select-embed-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LINK">Link Externo</SelectItem>
                        <SelectItem value="IFRAME">Iframe</SelectItem>
                        <SelectItem value="POWERBI">Power BI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Abertura</Label>
                    <Select
                      value={formData.openBehavior}
                      onValueChange={(v) => setFormData({ ...formData, openBehavior: v as OpenBehavior })}
                    >
                      <SelectTrigger data-testid="select-open-behavior">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HUB_ONLY">Somente no Hub</SelectItem>
                        <SelectItem value="NEW_TAB_ONLY">Nova Guia</SelectItem>
                        <SelectItem value="BOTH">Usuário Escolhe</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Organização */}
              <div className="space-y-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Organização</Label>
                <div className="space-y-2">
                  <Label>Setor</Label>
                  <Select
                    value={formData.sectorId}
                    onValueChange={(v) => setFormData({ ...formData, sectorId: v })}
                  >
                    <SelectTrigger data-testid="select-sector">
                      <SelectValue placeholder="Selecione um setor" />
                    </SelectTrigger>
                    <SelectContent>
                      {sectors.map((sector) => (
                        <SelectItem key={sector.id} value={sector.id}>
                          {sector.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tags" className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" />
                    Tags
                  </Label>
                  <Input
                    id="tags"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="financeiro, relatório"
                    data-testid="input-resource-tags"
                  />
                  <p className="text-xs text-muted-foreground">Separe as tags por vírgula</p>
                </div>
                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Recurso ativo</p>
                    <p className="text-xs text-muted-foreground">Visível para os usuários do Hub</p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                    data-testid="switch-resource-active"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!formData.name.trim() || createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-resource"
              >
                {editingResource ? "Salvar alterações" : "Criar recurso"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Recurso</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o recurso "{deletingResource?.name}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingResource && deleteMutation.mutate(deletingResource.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
