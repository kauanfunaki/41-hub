import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ArrowLeft,
  ArrowRight,
  Loader2,
  FileText,
  BookOpen,
  ThumbsUp,
  ExternalLink,
  Paperclip,
  AlertTriangle,
  CheckCircle2,
  Search,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Sector, TicketCategoryTree, KbArticle } from "@shared/schema";

type KbArticleWithMeta = KbArticle & {
  categoryName?: string;
  helpfulCount?: number;
  viewCount?: number;
};

type FormFieldRule = {
  regex?: string;
  minLen?: number;
  maxLen?: number;
  min?: number;
  max?: number;
};
type FormField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  helpText?: string;
  rules?: FormFieldRule;
};
type RequiredAttachment = {
  key: string;
  label: string;
  mime?: string[];
  required?: boolean;
};

const STEP_LABELS = ["Categoria", "Detalhes", "Formulário"];

const BRANCH_COLORS = [
  "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
];
const PRIORITY_OPTIONS = [
  { value: "BAIXA",   label: "Baixa",   color: "border-slate-400 text-slate-600 dark:text-slate-400 bg-slate-500/5 hover:bg-slate-500/10" },
  { value: "MEDIA",   label: "Média",   color: "border-blue-400 text-blue-600 dark:text-blue-400 bg-blue-500/5 hover:bg-blue-500/10" },
  { value: "ALTA",    label: "Alta",    color: "border-amber-400 text-amber-600 dark:text-amber-400 bg-amber-500/5 hover:bg-amber-500/10" },
  { value: "URGENTE", label: "Urgente", color: "border-red-400 text-red-600 dark:text-red-400 bg-red-500/5 hover:bg-red-500/10" },
];

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <div key={step} className="flex items-center gap-1">
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors shrink-0",
                done    ? "bg-primary text-primary-foreground" :
                active  ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2" :
                          "bg-muted text-muted-foreground"
              )}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : step}
              </div>
              <span className={cn("text-xs font-medium hidden sm:inline whitespace-nowrap",
                active ? "text-foreground" : "text-muted-foreground"
              )}>
                {STEP_LABELS[i]}
              </span>
            </div>
            {step < total && <div className={cn("h-px w-6 mx-1", done ? "bg-primary" : "bg-muted")} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function TicketsNew() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const isAdmin = user?.isAdmin;
  const isCoordinator = !isAdmin && user?.roles?.some((r) => r.roleName === "Coordenador");
  const isUser = !isAdmin && !isCoordinator;

  // Wizard step: 1 = categoria, 2 = detalhes
  const [step, setStep] = useState(1);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requesterSectorId, setRequesterSectorId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [priority, setPriority] = useState("MEDIA");
  const [showTemplateConfirm, setShowTemplateConfirm] = useState(false);
  const pendingTemplate = useRef("");
  const [requestData, setRequestData] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Files chosen for each configured required-attachment slot, keyed by attachment key
  const [attachmentFiles, setAttachmentFiles] = useState<Record<string, File>>({});

  const ALLOWED_EXTS = [".jpg", ".jpeg", ".png", ".pdf", ".mp4", ".zip", ".7z", ".rar", ".docx", ".xlsx", ".txt", ".csv"];
  const MAX_FILE_MB = 100;

  // Maps a file extension to the MIME types it may legitimately carry. Used to
  // validate uploads when the browser reports an empty/ambiguous file.type.
  const EXT_TO_MIME: Record<string, string[]> = {
    ".png": ["image/png"],
    ".jpg": ["image/jpeg"],
    ".jpeg": ["image/jpeg"],
    ".pdf": ["application/pdf"],
    ".mp4": ["video/mp4"],
    ".zip": ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
    ".rar": ["application/vnd.rar", "application/x-rar-compressed", "application/x-rar"],
    ".7z": ["application/x-7z-compressed"],
    ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ".txt": ["text/plain"],
    ".csv": ["text/csv", "application/vnd.ms-excel"],
  };

  function extOf(name: string): string {
    const i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(i).toLowerCase() : "";
  }

  // Checks a file against an allowed MIME list (from the category config).
  // Falls back to extension→MIME mapping when file.type is empty/unreliable.
  function fileMatchesMimes(file: File, allowedMimes: string[]): boolean {
    if (allowedMimes.length === 0) return ALLOWED_EXTS.includes(extOf(file.name));
    if (file.type && allowedMimes.includes(file.type)) return true;
    const candidates = EXT_TO_MIME[extOf(file.name)] || [];
    return candidates.some((c) => allowedMimes.includes(c));
  }

  // Builds the <input accept> string for a required attachment slot
  function acceptFor(mimes?: string[]): string {
    return mimes && mimes.length > 0 ? mimes.join(",") : ALLOWED_EXTS.join(",");
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function handleAddFiles(fileList: FileList | null) {
    if (!fileList) return;
    const incoming = Array.from(fileList);
    const accepted: File[] = [];
    for (const f of incoming) {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      if (!ALLOWED_EXTS.includes(ext)) {
        toast({ title: "Tipo não permitido", description: `"${f.name}" não é um formato aceito (JPEG, PNG, PDF, MP4, ZIP, RAR, 7Z, DOCX, XLSX, TXT, CSV).`, variant: "destructive" });
        continue;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast({ title: "Arquivo muito grande", description: `"${f.name}" excede o limite de ${MAX_FILE_MB} MB.`, variant: "destructive" });
        continue;
      }
      accepted.push(f);
    }
    setFiles((prev) => {
      const seen = new Set(prev.map((p) => `${p.name}:${p.size}`));
      return [...prev, ...accepted.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  // Validate + store a file for a specific required-attachment slot
  function handleAttachmentFile(att: RequiredAttachment, file: File | null) {
    if (!file) return;
    if (!fileMatchesMimes(file, att.mime || [])) {
      const allowed = att.mime && att.mime.length > 0 ? att.mime.join(", ") : "JPEG, PNG, PDF, MP4, ZIP, RAR, 7Z";
      toast({
        title: "Tipo de arquivo não permitido",
        description: `"${att.label}" aceita apenas: ${allowed}.`,
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: `"${file.name}" excede o limite de ${MAX_FILE_MB} MB.`, variant: "destructive" });
      return;
    }
    setAttachmentFiles((prev) => ({ ...prev, [att.key]: file }));
  }

  function removeAttachmentFile(key: string) {
    setAttachmentFiles((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const { data: adminSectors = [] } = useQuery<Sector[]>({
    queryKey: ["/api/admin/sectors"],
    enabled: !!isAdmin,
  });

  const { data: categories = [] } = useQuery<TicketCategoryTree[]>({
    queryKey: ["/api/tickets/categories"],
  });

  const { data: kbSuggestions = [] } = useQuery<KbArticleWithMeta[]>({
    queryKey: ["/api/kb", categoryId],
    queryFn: async () => {
      if (!categoryId) return [];
      const res = await fetch(`/api/kb?categoryId=${categoryId}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!categoryId,
  });

  const availableSectors: Array<{ id: string; name: string }> = (() => {
    if (isAdmin) return adminSectors;
    if (!user?.roles) return [];
    const map = new Map<string, string>();
    for (const r of user.roles) {
      if (r.roleName === "Coordenador") map.set(r.sectorId, r.sectorName);
    }
    if (map.size === 0) {
      for (const r of user.roles) map.set(r.sectorId, r.sectorName);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  })();

  useEffect(() => {
    if (availableSectors.length === 1 && !requesterSectorId) {
      setRequesterSectorId(availableSectors[0].id);
    }
  }, [availableSectors, requesterSectorId]);

  // Flatten all categories; only leaf nodes (children of root, or root without children) are selectable
  const leafCategories = categories.flatMap((root) => {
    if (root.children && root.children.length > 0) {
      return root.children.map((child) => ({
        ...child,
        displayPath: `${root.name} / ${child.name}`,
      }));
    }
    return [{ ...root, displayPath: root.name }];
  });

  const allCategories = categories.flatMap((root) => {
    const items: TicketCategoryTree[] = [root];
    if (root.children) items.push(...root.children);
    return items;
  });

  const selectedCategory = allCategories.find((c) => c.id === categoryId);
  const categoryTemplate = (selectedCategory as any)?.descriptionTemplate || "";
  const selectedFormSchema: FormField[] =
    (selectedCategory as any)?.formSchema || [];
  const selectedRequiredAttachments: RequiredAttachment[] =
    (selectedCategory as any)?.requiredAttachments || [];

  function handleCategoryChange(newCategoryId: string) {
    setCategoryId(newCategoryId);
    setRequestData({});
    setAttachmentFiles({});
    const cat = allCategories.find((c) => c.id === newCategoryId);
    const template = (cat as any)?.descriptionTemplate || "";
    if (template && !description.trim()) {
      setDescription(template);
    }
  }

  function handleInsertTemplate() {
    if (description.trim()) {
      pendingTemplate.current = categoryTemplate;
      setShowTemplateConfirm(true);
    } else {
      setDescription(categoryTemplate);
    }
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const sectorId =
        requesterSectorId ||
        (availableSectors.length === 1 ? availableSectors[0].id : "");
      const payload: Record<string, any> = {
        title,
        description,
        requesterSectorId: sectorId,
        categoryId,
        priority,
      };
      if (selectedFormSchema.length > 0) {
        payload.requestData = requestData;
      }
      const res = await apiRequest("POST", "/api/tickets", payload);
      const ticket = await res.json();

      // Build the upload list: configured required-attachment slots (tagged with
      // their attachmentKey) first, then any extra optional files.
      const uploads: Array<{ file: File; key?: string }> = [
        ...Object.entries(attachmentFiles).map(([key, file]) => ({ file, key })),
        ...files.map((file) => ({ file })),
      ];

      let failedUploads = 0;
      for (const { file, key } of uploads) {
        try {
          const fd = new FormData();
          fd.append("file", file);
          if (key) fd.append("attachmentKey", key);
          const up = await fetch(`/api/tickets/${ticket.id}/attachments`, {
            method: "POST",
            body: fd,
            credentials: "include",
          });
          if (!up.ok) failedUploads++;
        } catch {
          failedUploads++;
        }
      }
      return { ticket, failedUploads };
    },
    onSuccess: ({ ticket, failedUploads }) => {
      if (failedUploads > 0) {
        toast({
          title: "Chamado criado",
          description: `${failedUploads} anexo(s) não puderam ser enviados. Você pode anexá-los na tela do chamado.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Chamado criado com sucesso" });
      }
      navigate(`/tickets/${ticket.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar chamado",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  // Category search filtering
  const searchLower = categorySearch.toLowerCase();
  const filteredBranches = categories
    .map((root) => {
      const leaves = root.children && root.children.length > 0
        ? root.children.filter((c) => c.name.toLowerCase().includes(searchLower) || root.name.toLowerCase().includes(searchLower))
        : (root.name.toLowerCase().includes(searchLower) ? [root] : []);
      return { root, leaves };
    })
    .filter(({ leaves }) => leaves.length > 0);

  const effectiveSectorId =
    requesterSectorId ||
    (availableSectors.length === 1 ? availableSectors[0].id : "");

  useEffect(() => {
    if (isUser) navigate("/tickets");
  }, [isUser, navigate]);

  if (isUser) return null;

  const canProceedStep1 = !!categoryId;

  const canProceedStep2 = !!title && !!description && !!effectiveSectorId;

  // Required attachment slots that still have no file selected
  const missingRequiredAttachments = selectedRequiredAttachments.filter(
    (att) => att.required && !attachmentFiles[att.key]
  );

  // Required dynamic form fields that are empty
  const missingRequiredFields = selectedFormSchema.filter(
    (field) => field.required && !requestData[field.key]?.trim()
  );

  const canSubmit =
    !!title &&
    !!description &&
    !!effectiveSectorId &&
    !!categoryId &&
    missingRequiredAttachments.length === 0 &&
    missingRequiredFields.length === 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {step > 1 ? (
          <Button variant="ghost" size="icon" onClick={() => setStep(step - 1)} data-testid="button-back-step">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : (
          <Link href="/tickets">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
        )}
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">Novo Chamado</h1>
          <p className="text-sm text-muted-foreground">Preencha os dados para abrir um chamado de suporte</p>
        </div>
        <StepIndicator current={step} total={3} />
      </div>

      {availableSectors.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 flex flex-col items-center justify-center text-center gap-4" data-testid="text-no-sector">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
            <AlertTriangle className="h-7 w-7 text-amber-500" />
          </div>
          <div className="space-y-1.5 max-w-sm">
            <p className="font-semibold text-base">Conta sem setor vinculado</p>
            <p className="text-sm text-muted-foreground">
              Para abrir chamados, sua conta precisa estar associada a pelo menos um setor.
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 max-w-sm w-full">
            <p className="text-sm text-amber-800 dark:text-amber-300 font-medium mb-1">O que fazer?</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Peça ao administrador do portal para acessar <strong>Admin → Usuários</strong> e vincular um setor à sua conta.
              Após isso, tente novamente.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ── PASSO 1: Categoria ──────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 px-4 py-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-amber-800 dark:text-amber-200">
                  <span className="font-semibold">Atenção:</span> informações incompletas ou incorretas podem impactar o SLA do chamado.
                </p>
              </div>

              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="px-6 py-4 border-b bg-muted/30">
                  <h2 className="text-sm font-semibold">Selecione a categoria do chamado</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Escolha o tipo de serviço para que o chamado seja direcionado corretamente</p>
                </div>
                <div className="p-6 space-y-5">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      placeholder="Buscar categoria..."
                      className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-9 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      data-testid="input-category-search"
                    />
                    {categorySearch && (
                      <button
                        type="button"
                        onClick={() => setCategorySearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Card grid grouped by branch */}
                  {categories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">Nenhuma categoria cadastrada</p>
                      <p className="text-xs text-muted-foreground mt-1">Fale com um administrador para configurar as categorias.</p>
                    </div>
                  ) : filteredBranches.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <p className="text-sm text-muted-foreground">Nenhuma categoria encontrada para "<span className="font-medium">{categorySearch}</span>"</p>
                      <button type="button" onClick={() => setCategorySearch("")} className="text-xs text-primary mt-1 hover:underline">Limpar busca</button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {filteredBranches.map(({ root, leaves }, branchIdx) => {
                        const branchColor = BRANCH_COLORS[branchIdx % BRANCH_COLORS.length];
                        const initial = root.name.charAt(0).toUpperCase();
                        return (
                          <div key={root.id}>
                            {/* Branch header */}
                            <div className="flex items-center gap-2.5 mb-3">
                              <div className={cn("flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold border shrink-0", branchColor)}>
                                {initial}
                              </div>
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {root.name}
                              </span>
                              <div className="flex-1 h-px bg-border" />
                            </div>
                            {/* Leaf cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {leaves.map((cat) => {
                                const isSelected = categoryId === cat.id;
                                return (
                                  <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => handleCategoryChange(cat.id)}
                                    data-testid={`category-card-${cat.id}`}
                                    className={cn(
                                      "rounded-xl border-2 px-3 py-3 text-left transition-all group",
                                      isSelected
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:border-muted-foreground/40 hover:bg-muted/40"
                                    )}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <p className={cn("text-sm font-medium leading-snug", isSelected ? "text-primary" : "")}>
                                        {cat.name}
                                      </p>
                                      {isSelected && (
                                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* KB suggestions */}
                  {categoryId && kbSuggestions.length > 0 && (
                    <div className="rounded-xl border border-chart-1/20 bg-chart-1/5 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-chart-1" />
                        <span className="text-sm font-medium">Artigos que podem ajudar</span>
                        <Badge variant="secondary" className="text-xs">{kbSuggestions.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {kbSuggestions.slice(0, 3).map((article) => (
                          <a
                            key={article.id}
                            href={`/kb/articles/${article.id}`}
                            className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2.5 hover:bg-muted/50 transition-colors"
                            data-testid={`kb-suggestion-${article.id}`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{article.title}</p>
                              {article.helpfulCount !== undefined && article.helpfulCount > 0 && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                  <ThumbsUp className="h-3 w-3" />
                                  <span>{article.helpfulCount} útil</span>
                                </div>
                              )}
                            </div>
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          </a>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">Verifique se algum desses artigos resolve sua dúvida antes de abrir o chamado.</p>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button onClick={() => setStep(2)} disabled={!canProceedStep1} data-testid="button-next-step">
                      Próximo
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── PASSO 2: Detalhes ──────────────────────────────────────────── */}
          {step === 2 && (
            <div className="grid gap-6 lg:grid-cols-[1fr_280px] items-start">

              {/* LEFT — Campos básicos */}
              <div className="space-y-5">

                {/* Setor */}
                {availableSectors.length === 1 ? (
                  <div className="space-y-2">
                    <Label>Setor Solicitante</Label>
                    <p className="text-sm font-medium px-3 py-2 border rounded-md bg-muted" data-testid="text-sector-auto">
                      {availableSectors[0].name}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="requesterSectorId">Setor Solicitante</Label>
                    <Select value={requesterSectorId} onValueChange={setRequesterSectorId}>
                      <SelectTrigger data-testid="select-sector">
                        <SelectValue placeholder="Selecione o setor" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSectors.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Prioridade — cards visuais */}
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {PRIORITY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPriority(opt.value)}
                        data-testid={`priority-${opt.value.toLowerCase()}`}
                        className={cn(
                          "rounded-lg border-2 py-2.5 text-sm font-medium transition-all",
                          priority === opt.value
                            ? opt.color.replace("hover:", "") + " border-opacity-100"
                            : "border-border text-muted-foreground hover:border-muted-foreground/50"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Título */}
                <div className="space-y-2">
                  <Label htmlFor="title">Título</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Descreva brevemente o problema"
                    data-testid="input-title"
                  />
                </div>

                {/* Descrição */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="description">Descrição</Label>
                    {categoryTemplate && description.trim() && (
                      <Button type="button" variant="ghost" size="sm" onClick={handleInsertTemplate} data-testid="button-insert-template">
                        <FileText className="h-3 w-3 mr-1" />
                        Inserir template
                      </Button>
                    )}
                  </div>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Detalhe o problema ou solicitação..."
                    rows={6}
                    data-testid="input-description"
                  />
                </div>

                {/* Mobile navigation */}
                <div className="flex justify-end gap-3 lg:hidden">
                  <Button type="button" variant="outline" onClick={() => setStep(1)}>Voltar</Button>
                  <Button type="button" onClick={() => setStep(3)} disabled={!canProceedStep2} data-testid="button-next-step-2">
                    Próximo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* RIGHT — Resumo + botão próximo */}
              <div className="hidden lg:block">
                <div className="sticky top-6 space-y-4">
                  <div className="rounded-xl border bg-card overflow-hidden">
                    <div className="px-4 py-3 border-b bg-muted/30">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resumo</p>
                    </div>
                    <div className="p-4 space-y-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Categoria</p>
                        <p className="font-medium leading-tight">
                          {leafCategories.find((c) => c.id === categoryId)?.displayPath ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Prioridade</p>
                        <p className={cn("font-medium", PRIORITY_OPTIONS.find(p => p.value === priority)?.color.split(" ")[1] ?? "")}>
                          {PRIORITY_OPTIONS.find(p => p.value === priority)?.label ?? "—"}
                        </p>
                      </div>
                      {effectiveSectorId && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Setor</p>
                          <p className="font-medium">{availableSectors.find(s => s.id === effectiveSectorId)?.name ?? "—"}</p>
                        </div>
                      )}
                      {title && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Título</p>
                          <p className="font-medium line-clamp-2 leading-tight">{title}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Button
                      type="button"
                      className="w-full"
                      onClick={() => setStep(3)}
                      disabled={!canProceedStep2}
                      data-testid="button-next-step-2-desktop"
                    >
                      Próximo
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" className="w-full" onClick={() => setStep(1)}>
                      ← Alterar categoria
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── PASSO 3: Formulário + Anexos ───────────────────────────────── */}
          {step === 3 && (
            <form onSubmit={handleSubmit}>
              <div className="grid gap-6 lg:grid-cols-[1fr_280px] items-start">

                {/* LEFT — Campos dinâmicos + anexos */}
                <div className="space-y-5">

                  {/* Campos dinâmicos */}
                  {selectedFormSchema.length > 0 ? (
                    <div className="rounded-xl border overflow-hidden">
                      <div className="px-4 py-3 border-b bg-primary/5">
                        <p className="text-sm font-semibold text-primary">Dados específicos do serviço</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Campos obrigatórios para este tipo de chamado</p>
                      </div>
                      <div className="p-4 space-y-4">
                        {selectedFormSchema.map((field) => (
                          <div key={field.key} className="space-y-1.5">
                            <Label className="text-sm">
                              {field.label}
                              {field.required && <span className="text-destructive ml-1">*</span>}
                            </Label>
                            {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                            {field.type === "textarea" ? (
                              <Textarea
                                value={requestData[field.key] || ""}
                                onChange={(e) => setRequestData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                placeholder={field.placeholder}
                                rows={3}
                                data-testid={`field-${field.key}`}
                              />
                            ) : field.type === "select" && field.options ? (
                              <Select
                                value={requestData[field.key] || ""}
                                onValueChange={(v) => setRequestData((prev) => ({ ...prev, [field.key]: v }))}
                              >
                                <SelectTrigger data-testid={`field-${field.key}`}>
                                  <SelectValue placeholder={field.placeholder || "Selecione..."} />
                                </SelectTrigger>
                                <SelectContent>
                                  {field.options.map((opt) => (
                                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                type={field.type === "email" ? "email" : field.type === "number" ? "number" : "text"}
                                value={requestData[field.key] || ""}
                                onChange={(e) => setRequestData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                placeholder={field.placeholder}
                                min={field.rules?.min}
                                max={field.rules?.max}
                                minLength={field.rules?.minLen}
                                maxLength={field.rules?.maxLen}
                                data-testid={`field-${field.key}`}
                              />
                            )}
                            {field.rules && (
                              <div className="text-[10px] text-muted-foreground flex gap-2 flex-wrap">
                                {field.rules.minLen && <span>Mín. {field.rules.minLen} chars</span>}
                                {field.rules.maxLen && <span>Máx. {field.rules.maxLen} chars</span>}
                                {field.rules.min !== undefined && <span>Mín. {field.rules.min}</span>}
                                {field.rules.max !== undefined && <span>Máx. {field.rules.max}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : selectedRequiredAttachments.length === 0 && (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center gap-2">
                      <CheckCircle2 className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm font-medium text-muted-foreground">Nenhum campo adicional para esta categoria</p>
                      <p className="text-xs text-muted-foreground">Você pode anexar arquivos opcionais abaixo ou criar o chamado diretamente.</p>
                    </div>
                  )}

                  {/* Anexos necessários — slots interativos por configuração da categoria */}
                  {selectedRequiredAttachments.length > 0 && (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200 dark:border-amber-800">
                        <Paperclip className="h-4 w-4 text-amber-600 shrink-0" />
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Anexos necessários</p>
                      </div>
                      <div className="p-4 space-y-3">
                        {selectedRequiredAttachments.map((att) => {
                          const chosen = attachmentFiles[att.key];
                          return (
                            <div key={att.key} className="space-y-1.5" data-testid={`required-att-${att.key}`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={att.required ? "destructive" : "outline"} className="text-[10px] shrink-0">
                                  {att.required ? "obrigatório" : "opcional"}
                                </Badge>
                                <span className="text-sm font-medium">{att.label}</span>
                                {att.mime && att.mime.length > 0 && (
                                  <span className="text-[11px] text-muted-foreground">({att.mime.join(", ")})</span>
                                )}
                              </div>
                              {chosen ? (
                                <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                  <span className="flex-1 truncate">{chosen.name}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">{formatBytes(chosen.size)}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeAttachmentFile(att.key)}
                                    className="text-muted-foreground hover:text-destructive shrink-0"
                                    aria-label={`Remover ${att.label}`}
                                    data-testid={`remove-required-att-${att.key}`}
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <label
                                  className="flex w-full items-center gap-2 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-700 bg-card/60 px-3 py-2.5 text-sm cursor-pointer transition-colors hover:border-amber-400 hover:bg-card"
                                  data-testid={`pick-required-att-${att.key}`}
                                >
                                  <Paperclip className="h-4 w-4 text-amber-600 shrink-0" />
                                  <span className="text-muted-foreground">Selecionar arquivo…</span>
                                  <input
                                    type="file"
                                    accept={acceptFor(att.mime)}
                                    className="hidden"
                                    onChange={(e) => {
                                      handleAttachmentFile(att, e.target.files?.[0] ?? null);
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          );
                        })}
                        {missingRequiredAttachments.length > 0 && (
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            Anexe os arquivos obrigatórios acima para poder abrir o chamado.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Anexos extras (opcional) */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Paperclip className="h-3.5 w-3.5" />
                      {selectedRequiredAttachments.length > 0 ? "Outros anexos" : "Anexos"} <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                    </Label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={ALLOWED_EXTS.join(",")}
                      onChange={(e) => handleAddFiles(e.target.files)}
                      className="hidden"
                      data-testid="input-attachments"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border py-6 text-center transition-colors hover:border-primary/40 hover:bg-muted/40"
                      data-testid="button-pick-attachments"
                    >
                      <Paperclip className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm font-medium">Clique para anexar arquivos</span>
                      <span className="text-xs text-muted-foreground">JPEG, PNG, PDF, MP4, ZIP, RAR, 7Z, DOCX, XLSX · até {MAX_FILE_MB} MB cada</span>
                    </button>

                    {files.length > 0 && (
                      <div className="space-y-1.5">
                        {files.map((file, idx) => (
                          <div
                            key={`${file.name}:${file.size}:${idx}`}
                            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
                            data-testid={`attachment-item-${idx}`}
                          >
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="flex-1 truncate">{file.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{formatBytes(file.size)}</span>
                            <button
                              type="button"
                              onClick={() => removeFile(idx)}
                              className="text-muted-foreground hover:text-destructive shrink-0"
                              aria-label={`Remover ${file.name}`}
                              data-testid={`remove-attachment-${idx}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT — Painel de resumo sticky */}
                <div className="hidden lg:block">
                  <div className="sticky top-6 space-y-4">
                    <div className="rounded-xl border bg-card overflow-hidden">
                      <div className="px-4 py-3 border-b bg-muted/30">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resumo</p>
                      </div>
                      <div className="p-4 space-y-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Categoria</p>
                          <p className="font-medium leading-tight">
                            {leafCategories.find((c) => c.id === categoryId)?.displayPath ?? "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Prioridade</p>
                          <p className={cn("font-medium", PRIORITY_OPTIONS.find(p => p.value === priority)?.color.split(" ")[1] ?? "")}>
                            {PRIORITY_OPTIONS.find(p => p.value === priority)?.label ?? "—"}
                          </p>
                        </div>
                        {effectiveSectorId && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Setor</p>
                            <p className="font-medium">{availableSectors.find(s => s.id === effectiveSectorId)?.name ?? "—"}</p>
                          </div>
                        )}
                        {title && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Título</p>
                            <p className="font-medium line-clamp-2 leading-tight">{title}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 px-3 py-2.5 text-xs">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-amber-800 dark:text-amber-200 leading-relaxed">
                        Informações incompletas podem impactar o SLA do chamado.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={createMutation.isPending || !canSubmit}
                        data-testid="button-submit-ticket"
                      >
                        {createMutation.isPending ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{files.length > 0 ? "Enviando..." : "Criando..."}</>
                        ) : (
                          "Criar Chamado"
                        )}
                      </Button>
                      <Button type="button" variant="outline" className="w-full" onClick={() => setStep(2)}>
                        ← Alterar detalhes
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile submit */}
              <div className="flex justify-end gap-3 mt-6 lg:hidden">
                <Button type="button" variant="outline" onClick={() => setStep(2)}>Voltar</Button>
                <Button type="submit" disabled={createMutation.isPending || !canSubmit} data-testid="button-submit-ticket-mobile">
                  {createMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{files.length > 0 ? "Enviando..." : "Criando..."}</> : "Criar Chamado"}
                </Button>
              </div>
            </form>
          )}
        </>
      )}

      {/* Template replace dialog */}
      <AlertDialog open={showTemplateConfirm} onOpenChange={setShowTemplateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir descrição?</AlertDialogTitle>
            <AlertDialogDescription>
              A descrição atual será substituída pelo template da categoria.
              Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDescription(pendingTemplate.current);
                setShowTemplateConfirm(false);
              }}
            >
              Substituir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
