import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { ArrowLeft, Plus, Pencil, Trash2, Eye, ThumbsUp, ThumbsDown, Loader2, BookOpen, Search } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { KbArticle, TicketCategory } from "@shared/schema";

type KbArticleWithMeta = KbArticle & {
  categoryName?: string;
  authorName?: string;
  viewCount?: number;
  helpfulCount?: number;
  notHelpfulCount?: number;
};

export default function AdminKb() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KbArticleWithMeta | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formCategoryId, setFormCategoryId] = useState<string>("");
  const [formPublished, setFormPublished] = useState(true);

  const { data: articles = [], isLoading } = useQuery<KbArticleWithMeta[]>({
    queryKey: ["/api/admin/kb", filterCategory, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterCategory && filterCategory !== "all") params.set("categoryId", filterCategory);
      if (searchQuery) params.set("q", searchQuery);
      const res = await fetch(`/api/admin/kb?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: categories = [] } = useQuery<TicketCategory[]>({
    queryKey: ["/api/admin/tickets/categories"],
  });

  const leafCategories = categories.filter(c => c.parentId !== null);

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; body: string; categoryId?: string | null; isPublished: boolean }) => {
      const res = await apiRequest("POST", "/api/admin/kb", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Artigo criado com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/kb"] });
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar artigo", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/kb/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Artigo atualizado com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/kb"] });
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: "Erro ao atualizar artigo", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/kb/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Artigo excluído" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/kb"] });
      setDeleteId(null);
    },
    onError: (err: any) => {
      toast({ title: "Erro ao excluir artigo", description: err.message, variant: "destructive" });
    },
  });

  function openCreate() {
    setEditingArticle(null);
    setFormTitle("");
    setFormBody("");
    setFormCategoryId("");
    setFormPublished(true);
    setDialogOpen(true);
  }

  function openEdit(article: KbArticleWithMeta) {
    setEditingArticle(article);
    setFormTitle(article.title);
    setFormBody(article.body);
    setFormCategoryId(article.categoryId || "");
    setFormPublished(article.isPublished);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingArticle(null);
  }

  function handleSubmit() {
    const data = {
      title: formTitle,
      body: formBody,
      categoryId: formCategoryId || null,
      isPublished: formPublished,
    };
    if (editingArticle) {
      updateMutation.mutate({ id: editingArticle.id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-1/10">
          <BookOpen className="h-5 w-5 text-chart-1" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground" data-testid="text-kb-title">Base de Conhecimento</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie artigos da base de conhecimento
          </p>
        </div>
        <Button onClick={openCreate} data-testid="button-create-article">
          <Plus className="h-4 w-4 mr-2" />
          Novo Artigo
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar artigos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-kb"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[220px]" data-testid="select-filter-category">
            <SelectValue placeholder="Filtrar por categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {leafCategories.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : articles.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="Nenhum artigo encontrado"
              description={searchQuery || filterCategory !== "all" ? "Tente outros filtros." : "Crie artigos para a base de conhecimento."}
              action={!searchQuery && filterCategory === "all" ? <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Novo Artigo</Button> : undefined}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">
                    <Eye className="h-4 w-4 inline" />
                  </TableHead>
                  <TableHead className="text-center">
                    <ThumbsUp className="h-4 w-4 inline" />
                  </TableHead>
                  <TableHead className="text-center">
                    <ThumbsDown className="h-4 w-4 inline" />
                  </TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {articles.map(article => (
                  <TableRow key={article.id} data-testid={`row-article-${article.id}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{article.title}</p>
                        <p className="text-xs text-muted-foreground">por {article.authorName || "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {article.categoryName ? (
                        <Badge variant="secondary" className="text-xs">{article.categoryName}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={article.isPublished ? "default" : "outline"}>
                        {article.isPublished ? "Publicado" : "Rascunho"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm">{article.viewCount || 0}</TableCell>
                    <TableCell className="text-center text-sm">{article.helpfulCount || 0}</TableCell>
                    <TableCell className="text-center text-sm">{article.notHelpfulCount || 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(article)}
                          data-testid={`button-edit-article-${article.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(article.id)}
                          data-testid={`button-delete-article-${article.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent className="flex flex-col sm:max-w-xl p-0" data-testid="sheet-article-form">
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-1/10 text-chart-1 shrink-0">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle>{editingArticle ? "Editar Artigo" : "Novo Artigo"}</SheetTitle>
                <SheetDescription>
                  {editingArticle ? "Altere o artigo da base de conhecimento" : "Adicione um artigo à base de conhecimento"}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Identidade */}
              <div className="space-y-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identidade</Label>
                <div className="space-y-2">
                  <Label htmlFor="kb-title">Título</Label>
                  <Input
                    id="kb-title"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Título do artigo"
                    data-testid="input-article-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kb-category">Categoria</Label>
                  <Select value={formCategoryId || "none"} onValueChange={(v) => setFormCategoryId(v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="select-article-category">
                      <SelectValue placeholder="Selecione a categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {leafCategories.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Conteúdo */}
              <div className="space-y-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conteúdo</Label>
                <div className="space-y-2">
                  <Label htmlFor="kb-body">Texto do artigo</Label>
                  <Textarea
                    id="kb-body"
                    value={formBody}
                    onChange={(e) => setFormBody(e.target.value)}
                    placeholder="Conteúdo do artigo..."
                    rows={12}
                    data-testid="input-article-body"
                  />
                </div>
              </div>

              <Separator />

              {/* Publicação */}
              <div className="space-y-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Publicação</Label>
                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Artigo publicado</p>
                    <p className="text-xs text-muted-foreground">Visível na base de conhecimento dos usuários</p>
                  </div>
                  <Switch
                    checked={formPublished}
                    onCheckedChange={setFormPublished}
                    data-testid="switch-article-published"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
              <Button
                onClick={handleSubmit}
                disabled={isPending || !formTitle.trim() || !formBody.trim()}
                data-testid="button-save-article"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingArticle ? "Salvar alterações" : "Criar artigo"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir artigo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O artigo será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              data-testid="button-confirm-delete"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
