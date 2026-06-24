import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ArrowLeft, Plus, Pencil, Trash2, RotateCcw, Loader2, FolderTree } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { TicketCategory } from "@shared/schema";

type DialogMode = "branch" | "subcategory" | "edit";

type FormFieldRule = { regex?: string; minLen?: number; maxLen?: number; min?: number; max?: number };
type FormField = { key: string; label: string; type: string; required: boolean; options?: string[]; placeholder?: string; helpText?: string; rules?: FormFieldRule };
type RequiredAttachment = { key: string; label: string; mime?: string[]; required?: boolean };
type ChecklistItem = { key: string; label: string };

export default function AdminTicketCategories(props: { embedded?: boolean } & Record<string, any>) {
  const embedded = props.embedded ?? false;
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("branch");
  const [editing, setEditing] = useState<TicketCategory | null>(null);
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [parentId, setParentId] = useState<string>("none");
  const [descriptionTemplate, setDescriptionTemplate] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [templateApplyMode, setTemplateApplyMode] = useState("replace_if_empty");
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [newFieldPlaceholder, setNewFieldPlaceholder] = useState("");
  const [newFieldHelpText, setNewFieldHelpText] = useState("");
  const [newFieldRegex, setNewFieldRegex] = useState("");
  const [newFieldMinLen, setNewFieldMinLen] = useState("");
  const [newFieldMaxLen, setNewFieldMaxLen] = useState("");
  const [newFieldMin, setNewFieldMin] = useState("");
  const [newFieldMax, setNewFieldMax] = useState("");
  const [showAddField, setShowAddField] = useState(false);
  // When set, the field panel is editing an existing field (by its original key)
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);

  const [requiredAttachments, setRequiredAttachments] = useState<RequiredAttachment[]>([]);
  const [showAddAttachment, setShowAddAttachment] = useState(false);
  const [newAttKey, setNewAttKey] = useState("");
  const [newAttLabel, setNewAttLabel] = useState("");
  const [newAttMime, setNewAttMime] = useState("");
  const [newAttRequired, setNewAttRequired] = useState(true);

  const [checklistTemplate, setChecklistTemplate] = useState<ChecklistItem[]>([]);
  const [showAddChecklist, setShowAddChecklist] = useState(false);
  const [newCheckKey, setNewCheckKey] = useState("");
  const [newCheckLabel, setNewCheckLabel] = useState("");

  const [kbTags, setKbTags] = useState("");
  const [autoAwaitOnMissing, setAutoAwaitOnMissing] = useState(false);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [approvalMode, setApprovalMode] = useState("DESTINATION_COORDINATOR");
  const [approvalUserIds, setApprovalUserIds] = useState<string[]>([]);

  const { data: categories = [], isLoading } = useQuery<TicketCategory[]>({
    queryKey: ["/api/admin/tickets/categories"],
  });

  const { data: adminUsers = [] } = useQuery<Array<{ id: string; name: string; email: string }>>({
    queryKey: ["/api/users/directory", "admins"],
    queryFn: async () => {
      const res = await fetch("/api/users/directory?all=true", { credentials: "include" });
      if (!res.ok) return [];
      const all = await res.json();
      return all.filter((u: any) => u.isAdmin || u.roles?.some((r: any) => r.roleName === "Admin"));
    },
  });

  const roots = categories.filter(c => !c.parentId);
  const activeRoots = roots.filter(r => r.isActive);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name,
        descriptionTemplate: descriptionTemplate || null,
      };

      if (editing) {
        if (editing.parentId) {
          payload.parentId = parentId === "none" ? null : parentId;
          const parent = parentId !== "none" ? categories.find(c => c.id === parentId) : null;
          if (parent) payload.branch = parent.branch;
          payload.formSchema = formFields.length > 0 ? formFields : null;
          payload.templateApplyMode = templateApplyMode;
          payload.requiredAttachments = requiredAttachments.length > 0 ? requiredAttachments : null;
          payload.checklistTemplate = checklistTemplate.length > 0 ? checklistTemplate : null;
          payload.kbTags = kbTags.trim() ? kbTags.split(",").map(t => t.trim()).filter(Boolean) : null;
          payload.autoAwaitOnMissing = autoAwaitOnMissing;
          payload.requiresApproval = requiresApproval;
          payload.approvalMode = approvalMode;
          payload.approvalUserIds = approvalMode === "SPECIFIC_USERS" ? approvalUserIds : [];
        }
        return (await apiRequest("PATCH", `/api/admin/tickets/categories/${editing.id}`, payload)).json();
      }

      if (dialogMode === "branch") {
        payload.branch = name;
        payload.parentId = null;
      } else {
        const parent = categories.find(c => c.id === parentId);
        payload.branch = parent?.branch || name;
        payload.parentId = parentId === "none" ? null : parentId;
      }
      return (await apiRequest("POST", "/api/admin/tickets/categories", payload)).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tickets/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/categories"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: editing ? "Categoria atualizada" : "Categoria criada" });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return (await apiRequest("PATCH", `/api/admin/tickets/categories/${id}`, { isActive })).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tickets/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/categories"] });
      toast({ title: "Status atualizado" });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setEditing(null);
    setName("");
    setBranch("");
    setParentId("none");
    setDescriptionTemplate("");
    setFormFields([]);
    setTemplateApplyMode("replace_if_empty");
    setShowAddField(false);
    resetFieldForm();
    setRequiredAttachments([]);
    setShowAddAttachment(false);
    setNewAttKey(""); setNewAttLabel(""); setNewAttMime(""); setNewAttRequired(true);
    setChecklistTemplate([]);
    setShowAddChecklist(false);
    setNewCheckKey(""); setNewCheckLabel("");
    setKbTags("");
    setAutoAwaitOnMissing(false);
    setRequiresApproval(false);
    setApprovalMode("DESTINATION_COORDINATOR");
    setApprovalUserIds([]);
  }

  function resetFieldForm() {
    setNewFieldKey(""); setNewFieldLabel(""); setNewFieldType("text");
    setNewFieldRequired(false); setNewFieldOptions("");
    setNewFieldPlaceholder(""); setNewFieldHelpText("");
    setNewFieldRegex(""); setNewFieldMinLen(""); setNewFieldMaxLen("");
    setNewFieldMin(""); setNewFieldMax("");
    setEditingFieldKey(null);
  }

  // Populate the field panel with an existing field's values for editing
  function startEditField(field: FormField) {
    setEditingFieldKey(field.key);
    setNewFieldKey(field.key);
    setNewFieldLabel(field.label);
    setNewFieldType(field.type);
    setNewFieldRequired(field.required);
    // Options are stored as an array → show one per line (commas allowed inside)
    setNewFieldOptions(field.options && field.options.length > 0 ? field.options.join("\n") : "");
    setNewFieldPlaceholder(field.placeholder || "");
    setNewFieldHelpText(field.helpText || "");
    setNewFieldRegex(field.rules?.regex || "");
    setNewFieldMinLen(field.rules?.minLen != null ? String(field.rules.minLen) : "");
    setNewFieldMaxLen(field.rules?.maxLen != null ? String(field.rules.maxLen) : "");
    setNewFieldMin(field.rules?.min != null ? String(field.rules.min) : "");
    setNewFieldMax(field.rules?.max != null ? String(field.rules.max) : "");
    setShowAddField(true);
  }

  // Open a blank field panel for adding a new field
  function startAddField() {
    resetFieldForm();
    setShowAddField(true);
  }

  function openCreateBranch() {
    resetForm();
    setDialogMode("branch");
    setDialogOpen(true);
  }

  function openCreateSubcategory() {
    resetForm();
    setDialogMode("subcategory");
    if (activeRoots.length === 1) {
      setParentId(activeRoots[0].id);
    }
    setDialogOpen(true);
  }

  function openEdit(cat: TicketCategory) {
    setEditing(cat);
    setDialogMode("edit");
    setName(cat.name);
    setBranch(cat.branch);
    setParentId(cat.parentId || "none");
    setDescriptionTemplate(cat.descriptionTemplate || "");
    setFormFields(((cat as any).formSchema || []).map((f: any) => ({ ...f, required: f.required ?? false })));
    setTemplateApplyMode((cat as any).templateApplyMode || "replace_if_empty");
    setRequiredAttachments((cat as any).requiredAttachments || []);
    setChecklistTemplate((cat as any).checklistTemplate || []);
    const tags = (cat as any).kbTags;
    setKbTags(tags && Array.isArray(tags) ? tags.join(", ") : "");
    setAutoAwaitOnMissing((cat as any).autoAwaitOnMissing || false);
    setRequiresApproval((cat as any).requiresApproval || false);
    setApprovalMode((cat as any).approvalMode || "REQUESTER_COORDINATOR");
    setApprovalUserIds((cat as any).approvalUserIds || []);
    setShowAddField(false);
    setShowAddAttachment(false);
    setShowAddChecklist(false);
    setDialogOpen(true);
  }

  function saveFormField() {
    const key = newFieldKey.trim();
    const label = newFieldLabel.trim();
    if (!key || !label) return;

    // Prevent duplicate keys (ignoring the field currently being edited)
    const keyTaken = formFields.some(f => f.key === key && f.key !== editingFieldKey);
    if (keyTaken) {
      toast({ title: "Chave duplicada", description: `Já existe um campo com a chave "${key}".`, variant: "destructive" });
      return;
    }

    const rules: FormFieldRule = {};
    if (newFieldRegex.trim()) rules.regex = newFieldRegex.trim();
    if (newFieldMinLen) rules.minLen = Number(newFieldMinLen);
    if (newFieldMaxLen) rules.maxLen = Number(newFieldMaxLen);
    if (newFieldMin) rules.min = Number(newFieldMin);
    if (newFieldMax) rules.max = Number(newFieldMax);

    const field: FormField = {
      key,
      label,
      type: newFieldType,
      required: newFieldRequired,
      // Options are split by line break so commas can appear inside an option
      ...(newFieldType === "select" && newFieldOptions.trim()
        ? { options: newFieldOptions.split("\n").map(o => o.trim()).filter(Boolean) }
        : {}),
      ...(newFieldPlaceholder.trim() ? { placeholder: newFieldPlaceholder.trim() } : {}),
      ...(newFieldHelpText.trim() ? { helpText: newFieldHelpText.trim() } : {}),
      ...(Object.keys(rules).length > 0 ? { rules } : {}),
    };

    setFormFields(prev =>
      editingFieldKey
        ? prev.map(f => (f.key === editingFieldKey ? field : f))
        : [...prev, field]
    );
    resetFieldForm();
    setShowAddField(false);
  }

  function removeFormField(key: string) {
    setFormFields(prev => prev.filter(f => f.key !== key));
  }

  function addRequiredAttachment() {
    if (!newAttKey.trim() || !newAttLabel.trim()) return;
    setRequiredAttachments(prev => [
      ...prev,
      {
        key: newAttKey.trim(),
        label: newAttLabel.trim(),
        ...(newAttMime.trim() ? { mime: newAttMime.split(",").map(m => m.trim()).filter(Boolean) } : {}),
        required: newAttRequired,
      },
    ]);
    setNewAttKey(""); setNewAttLabel(""); setNewAttMime(""); setNewAttRequired(true);
    setShowAddAttachment(false);
  }

  function addChecklistItem() {
    if (!newCheckKey.trim() || !newCheckLabel.trim()) return;
    setChecklistTemplate(prev => [...prev, { key: newCheckKey.trim(), label: newCheckLabel.trim() }]);
    setNewCheckKey(""); setNewCheckLabel("");
    setShowAddChecklist(false);
  }

  const filteredCategories = showInactive
    ? categories
    : categories.filter(c => c.isActive);

  const sortedCategories = [...filteredCategories].sort((a, b) => {
    const aIsRoot = !a.parentId;
    const bIsRoot = !b.parentId;

    if (aIsRoot && bIsRoot) return a.name.localeCompare(b.name);

    const rootA = aIsRoot ? a : categories.find(c => c.id === a.parentId);
    const rootB = bIsRoot ? b : categories.find(c => c.id === b.parentId);

    const rootNameA = rootA?.name || "";
    const rootNameB = rootB?.name || "";
    const rootCmp = rootNameA.localeCompare(rootNameB);
    if (rootCmp !== 0) return rootCmp;

    if (aIsRoot) return -1;
    if (bIsRoot) return 1;
    return a.name.localeCompare(b.name);
  });

  const isSubcategory = (editing && editing.parentId) || dialogMode === "subcategory";

  return (
    <div className={embedded ? "flex flex-col gap-4" : "flex flex-col gap-6 p-6"}>
      {!embedded && (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FolderTree className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Categorias de Chamados</h1>
            <p className="text-sm text-muted-foreground">Gerenciar branches e subcategorias</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openCreateBranch} data-testid="button-new-branch">
            <Plus className="mr-2 h-4 w-4" />
            Nova Branch
          </Button>
          <Button onClick={openCreateSubcategory} data-testid="button-new-subcategory">
            <Plus className="mr-2 h-4 w-4" />
            Nova Subcategoria
          </Button>
        </div>
      </div>
      )}
      {embedded && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={openCreateBranch} data-testid="button-new-branch">
            <Plus className="mr-2 h-4 w-4" />
            Nova Branch
          </Button>
          <Button onClick={openCreateSubcategory} data-testid="button-new-subcategory">
            <Plus className="mr-2 h-4 w-4" />
            Nova Subcategoria
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-end gap-2 mb-4">
            <Label htmlFor="show-inactive" className="text-sm text-muted-foreground">
              Mostrar inativas
            </Label>
            <Switch
              id="show-inactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
              data-testid="switch-show-inactive"
            />
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : sortedCategories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma categoria encontrada.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Formulário</TableHead>
                  <TableHead>Fluxo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCategories.map(cat => {
                  const isRoot = !cat.parentId;
                  const attachCount = ((cat as any).requiredAttachments || []).length;
                  const checkCount = ((cat as any).checklistTemplate || []).length;
                  const askInfo = (cat as any).autoAwaitOnMissing === true;
                  const needsApproval = (cat as any).requiresApproval === true;
                  return (
                    <TableRow key={cat.id} className={!cat.isActive ? "opacity-60" : ""} data-testid={`category-${cat.id}`}>
                      <TableCell className={isRoot ? "font-semibold" : "pl-8"}>
                        {isRoot ? (
                          <span className="flex items-center gap-2">
                            <FolderTree className="h-4 w-4 text-primary" />
                            {cat.name}
                          </span>
                        ) : (
                          <>└ {cat.name}</>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{isRoot ? "Branch" : "Subcategoria"}</Badge>
                      </TableCell>
                      <TableCell>
                        {cat.descriptionTemplate ? (
                          <Badge variant="secondary" className="text-xs">Sim</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {(cat as any).formSchema && (cat as any).formSchema.length > 0 && (
                            <Badge variant="secondary" className="text-xs">{(cat as any).formSchema.length} campos</Badge>
                          )}
                          {attachCount > 0 && (
                            <Badge variant="outline" className="text-xs">{attachCount} anexos</Badge>
                          )}
                          {checkCount > 0 && (
                            <Badge variant="outline" className="text-xs">{checkCount} checks</Badge>
                          )}
                          {!((cat as any).formSchema?.length || attachCount || checkCount) && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {isRoot ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex gap-1 flex-wrap">
                            {askInfo && (
                              <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600 dark:text-amber-400">
                                Pedir infos
                              </Badge>
                            )}
                            {needsApproval && (
                              <Badge variant="outline" className="text-xs border-purple-500/40 text-purple-600 dark:text-purple-400">
                                Aprovação
                              </Badge>
                            )}
                            {!askInfo && !needsApproval && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cat.isActive ? "default" : "secondary"}>
                          {cat.isActive ? "Ativa" : "Inativa"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(cat)} data-testid={`edit-${cat.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {cat.isActive ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleActiveMutation.mutate({ id: cat.id, isActive: false })}
                            data-testid={`deactivate-${cat.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleActiveMutation.mutate({ id: cat.id, isActive: true })}
                            data-testid={`reactivate-${cat.id}`}
                          >
                            <RotateCcw className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent className="flex flex-col sm:max-w-2xl p-0" data-testid="sheet-category-form">
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <FolderTree className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle>
                  {editing
                    ? "Editar Categoria"
                    : dialogMode === "branch"
                    ? "Nova Branch"
                    : "Nova Subcategoria"}
                </SheetTitle>
                <SheetDescription>
                  {editing
                    ? "Altere as informações da categoria"
                    : dialogMode === "branch"
                    ? "Crie uma nova branch principal de chamados"
                    : "Crie uma subcategoria com formulário e regras"}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5">
          {isSubcategory ? (
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="general">Geral</TabsTrigger>
                <TabsTrigger value="form">Formulário</TabsTrigger>
                <TabsTrigger value="attachments">Anexos</TabsTrigger>
                <TabsTrigger value="checklist">Checklist</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-category-name" />
                </div>

                {dialogMode === "subcategory" && !editing && (
                  <div className="space-y-2">
                    <Label>Branch (pai)</Label>
                    <Select value={parentId} onValueChange={setParentId}>
                      <SelectTrigger data-testid="select-parent">
                        <SelectValue placeholder="Selecione a branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeRoots.map(r => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {editing && editing.parentId && (
                  <div className="space-y-2">
                    <Label>Branch (pai)</Label>
                    <Select value={parentId} onValueChange={setParentId}>
                      <SelectTrigger data-testid="select-parent">
                        <SelectValue placeholder="Selecione a branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {roots.map(r => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Template de Descrição (opcional)</Label>
                  <Textarea
                    value={descriptionTemplate}
                    onChange={(e) => setDescriptionTemplate(e.target.value)}
                    placeholder="Template que será preenchido automaticamente..."
                    rows={3}
                    data-testid="input-description-template"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Modo do template</Label>
                  <Select value={templateApplyMode} onValueChange={setTemplateApplyMode}>
                    <SelectTrigger data-testid="select-template-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="replace_if_empty">Substituir se vazio</SelectItem>
                      <SelectItem value="always_replace">Substituir sempre</SelectItem>
                      <SelectItem value="append">Concatenar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tags KB (para sugestão de artigos, separar por vírgula)</Label>
                  <Input
                    value={kbTags}
                    onChange={(e) => setKbTags(e.target.value)}
                    placeholder="hardware, impressora, rede"
                    data-testid="input-kb-tags"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Switch checked={autoAwaitOnMissing} onCheckedChange={setAutoAwaitOnMissing} data-testid="switch-auto-await" />
                  <Label className="text-sm">Habilitar botão "Pedir infos" (quando faltar dados/anexos)</Label>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={requiresApproval} onCheckedChange={setRequiresApproval} data-testid="switch-requires-approval" />
                    <Label className="text-sm">Exigir aprovação antes do atendimento</Label>
                  </div>

                  {requiresApproval && (
                    <div className="space-y-3 pl-2 border-l-2 border-purple-200 dark:border-purple-800">
                      <div className="space-y-2">
                        <Label className="text-xs">Modo de aprovação</Label>
                        <Select value={approvalMode} onValueChange={setApprovalMode}>
                          <SelectTrigger data-testid="select-approval-mode">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DESTINATION_COORDINATOR">Coordenador do setor de destino</SelectItem>
                            <SelectItem value="REQUESTER_COORDINATOR">Coordenador do setor do solicitante</SelectItem>
                            <SelectItem value="TI_ADMIN">Admin do setor de destino</SelectItem>
                            <SelectItem value="SPECIFIC_USERS">Usuários específicos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {approvalMode === "SPECIFIC_USERS" && (
                        <div className="space-y-2">
                          <Label className="text-xs">Aprovadores</Label>
                          <div className="max-h-32 overflow-y-auto space-y-1 border rounded-lg p-2">
                            {adminUsers.map((u) => (
                              <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                                <Checkbox
                                  checked={approvalUserIds.includes(u.id)}
                                  onCheckedChange={(checked) => {
                                    setApprovalUserIds(prev =>
                                      checked ? [...prev, u.id] : prev.filter(id => id !== u.id)
                                    );
                                  }}
                                />
                                <span className="truncate">{u.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="form" className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <Label>Campos do formulário</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (showAddField) {
                        setShowAddField(false);
                        resetFieldForm();
                      } else {
                        startAddField();
                      }
                    }}
                    data-testid="button-toggle-add-field"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Campo
                  </Button>
                </div>

                {formFields.length > 0 && (
                  <div className="space-y-1">
                    {formFields.map(f => (
                      <div
                        key={f.key}
                        className={`flex items-center justify-between border rounded px-2 py-1 text-sm ${editingFieldKey === f.key ? "border-primary ring-1 ring-primary/40" : ""}`}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{f.label}</span>
                          <span className="text-muted-foreground ml-1">({f.type})</span>
                          {f.required && <Badge variant="destructive" className="ml-1 text-xs">obr.</Badge>}
                          {f.type === "select" && f.options && f.options.length > 0 && (
                            <Badge variant="outline" className="ml-1 text-xs">{f.options.length} opções</Badge>
                          )}
                          {f.rules && Object.keys(f.rules).length > 0 && (
                            <Badge variant="outline" className="ml-1 text-xs">regras</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEditField(f)} data-testid={`edit-field-${f.key}`}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFormField(f.key)} data-testid={`remove-field-${f.key}`}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {showAddField && (
                  <div className="border rounded-lg p-3 space-y-2 bg-muted/50">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Chave</Label>
                        <Input value={newFieldKey} onChange={e => setNewFieldKey(e.target.value)} placeholder="nome_campo" className="h-8" data-testid="input-field-key" />
                      </div>
                      <div>
                        <Label className="text-xs">Rótulo</Label>
                        <Input value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} placeholder="Nome do Campo" className="h-8" data-testid="input-field-label" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Tipo</Label>
                        <Select value={newFieldType} onValueChange={setNewFieldType}>
                          <SelectTrigger className="h-8" data-testid="select-field-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Texto</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="number">Número</SelectItem>
                            <SelectItem value="textarea">Texto longo</SelectItem>
                            <SelectItem value="select">Seleção</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="flex items-center gap-1 text-xs cursor-pointer pb-2">
                          <Switch checked={newFieldRequired} onCheckedChange={setNewFieldRequired} />
                          Obrigatório
                        </label>
                      </div>
                    </div>
                    {newFieldType === "select" && (
                      <div>
                        <Label className="text-xs">Opções (uma por linha)</Label>
                        <Textarea
                          value={newFieldOptions}
                          onChange={e => setNewFieldOptions(e.target.value)}
                          placeholder={"Sim, somente eu\nNão, está instável\nNão sei"}
                          rows={4}
                          className="text-sm font-mono"
                          data-testid="input-field-options"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Uma opção por linha. Vírgulas dentro da opção são preservadas (ex.: "Sim, somente eu").
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Placeholder (opcional)</Label>
                        <Input value={newFieldPlaceholder} onChange={e => setNewFieldPlaceholder(e.target.value)} placeholder="Ex: Digite aqui..." className="h-8" />
                      </div>
                      <div>
                        <Label className="text-xs">Texto de ajuda (opcional)</Label>
                        <Input value={newFieldHelpText} onChange={e => setNewFieldHelpText(e.target.value)} placeholder="Ex: Formato esperado..." className="h-8" />
                      </div>
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">Regras de validação (avançado)</summary>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <div>
                          <Label className="text-xs">Regex</Label>
                          <Input value={newFieldRegex} onChange={e => setNewFieldRegex(e.target.value)} placeholder="^[A-Z]+" className="h-7 text-xs" />
                        </div>
                        <div>
                          <Label className="text-xs">Min. chars</Label>
                          <Input type="number" value={newFieldMinLen} onChange={e => setNewFieldMinLen(e.target.value)} className="h-7 text-xs" />
                        </div>
                        <div>
                          <Label className="text-xs">Max. chars</Label>
                          <Input type="number" value={newFieldMaxLen} onChange={e => setNewFieldMaxLen(e.target.value)} className="h-7 text-xs" />
                        </div>
                        {newFieldType === "number" && (
                          <>
                            <div>
                              <Label className="text-xs">Min. valor</Label>
                              <Input type="number" value={newFieldMin} onChange={e => setNewFieldMin(e.target.value)} className="h-7 text-xs" />
                            </div>
                            <div>
                              <Label className="text-xs">Max. valor</Label>
                              <Input type="number" value={newFieldMax} onChange={e => setNewFieldMax(e.target.value)} className="h-7 text-xs" />
                            </div>
                          </>
                        )}
                      </div>
                    </details>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" onClick={saveFormField} disabled={!newFieldKey.trim() || !newFieldLabel.trim()} data-testid="button-add-field">
                        {editingFieldKey ? "Salvar campo" : "Adicionar campo"}
                      </Button>
                      {editingFieldKey && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => { resetFieldForm(); setShowAddField(false); }}
                          data-testid="button-cancel-edit-field"
                        >
                          Cancelar edição
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="attachments" className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <Label>Anexos obrigatórios</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowAddAttachment(!showAddAttachment)} data-testid="button-toggle-add-attachment">
                    <Plus className="h-3 w-3 mr-1" />
                    Anexo
                  </Button>
                </div>

                {requiredAttachments.length > 0 && (
                  <div className="space-y-1">
                    {requiredAttachments.map(a => (
                      <div key={a.key} className="flex items-center justify-between border rounded px-2 py-1 text-sm">
                        <div>
                          <span className="font-medium">{a.label}</span>
                          <span className="text-muted-foreground ml-1">({a.key})</span>
                          {a.required && <Badge variant="destructive" className="ml-1 text-xs">obr.</Badge>}
                          {a.mime && a.mime.length > 0 && (
                            <span className="text-xs text-muted-foreground ml-1">[{a.mime.join(", ")}]</span>
                          )}
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRequiredAttachments(prev => prev.filter(x => x.key !== a.key))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {showAddAttachment && (
                  <div className="border rounded-lg p-3 space-y-2 bg-muted/50">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Chave</Label>
                        <Input value={newAttKey} onChange={e => setNewAttKey(e.target.value)} placeholder="print_erro" className="h-8" data-testid="input-att-key" />
                      </div>
                      <div>
                        <Label className="text-xs">Rótulo</Label>
                        <Input value={newAttLabel} onChange={e => setNewAttLabel(e.target.value)} placeholder="Print do erro" className="h-8" data-testid="input-att-label" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">MIME types (opcional, separar por vírgula)</Label>
                        <Input value={newAttMime} onChange={e => setNewAttMime(e.target.value)} placeholder="image/png, image/jpeg" className="h-8" />
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="flex items-center gap-1 text-xs cursor-pointer pb-2">
                          <Switch checked={newAttRequired} onCheckedChange={setNewAttRequired} />
                          Obrigatório
                        </label>
                      </div>
                    </div>
                    <Button type="button" size="sm" onClick={addRequiredAttachment} disabled={!newAttKey.trim() || !newAttLabel.trim()} data-testid="button-add-attachment">
                      Adicionar anexo
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="checklist" className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <Label>Template de checklist</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowAddChecklist(!showAddChecklist)} data-testid="button-toggle-add-checklist">
                    <Plus className="h-3 w-3 mr-1" />
                    Item
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Itens de checklist são criados automaticamente ao abrir um chamado nesta categoria.</p>

                {checklistTemplate.length > 0 && (
                  <div className="space-y-1">
                    {checklistTemplate.map(c => (
                      <div key={c.key} className="flex items-center justify-between border rounded px-2 py-1 text-sm">
                        <div>
                          <span className="font-medium">{c.label}</span>
                          <span className="text-muted-foreground ml-1">({c.key})</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setChecklistTemplate(prev => prev.filter(x => x.key !== c.key))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {showAddChecklist && (
                  <div className="border rounded-lg p-3 space-y-2 bg-muted/50">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Chave</Label>
                        <Input value={newCheckKey} onChange={e => setNewCheckKey(e.target.value)} placeholder="criar_usuario" className="h-8" data-testid="input-check-key" />
                      </div>
                      <div>
                        <Label className="text-xs">Rótulo</Label>
                        <Input value={newCheckLabel} onChange={e => setNewCheckLabel(e.target.value)} placeholder="Criar usuário no sistema X" className="h-8" data-testid="input-check-label" />
                      </div>
                    </div>
                    <Button type="button" size="sm" onClick={addChecklistItem} disabled={!newCheckKey.trim() || !newCheckLabel.trim()} data-testid="button-add-checklist">
                      Adicionar item
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-category-name" />
              </div>
              <div className="space-y-2">
                <Label>Template de Descrição (opcional)</Label>
                <Textarea
                  value={descriptionTemplate}
                  onChange={(e) => setDescriptionTemplate(e.target.value)}
                  placeholder="Template que será preenchido automaticamente..."
                  rows={3}
                  data-testid="input-description-template"
                />
              </div>
            </div>
          )}
            </div>

            <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!name || saveMutation.isPending || (dialogMode === "subcategory" && !editing && parentId === "none")}
                data-testid="button-save-category"
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (editing ? "Salvar alterações" : "Criar")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
