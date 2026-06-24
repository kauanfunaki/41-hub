import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Mail,
  Building2,
  Upload,
  Trash2,
  Clock,
  Star,
  ExternalLink,
  Loader2,
  Search,
  BookUser,
  Keyboard,
  Zap,
  Target,
  Trophy,
  ShieldCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { TeamMember, ResourceWithHealth, Sector, TypingScore } from "@shared/schema";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function SectionDivider({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isRemovingPhoto, setIsRemovingPhoto] = useState(false);
  const [photoLoadError, setPhotoLoadError] = useState(false);

  const [showAllSectors, setShowAllSectors] = useState(false);
  const [selectedSectorId, setSelectedSectorId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: sectors = [] } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"],
    enabled: !!user,
  });

  const directoryParams = new URLSearchParams();
  if (showAllSectors) {
    directoryParams.set("all", "true");
  } else if (selectedSectorId && selectedSectorId !== "all") {
    directoryParams.set("sectorId", selectedSectorId);
  }
  if (searchQuery.trim()) {
    directoryParams.set("q", searchQuery.trim());
  }

  const { data: directory = [], isLoading: isLoadingDirectory } = useQuery<TeamMember[]>({
    queryKey: ["/api/users/directory", directoryParams.toString()],
    queryFn: async () => {
      const response = await fetch(`/api/users/directory?${directoryParams.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch directory");
      return response.json();
    },
    enabled: !!user,
  });

  const { data: favorites = [], isLoading: isLoadingFavorites } = useQuery<ResourceWithHealth[]>({
    queryKey: ["/api/favorites"],
    enabled: !!user,
  });

  const { data: recentAccess = [], isLoading: isLoadingRecent } = useQuery<ResourceWithHealth[]>({
    queryKey: ["/api/resources/recent"],
    enabled: !!user,
  });

  const { data: typingBest, isLoading: isLoadingTyping } = useQuery<TypingScore | null>({
    queryKey: ["/api/typing/me"],
    enabled: !!user,
  });

  const handleRemovePhoto = async () => {
    setIsRemovingPhoto(true);
    try {
      const response = await fetch("/api/users/me/photo", {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Remove failed");
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["/api/users/directory"] });
      setPhotoLoadError(false);
      toast({ title: "Foto removida", description: "Voltando ao avatar padrão." });
    } catch {
      toast({ title: "Erro", description: "Não foi possível remover a foto.", variant: "destructive" });
    } finally {
      setIsRemovingPhoto(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Arquivo inválido",
        description: "Por favor, selecione uma imagem (JPG ou PNG).",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "A imagem deve ter no máximo 2MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);

      const response = await fetch("/api/users/me/photo", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) throw new Error("Upload failed");

      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["/api/users/directory"] });
      toast({ title: "Foto atualizada", description: "Sua foto de perfil foi salva." });
    } catch {
      toast({ title: "Erro", description: "Não foi possível enviar a foto.", variant: "destructive" });
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl w-full mx-auto py-8 px-4 space-y-8">
      {/* ── Perfil header ────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="h-[3px] bg-primary" />
        <div className="p-6 flex flex-col sm:flex-row items-start gap-6">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div className="relative">
              <Avatar className="h-20 w-20 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
                {user.photoUrl && !photoLoadError && (
                  <AvatarImage
                    src={user.photoUrl}
                    alt={user.name}
                    onError={() => setPhotoLoadError(true)}
                  />
                )}
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={handlePhotoUpload}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingPhoto || isRemovingPhoto}
              data-testid="button-upload-photo"
            >
              {isUploadingPhoto ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1.5" />
              )}
              Alterar foto
            </Button>
            {user.photoUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemovePhoto}
                disabled={isRemovingPhoto || isUploadingPhoto}
                className="text-muted-foreground hover:text-destructive"
                data-testid="button-remove-photo"
              >
                {isRemovingPhoto ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Remover foto
              </Button>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold leading-tight">{user.name}</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {user.email}
            </p>

            {(user.roles && user.roles.length > 0) || user.isAdmin ? (
              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" />
                  Setores e Papéis
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {user.roles?.map((role, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-muted border border-border"
                    >
                      {role.sectorName} — {role.roleName}
                    </span>
                  ))}
                  {user.isAdmin && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary text-primary-foreground">
                      <ShieldCheck className="h-3 w-3" />
                      Administrador
                    </span>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Teste de Digitação ───────────────────────────────────── */}
      <section className="space-y-4">
        <SectionDivider icon={Keyboard} label="Teste de Digitação" />

        <div className="rounded-xl border bg-card p-5">
          {isLoadingTyping ? (
            <Skeleton className="h-16 w-full" />
          ) : typingBest ? (
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10">
                  <Trophy className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Melhor resultado</p>
                  <p className="text-2xl font-black tabular-nums leading-none mt-0.5" data-testid="text-typing-best-wpm">
                    {typingBest.wpm}
                    <span className="text-sm font-semibold text-muted-foreground ml-1">PPM</span>
                  </p>
                </div>
              </div>

              <div className="h-10 w-px bg-border hidden sm:block" />

              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Target className="h-3 w-3" /> Precisão
                </p>
                <p className="text-xl font-bold tabular-nums mt-0.5" data-testid="text-typing-best-accuracy">
                  {Number(typingBest.accuracy).toFixed(0)}%
                </p>
              </div>

              <div className="h-10 w-px bg-border hidden sm:block" />

              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary"
                  data-testid="badge-typing-level"
                >
                  <Zap className="h-3 w-3" />
                  {typingBest.wpm >= 80 ? "Avançado" : typingBest.wpm >= 50 ? "Intermediário" : "Iniciante"}
                </span>
                {(typingBest as any).difficulty && (
                  <span
                    className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-muted border border-border"
                    data-testid="badge-typing-difficulty"
                  >
                    {(typingBest as any).difficulty === 1 ? "Fácil" : (typingBest as any).difficulty === 2 ? "Média" : "Difícil"}
                  </span>
                )}
              </div>

              <Button variant="outline" size="sm" onClick={() => setLocation("/typing")} className="ml-auto" data-testid="button-go-typing">
                <Keyboard className="h-4 w-4 mr-2" />
                Fazer Teste
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground flex-1">Você ainda não fez nenhum teste de digitação.</p>
              <Button variant="outline" size="sm" onClick={() => setLocation("/typing")} data-testid="button-go-typing-first">
                <Keyboard className="h-4 w-4 mr-2" />
                Fazer Teste
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* ── Diretório ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionDivider icon={BookUser} label="Diretório" />

        <div className="rounded-xl border bg-card p-5 space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-directory-search"
              />
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Select
                value={selectedSectorId}
                onValueChange={setSelectedSectorId}
                disabled={showAllSectors}
              >
                <SelectTrigger className="w-[180px]" data-testid="select-directory-sector">
                  <SelectValue placeholder="Filtrar por setor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Meus setores</SelectItem>
                  {sectors.map((sector) => (
                    <SelectItem key={sector.id} value={sector.id}>
                      {sector.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch
                  id="show-all"
                  checked={showAllSectors}
                  onCheckedChange={setShowAllSectors}
                  data-testid="switch-show-all-sectors"
                />
                <Label htmlFor="show-all" className="text-sm whitespace-nowrap">Todos</Label>
              </div>
            </div>
          </div>

          {/* Members grid */}
          {isLoadingDirectory ? (
            <div className="grid sm:grid-cols-2 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : directory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {searchQuery ? "Nenhum colaborador encontrado com essa busca." : "Nenhum colaborador encontrado."}
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {directory.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
                  data-testid={`directory-member-${member.id}`}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    {member.photoUrl && <AvatarImage src={member.photoUrl} alt={member.name} />}
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate leading-tight">{member.name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{member.email}</p>
                    {member.roles && member.roles.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {member.roles.slice(0, 2).map((role, i) => (
                          <span key={i} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
                            {role.sectorName}
                          </span>
                        ))}
                        {member.roles.length > 2 && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
                            +{member.roles.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Minha Atividade ──────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionDivider icon={Clock} label="Minha Atividade" />

        <div className="rounded-xl border bg-card p-5 space-y-5">
          {/* Favoritos */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Star className="h-3 w-3" />
              Favoritos
            </p>
            {isLoadingFavorites ? (
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-24 rounded-full" />)}
              </div>
            ) : favorites.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum favorito ainda.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {favorites.slice(0, 6).map((resource) => (
                  <button
                    key={resource.id}
                    onClick={() => setLocation(`/resource/${resource.id}`)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border bg-card hover:bg-accent transition-colors"
                    data-testid={`button-favorite-${resource.id}`}
                  >
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    {resource.name}
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="h-px bg-border" />

          {/* Recentes */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Acessados Recentemente
            </p>
            {isLoadingRecent ? (
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-24 rounded-full" />)}
              </div>
            ) : recentAccess.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum acesso recente.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {recentAccess.slice(0, 6).map((resource) => (
                  <button
                    key={resource.id}
                    onClick={() => setLocation(`/resource/${resource.id}`)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border bg-card hover:bg-accent transition-colors"
                    data-testid={`button-recent-${resource.id}`}
                  >
                    {resource.name}
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
