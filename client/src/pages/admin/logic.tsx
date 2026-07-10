import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Brain,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  Loader2,
  X,
  ImagePlus,
  Image as ImageIcon,
} from "lucide-react";
import type { LogicQuestion } from "@shared/schema";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

export default function AdminLogic() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LogicQuestion | null>(null);
  const [formQuestion, setFormQuestion] = useState("");
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [formOptions, setFormOptions] = useState<string[]>(["", ""]);
  const [formCorrectIndex, setFormCorrectIndex] = useState(0);
  const [formDifficulty, setFormDifficulty] = useState("1");
  const [formLanguage, setFormLanguage] = useState("pt");
  const [formActive, setFormActive] = useState(true);

  const { data: questions = [], isLoading } = useQuery<LogicQuestion[]>({
    queryKey: ["/api/admin/logic/questions"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { question: string; imageUrl: string | null; options: string[]; correctIndex: number; difficulty: number; language: string; isActive: boolean }) => {
      const res = await apiRequest("POST", "/api/admin/logic/questions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/logic/questions"] });
      closeDialog();
      toast({ title: "Questão criada com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao criar questão", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ question: string; imageUrl: string | null; options: string[]; correctIndex: number; difficulty: number; language: string; isActive: boolean }> }) => {
      const res = await apiRequest("PATCH", `/api/admin/logic/questions/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/logic/questions"] });
      closeDialog();
      toast({ title: "Questão atualizada" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar questão", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/logic/questions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/logic/questions"] });
      toast({ title: "Questão removida" });
    },
    onError: () => {
      toast({ title: "Erro ao remover questão", variant: "destructive" });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setFormQuestion("");
    setFormImageUrl(null);
    setFormOptions(["", ""]);
    setFormCorrectIndex(0);
    setFormDifficulty("1");
    setFormLanguage("pt");
    setFormActive(true);
    setDialogOpen(true);
  };

  const openEdit = (q: LogicQuestion) => {
    setEditing(q);
    setFormQuestion(q.question);
    setFormImageUrl(q.imageUrl ?? null);
    setFormOptions([...q.options]);
    setFormCorrectIndex(q.correctIndex);
    setFormDifficulty(String(q.difficulty));
    setFormLanguage(q.language);
    setFormActive(q.isActive);
    setDialogOpen(true);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast({ title: "Formato inválido", description: "Use apenas imagens JPEG ou PNG.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "A imagem deve ter no máximo 2MB.", variant: "destructive" });
      return;
    }

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/admin/logic/questions/upload-image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const body = await res.json();
      setFormImageUrl(body.imageUrl);
    } catch {
      toast({ title: "Erro", description: "Não foi possível enviar a imagem.", variant: "destructive" });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };

  const updateOption = (index: number, value: string) => {
    setFormOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addOption = () => {
    if (formOptions.length >= MAX_OPTIONS) return;
    setFormOptions((prev) => [...prev, ""]);
  };

  const removeOption = (index: number) => {
    if (formOptions.length <= MIN_OPTIONS) return;
    setFormOptions((prev) => prev.filter((_, i) => i !== index));
    setFormCorrectIndex((prev) => (prev === index ? 0 : prev > index ? prev - 1 : prev));
  };

  const handleSave = () => {
    if (formQuestion.trim().length < 5) {
      toast({ title: "Pergunta deve ter no mínimo 5 caracteres", variant: "destructive" });
      return;
    }
    const trimmedOptions = formOptions.map((o) => o.trim());
    if (trimmedOptions.some((o) => o.length === 0)) {
      toast({ title: "Todas as opções devem ser preenchidas", variant: "destructive" });
      return;
    }
    if (formCorrectIndex < 0 || formCorrectIndex >= trimmedOptions.length) {
      toast({ title: "Selecione qual opção é a resposta correta", variant: "destructive" });
      return;
    }
    const data = {
      question: formQuestion.trim(),
      imageUrl: formImageUrl,
      options: trimmedOptions,
      correctIndex: formCorrectIndex,
      difficulty: parseInt(formDifficulty),
      language: formLanguage,
      isActive: formActive,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin")} data-testid="button-back-admin">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-admin-logic-title">Questões de Lógica</h1>
            <p className="text-sm text-muted-foreground">Gerenciar questões para o teste de lógica</p>
          </div>
        </div>
        <Button onClick={openCreate} data-testid="button-create-question">
          <Plus className="h-4 w-4 mr-2" />
          Nova Questão
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : questions.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={Brain}
            title="Nenhuma questão cadastrada"
            description="Adicione questões para o teste de lógica."
            action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Nova Questão</Button>}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <Card key={q.id} data-testid={`logic-question-${q.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium line-clamp-2">{q.question}</p>
                      {q.imageUrl && <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {q.options.map((opt, i) => (
                        <span
                          key={i}
                          className={`text-xs px-2 py-0.5 rounded-full border ${
                            i === q.correctIndex
                              ? "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {String.fromCharCode(65 + i)}. {opt}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={q.isActive ? "default" : "secondary"}>
                        {q.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                      <Badge variant="outline">Dificuldade: {q.difficulty}</Badge>
                      <Badge variant="outline">{q.language.toUpperCase()}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(q)} data-testid={`button-edit-question-${q.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(q.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-question-${q.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent className="flex flex-col sm:max-w-lg p-0" data-testid="sheet-question-form">
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <Brain className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle>{editing ? "Editar Questão" : "Nova Questão"}</SheetTitle>
                <SheetDescription>
                  {editing ? "Altere a questão do teste de lógica" : "Adicione uma questão para o teste de lógica"}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Pergunta */}
              <div className="space-y-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pergunta</Label>
                <div className="space-y-2">
                  <Label htmlFor="question-content">Enunciado</Label>
                  <Textarea
                    id="question-content"
                    value={formQuestion}
                    onChange={(e) => setFormQuestion(e.target.value)}
                    rows={3}
                    placeholder="Digite a pergunta da questão de lógica..."
                    data-testid="input-question-content"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Imagem (opcional)</Label>
                  {formImageUrl ? (
                    <div className="relative rounded-lg border bg-muted/30 overflow-hidden">
                      <img src={formImageUrl} alt="Preview" className="max-h-48 w-full object-contain" data-testid="preview-question-image" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-7 w-7"
                        onClick={() => setFormImageUrl(null)}
                        data-testid="button-remove-image"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <label
                      htmlFor="question-image-input"
                      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-6 text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors"
                    >
                      {isUploadingImage ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-5 w-5" />
                      )}
                      <span className="text-xs">
                        {isUploadingImage ? "Enviando..." : "Clique para adicionar uma imagem (JPEG/PNG, até 2MB)"}
                      </span>
                    </label>
                  )}
                  <input
                    id="question-image-input"
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={handleImageChange}
                    disabled={isUploadingImage}
                    data-testid="input-question-image"
                  />
                </div>
              </div>

              <Separator />

              {/* Opções */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Opções de resposta
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={addOption}
                    disabled={formOptions.length >= MAX_OPTIONS}
                    data-testid="button-add-option"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Adicionar
                  </Button>
                </div>
                <div className="space-y-2">
                  {formOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setFormCorrectIndex(i)}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                          formCorrectIndex === i
                            ? "bg-green-500 text-white border-green-500"
                            : "border-muted-foreground/40 text-muted-foreground hover:border-primary"
                        }`}
                        title="Marcar como resposta correta"
                        data-testid={`button-mark-correct-${i}`}
                      >
                        {String.fromCharCode(65 + i)}
                      </button>
                      <Input
                        value={opt}
                        onChange={(e) => updateOption(i, e.target.value)}
                        placeholder={`Opção ${String.fromCharCode(65 + i)}`}
                        data-testid={`input-option-${i}`}
                      />
                      {formOptions.length > MIN_OPTIONS && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeOption(i)}
                          data-testid={`button-remove-option-${i}`}
                        >
                          <X className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Clique na letra para marcar a resposta correta (destacada em verde).
                </p>
              </div>

              <Separator />

              {/* Classificação */}
              <div className="space-y-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Classificação</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Dificuldade</Label>
                    <Select value={formDifficulty} onValueChange={setFormDifficulty}>
                      <SelectTrigger data-testid="select-difficulty">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 - Fácil</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3 - Médio</SelectItem>
                        <SelectItem value="4">4</SelectItem>
                        <SelectItem value="5">5 - Difícil</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Idioma</Label>
                    <Select value={formLanguage} onValueChange={setFormLanguage}>
                      <SelectTrigger data-testid="select-language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pt">Português</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Questão ativa</p>
                    <p className="text-xs text-muted-foreground">Disponível para os testes de lógica</p>
                  </div>
                  <Switch
                    checked={formActive}
                    onCheckedChange={setFormActive}
                    data-testid="switch-question-active"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-question">
                {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editing ? "Salvar alterações" : "Criar questão"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
