import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Mail,
  Building2,
  Phone,
  Save,
  Upload,
  Trash2,
  Users,
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
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import type { TeamMember, ResourceWithHealth, Sector, TypingScore } from "@shared/schema";
import { useLocation } from "wouter";

function cleanPhoneNumber(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp || "");
  const [isEditingWhatsapp, setIsEditingWhatsapp] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isRemovingPhoto, setIsRemovingPhoto] = useState(false);

  const [showAllSectors, setShowAllSectors] = useState(false);
  const [selectedSectorId, setSelectedSectorId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (user?.whatsapp !== undefined) {
      setWhatsapp(user.whatsapp || "");
    }
  }, [user?.whatsapp]);

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

  const updateWhatsappMutation = useMutation({
    mutationFn: async (whatsappValue: string) => {
      return apiRequest("PATCH", "/api/users/me", { whatsapp: whatsappValue || null });
    },
    onSuccess: async () => {
      await refreshUser();
      setIsEditingWhatsapp(false);
      queryClient.invalidateQueries({ queryKey: ["/api/users/directory"] });
      toast({
        title: "WhatsApp atualizado",
        description: "Seu número foi salvo com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível salvar o WhatsApp.",
        variant: "destructive",
      });
    },
  });

  const clearWhatsappMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", "/api/users/me", { whatsapp: null });
    },
    onSuccess: async () => {
      await refreshUser();
      setWhatsapp("");
      setIsEditingWhatsapp(true);
      queryClient.invalidateQueries({ queryKey: ["/api/users/directory"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível limpar o WhatsApp.",
        variant: "destructive",
      });
    },
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
      toast({
        title: "Foto atualizada",
        description: "Sua foto de perfil foi salva.",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível enviar a foto.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  if (!user) {
    return null;
  }

  const userSectorIds = user.roles?.map(r => r.sectorId) || [];

  return (
    <div className="max-w-4xl w-full mx-auto py-8 px-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Meu Perfil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <div className="flex flex-col items-center gap-2">
              <Avatar className="h-24 w-24">
                {user.photoUrl && <AvatarImage src={user.photoUrl} alt={user.name} />}
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
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
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
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
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Remover foto
                </Button>
              )}
            </div>

            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-2xl font-bold">{user.name}</h2>
                <p className="text-muted-foreground flex items-center gap-1 mt-1">
                  <Mail className="h-4 w-4" />
                  {user.email}
                </p>
              </div>

              {user.roles && user.roles.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Setores e Papéis
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {user.roles.map((role, index) => (
                      <Badge key={index} variant="secondary">
                        {role.sectorName} - {role.roleName}
                      </Badge>
                    ))}
                    {user.isAdmin && (
                      <Badge variant="default" className="bg-primary">
                        Administrador
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t">
                <Label className="flex items-center gap-2 mb-2">
                  <Phone className="h-4 w-4" />
                  WhatsApp (opcional)
                </Label>
                {user.whatsapp && !isEditingWhatsapp ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <SiWhatsapp className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium" data-testid="text-whatsapp-value">{user.whatsapp}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => clearWhatsappMutation.mutate()}
                      disabled={clearWhatsappMutation.isPending}
                      data-testid="button-change-whatsapp"
                    >
                      {clearWhatsappMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Phone className="h-4 w-4 mr-2" />
                      )}
                      Alterar WhatsApp
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        id="whatsapp"
                        type="tel"
                        placeholder="(41) 99999-9999"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        className="max-w-xs"
                        data-testid="input-whatsapp"
                      />
                      <Button
                        onClick={() => updateWhatsappMutation.mutate(whatsapp)}
                        disabled={updateWhatsappMutation.isPending || !whatsapp.trim()}
                        data-testid="button-save-whatsapp"
                      >
                        {updateWhatsappMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        <span className="ml-2 hidden sm:inline">Salvar</span>
                      </Button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Usado para o botão "Chamar no WhatsApp" visível para colegas no Diretório.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookUser className="h-5 w-5" />
            Diretório
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, email ou whatsapp..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-directory-search"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
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

          {isLoadingDirectory ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : directory.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {searchQuery ? "Nenhum colaborador encontrado com essa busca." : "Nenhum colaborador encontrado."}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {directory.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                  data-testid={`directory-member-${member.id}`}
                >
                  <Avatar className="h-10 w-10">
                    {member.photoUrl && <AvatarImage src={member.photoUrl} alt={member.name} />}
                    <AvatarFallback className="bg-muted text-muted-foreground text-sm">
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{member.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    {member.roles && member.roles.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {member.roles.slice(0, 2).map((role, i) => (
                          <Badge key={i} variant="outline" className="text-xs py-0">
                            {role.sectorName}
                          </Badge>
                        ))}
                        {member.roles.length > 2 && (
                          <Badge variant="outline" className="text-xs py-0">
                            +{member.roles.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  {member.whatsapp && (
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                    >
                      <a
                        href={`https://wa.me/${cleanPhoneNumber(member.whatsapp)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`button-whatsapp-${member.id}`}
                      >
                        <SiWhatsapp className="h-5 w-5" />
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Teste de Digitação
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingTyping ? (
            <Skeleton className="h-16 w-full" />
          ) : typingBest ? (
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Trophy className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Melhor resultado</p>
                  <p className="font-bold text-lg" data-testid="text-typing-best-wpm">{typingBest.wpm} PPM</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Precisão</p>
                  <p className="font-medium" data-testid="text-typing-best-accuracy">{Number(typingBest.accuracy).toFixed(0)}%</p>
                </div>
              </div>
              <Badge variant="secondary" data-testid="badge-typing-level">
                <Zap className="h-3 w-3 mr-1" />
                {typingBest.wpm >= 80 ? "Avançado" : typingBest.wpm >= 50 ? "Intermediário" : "Iniciante"}
              </Badge>
              {(typingBest as any).difficulty && (
                <Badge variant="outline" data-testid="badge-typing-difficulty">
                  {(typingBest as any).difficulty === 1 ? "Fácil" : (typingBest as any).difficulty === 2 ? "Média" : "Difícil"}
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={() => setLocation("/typing")} data-testid="button-go-typing">
                <Keyboard className="h-4 w-4 mr-2" />
                Fazer Teste
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">Você ainda não fez nenhum teste de digitação.</p>
              <Button variant="outline" size="sm" onClick={() => setLocation("/typing")} data-testid="button-go-typing-first">
                <Keyboard className="h-4 w-4 mr-2" />
                Fazer Teste
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Minha Atividade
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Star className="h-4 w-4" />
              Favoritos
            </h3>
            {isLoadingFavorites ? (
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-24" />
                ))}
              </div>
            ) : favorites.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum favorito ainda.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {favorites.slice(0, 6).map((resource) => (
                  <Button
                    key={resource.id}
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation(`/resource/${resource.id}`)}
                    className="gap-2"
                    data-testid={`button-favorite-${resource.id}`}
                  >
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    {resource.name}
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Acessados Recentemente
            </h3>
            {isLoadingRecent ? (
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-24" />
                ))}
              </div>
            ) : recentAccess.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum acesso recente.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {recentAccess.slice(0, 6).map((resource) => (
                  <Button
                    key={resource.id}
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation(`/resource/${resource.id}`)}
                    className="gap-2"
                    data-testid={`button-recent-${resource.id}`}
                  >
                    {resource.name}
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
