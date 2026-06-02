import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Keyboard,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import type { TypingText } from "@shared/schema";

export default function AdminTyping() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TypingText | null>(null);
  const [formContent, setFormContent] = useState("");
  const [formDifficulty, setFormDifficulty] = useState("1");
  const [formLanguage, setFormLanguage] = useState("pt");
  const [formActive, setFormActive] = useState(true);

  const { data: texts = [], isLoading } = useQuery<TypingText[]>({
    queryKey: ["/api/admin/typing/texts"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { content: string; difficulty: number; language: string; isActive: boolean }) => {
      const res = await apiRequest("POST", "/api/admin/typing/texts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/typing/texts"] });
      closeDialog();
      toast({ title: "Texto criado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao criar texto", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ content: string; difficulty: number; language: string; isActive: boolean }> }) => {
      const res = await apiRequest("PATCH", `/api/admin/typing/texts/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/typing/texts"] });
      closeDialog();
      toast({ title: "Texto atualizado" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar texto", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/typing/texts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/typing/texts"] });
      toast({ title: "Texto removido" });
    },
    onError: () => {
      toast({ title: "Erro ao remover texto", variant: "destructive" });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setFormContent("");
    setFormDifficulty("1");
    setFormLanguage("pt");
    setFormActive(true);
    setDialogOpen(true);
  };

  const openEdit = (t: TypingText) => {
    setEditing(t);
    setFormContent(t.content);
    setFormDifficulty(String(t.difficulty));
    setFormLanguage(t.language);
    setFormActive(t.isActive);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };

  const handleSave = () => {
    if (formContent.trim().length < 10) {
      toast({ title: "Texto deve ter no mínimo 10 caracteres", variant: "destructive" });
      return;
    }
    const data = {
      content: formContent.trim(),
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
            <Keyboard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-admin-typing-title">Textos de Digitação</h1>
            <p className="text-sm text-muted-foreground">Gerenciar textos para o teste de digitação</p>
          </div>
        </div>
        <Button onClick={openCreate} data-testid="button-create-text">
          <Plus className="h-4 w-4 mr-2" />
          Novo Texto
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : texts.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={Keyboard}
            title="Nenhum texto cadastrado"
            description="Adicione textos para o teste de digitação."
            action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Novo Texto</Button>}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {texts.map((t) => (
            <Card key={t.id} data-testid={`typing-text-${t.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-sm font-mono line-clamp-2">{t.content}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={t.isActive ? "default" : "secondary"}>
                        {t.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                      <Badge variant="outline">Dificuldade: {t.difficulty}</Badge>
                      <Badge variant="outline">{t.language.toUpperCase()}</Badge>
                      <span className="text-xs text-muted-foreground">{t.content.length} caracteres</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(t)} data-testid={`button-edit-text-${t.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(t.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-text-${t.id}`}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Texto" : "Novo Texto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Texto</Label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={5}
                className="font-mono text-sm"
                data-testid="input-text-content"
              />
              <p className="text-xs text-muted-foreground mt-1">{formContent.length} caracteres</p>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
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
              <div className="flex-1">
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
            <div className="flex items-center gap-2">
              <Switch
                checked={formActive}
                onCheckedChange={setFormActive}
                data-testid="switch-text-active"
              />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-text">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
