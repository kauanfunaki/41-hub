import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Plus, Pencil, Users, Shield, Check, KeyRound, RotateCcw, Building2, X, Save, Eye, EyeOff, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useAuth } from "@/lib/auth-context";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserWithRoles, Sector } from "@shared/schema";

interface AdminSettingsData {
  DEFAULT_LOCAL_PASSWORD?: string;
}

const defaultPasswordRequirements = [
  { label: "Mínimo 10 caracteres", test: (p: string) => p.length >= 10 },
  { label: "Uma letra maiúscula", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Uma letra minúscula", test: (p: string) => /[a-z]/.test(p) },
  { label: "Um número", test: (p: string) => /[0-9]/.test(p) },
  { label: "Um caractere especial (!@#$%^&*)", test: (p: string) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

const passwordRequirements: PasswordRequirement[] = [
  { label: "Mínimo 10 caracteres", test: (p) => p.length >= 10 },
  { label: "Uma letra maiúscula", test: (p) => /[A-Z]/.test(p) },
  { label: "Uma letra minúscula", test: (p) => /[a-z]/.test(p) },
  { label: "Um número", test: (p) => /[0-9]/.test(p) },
  { label: "Um caractere especial (!@#$%^&*)", test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState<"all" | "microsoft" | "local">("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [deactivateUserId, setDeactivateUserId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<UserWithRoles | null>(null);
  const [customPassword, setCustomPassword] = useState("");
  const [editingUser, setEditingUser] = useState<UserWithRoles | null>(null);
  const [formEmail, setFormEmail] = useState("");
  const [formName, setFormName] = useState("");
  const [formSectorIds, setFormSectorIds] = useState<string[]>([]);
  const [formRoleName, setFormRoleName] = useState<"Admin" | "Coordenador" | "Usuario">("Usuario");
  const [formAuthProvider, setFormAuthProvider] = useState<"entra" | "local">("local");
  const [defaultPassword, setDefaultPassword] = useState("");
  const [showDefaultPassword, setShowDefaultPassword] = useState(false);

  const allDefaultRequirementsMet = defaultPasswordRequirements.every((r) => r.test(defaultPassword));

  const { data: users = [], isLoading: usersLoading } = useQuery<UserWithRoles[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: sectors = [] } = useQuery<Sector[]>({
    queryKey: ["/api/admin/sectors"],
  });

  const { data: adminSettings, isLoading: settingsLoading } = useQuery<AdminSettingsData>({
    queryKey: ["/api/admin/settings"],
  });

  useEffect(() => {
    if (adminSettings?.DEFAULT_LOCAL_PASSWORD) {
      setDefaultPassword(adminSettings.DEFAULT_LOCAL_PASSWORD);
    }
  }, [adminSettings]);

  const updateSettingMutation = useMutation({
    mutationFn: async (data: { key: string; value: string }) => {
      return apiRequest("PUT", "/api/admin/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: "Configuração salva com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao salvar configuração", variant: "destructive" });
    },
  });

  const handleSaveDefaultPassword = () => {
    if (!allDefaultRequirementsMet) {
      toast({ title: "Senha não atende aos requisitos", variant: "destructive" });
      return;
    }
    updateSettingMutation.mutate({ key: "DEFAULT_LOCAL_PASSWORD", value: defaultPassword });
  };

  const createMutation = useMutation({
    mutationFn: async (data: { email: string; name: string; sectorIds?: string[]; roleName: string; authProvider?: string }) => {
      return apiRequest("POST", "/api/admin/users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/directory"] });
      toast({ title: "Usuário criado com sucesso" });
      handleCloseDialog();
    },
    onError: () => {
      toast({ title: "Erro ao criar usuário", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; isActive?: boolean; sectorIds?: string[]; roleName?: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/directory"] });
      toast({ title: "Usuário atualizado com sucesso" });
      handleCloseDialog();
    },
    onError: () => {
      toast({ title: "Erro ao atualizar usuário", variant: "destructive" });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/admin/users/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Status atualizado" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("POST", `/api/admin/users/${userId}/reset-password`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Senha redefinida para o padrão" });
    },
    onError: () => {
      toast({ title: "Erro ao redefinir senha", variant: "destructive" });
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      return apiRequest("POST", `/api/admin/users/${userId}/set-password`, { password });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Senha definida com sucesso" });
      setIsPasswordDialogOpen(false);
      setPasswordUser(null);
      setCustomPassword("");
    },
    onError: () => {
      toast({ title: "Erro ao definir senha", variant: "destructive" });
    },
  });

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormEmail("");
    setFormName("");
    setFormSectorIds([]);
    setFormRoleName("Usuario");
    setFormAuthProvider("local");
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (user: UserWithRoles) => {
    setEditingUser(user);
    setFormEmail(user.email);
    setFormName(user.name);
    setFormSectorIds(user.roles?.map(r => r.sectorId) || []);
    setFormRoleName(user.roles?.[0]?.roleName || "Usuario");
    setFormAuthProvider(user.authProvider as "entra" | "local" || "local");
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingUser(null);
    setFormEmail("");
    setFormName("");
    setFormSectorIds([]);
    setFormRoleName("Usuario");
    setFormAuthProvider("local");
  };

  const handleOpenPasswordDialog = (user: UserWithRoles) => {
    setPasswordUser(user);
    setCustomPassword("");
    setIsPasswordDialogOpen(true);
  };

  const handleToggleSector = (sectorId: string) => {
    setFormSectorIds((prev) =>
      prev.includes(sectorId)
        ? prev.filter((id) => id !== sectorId)
        : [...prev, sectorId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmail.trim() || !formName.trim()) return;

    if (editingUser) {
      updateMutation.mutate({ 
        id: editingUser.id, 
        name: formName,
        sectorIds: formSectorIds,
        roleName: formRoleName,
      });
    } else {
      createMutation.mutate({
        email: formEmail,
        name: formName,
        sectorIds: formSectorIds.length > 0 ? formSectorIds : undefined,
        roleName: formRoleName,
        authProvider: formAuthProvider,
      });
    }
  };

  const customPasswordValid = passwordRequirements.every((r) => r.test(customPassword));

  const handleSetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordUser || !customPasswordValid) return;
    setPasswordMutation.mutate({ userId: passwordUser.id, password: customPassword });
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleBadgeVariant = (roleName: string) => {
    switch (roleName) {
      case "Admin":
        return "default";
      case "Coordenador":
        return "secondary";
      default:
        return "outline";
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const isMs = user.authProvider !== "local";
    const matchesProvider =
      providerFilter === "all" ||
      (providerFilter === "microsoft" && isMs) ||
      (providerFilter === "local" && !isMs);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && user.isActive) ||
      (statusFilter === "inactive" && !user.isActive);
    return matchesSearch && matchesProvider && matchesStatus;
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-2/10">
          <Users className="h-5 w-5 text-chart-2" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie usuários e suas permissões
          </p>
        </div>
      </div>

      <Tabs defaultValue="users" data-testid="tabs-users">
        <TabsList>
          <TabsTrigger value="users" data-testid="tab-users">Usuários</TabsTrigger>
          <TabsTrigger value="default-password" data-testid="tab-default-password">Senha padrão</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-base font-medium">
              {filteredUsers.length} usuário{filteredUsers.length !== 1 ? "s" : ""}
              {statusFilter === "active" && <span className="text-xs text-muted-foreground font-normal ml-1">(ativos)</span>}
            </CardTitle>
            <Button onClick={handleOpenCreate} data-testid="button-create-user">
              <Plus className="h-4 w-4 mr-2" />
              Novo Usuário
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Buscar usuários..."
              className="sm:w-56"
            />
            <Select value={providerFilter} onValueChange={(v) => setProviderFilter(v as typeof providerFilter)}>
              <SelectTrigger className="w-[150px]" data-testid="select-provider-filter">
                <SelectValue placeholder="Provedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="microsoft">Microsoft</SelectItem>
                <SelectItem value="local">Local</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <EmptyState
              icon={Users}
              title={searchQuery ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
              description={searchQuery ? "Tente outro termo de busca." : "Clique em Novo Usuário para adicionar."}
              action={!searchQuery ? <Button onClick={handleOpenCreate}><Plus className="h-4 w-4 mr-2" />Novo Usuário</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Autenticação</TableHead>
                    <TableHead>Setores e Papéis</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[160px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            {user.photoUrl && <AvatarImage src={user.photoUrl} alt={user.name} />}
                            <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                              {getInitials(user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{user.name}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.authProvider === "local" ? "secondary" : "outline"} className="gap-1">
                          {user.authProvider === "local" ? (
                            <>
                              <KeyRound className="h-3 w-3" />
                              Local
                            </>
                          ) : (
                            <>
                              <Building2 className="h-3 w-3" />
                              Microsoft
                            </>
                          )}
                        </Badge>
                        {user.authProvider === "local" && user.mustChangePassword && (
                          <Badge variant="outline" className="ml-1 text-amber-600 border-amber-600">
                            Senha pendente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.isAdmin && (
                            <Badge variant="default" className="gap-1">
                              <Shield className="h-3 w-3" />
                              Admin
                            </Badge>
                          )}
                          {user.roles?.filter(r => r.roleName !== "Admin").slice(0, 2).map((role, i) => (
                            <Badge key={i} variant={getRoleBadgeVariant(role.roleName)}>
                              {role.sectorName}: {role.roleName}
                            </Badge>
                          ))}
                          {user.roles?.length > 2 && (
                            <Badge variant="outline">
                              +{user.roles.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Switch
                            checked={user.isActive}
                            onCheckedChange={(checked) => {
                              if (!checked && user.id === currentUser?.id) {
                                toast({ title: "Você não pode desativar sua própria conta", variant: "destructive" });
                                return;
                              }
                              toggleStatusMutation.mutate({ id: user.id, isActive: checked });
                            }}
                            data-testid={`switch-status-${user.id}`}
                          />
                          {user.isActive ? (
                            <span className="text-status-online text-sm">Ativo</span>
                          ) : (
                            <Badge variant="destructive" className="text-xs">Inativo</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(user)}
                            data-testid={`button-edit-${user.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {user.authProvider === "local" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => resetPasswordMutation.mutate(user.id)}
                                title="Redefinir senha para padrão"
                                data-testid={`button-reset-password-${user.id}`}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenPasswordDialog(user)}
                                title="Definir senha personalizada"
                                data-testid={`button-set-password-${user.id}`}
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {user.id !== currentUser?.id && user.isActive && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeactivateUserId(user.id)}
                              title="Desativar usuário"
                              data-testid={`button-deactivate-${user.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
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
        </TabsContent>

        <TabsContent value="default-password" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <KeyRound className="h-4 w-4" />
                Senha Padrão para Usuários Locais
              </CardTitle>
              <CardDescription>
                Quando um novo usuário local é criado, ele recebe esta senha inicial.
                O usuário será obrigado a alterá-la no primeiro login.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {settingsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="defaultPassword">Senha Padrão</Label>
                    <div className="relative">
                      <Input
                        id="defaultPassword"
                        type={showDefaultPassword ? "text" : "password"}
                        value={defaultPassword}
                        onChange={(e) => setDefaultPassword(e.target.value)}
                        placeholder="Senha padrão para novos usuários"
                        className="pr-10"
                        data-testid="input-default-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowDefaultPassword(!showDefaultPassword)}
                        data-testid="button-toggle-default-password"
                      >
                        {showDefaultPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    {defaultPassword && (
                      <div className="space-y-1 text-sm mt-2">
                        {defaultPasswordRequirements.map((req, i) => {
                          const met = req.test(defaultPassword);
                          return (
                            <div key={i} className="flex items-center gap-2">
                              {met ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <X className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className={met ? "text-green-600" : "text-muted-foreground"}>
                                {req.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleSaveDefaultPassword}
                      disabled={updateSettingMutation.isPending || !allDefaultRequirementsMet}
                      data-testid="button-save-default-password"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Salvar
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Editar Usuário" : "Novo Usuário"}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? "Altere as informações do usuário"
                : "Adicione um novo usuário ao sistema"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              {!editingUser && (
                <div className="space-y-2">
                  <Label>Tipo de Autenticação</Label>
                  <Select
                    value={formAuthProvider}
                    onValueChange={(v) => setFormAuthProvider(v as "entra" | "local")}
                  >
                    <SelectTrigger data-testid="select-auth-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">
                        <div className="flex items-center gap-2">
                          <KeyRound className="h-4 w-4" />
                          <span>Usuário Local (e-mail/senha)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="entra">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          <span>Microsoft Entra ID</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {formAuthProvider === "local" && (
                    <p className="text-xs text-muted-foreground">
                      O usuário receberá a senha padrão e precisará trocá-la no primeiro acesso.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="usuario@41tech.com.br"
                  disabled={!!editingUser}
                  data-testid="input-user-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nome completo"
                  data-testid="input-user-name"
                />
              </div>

              <div className="space-y-2">
                <Label>Setores</Label>
                <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                  {sectors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum setor cadastrado</p>
                  ) : (
                    sectors.map((sector) => (
                      <div key={sector.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`sector-${sector.id}`}
                          checked={formSectorIds.includes(sector.id)}
                          onCheckedChange={() => handleToggleSector(sector.id)}
                          data-testid={`checkbox-sector-${sector.id}`}
                        />
                        <label
                          htmlFor={`sector-${sector.id}`}
                          className="text-sm cursor-pointer flex-1"
                        >
                          {sector.name}
                        </label>
                        {formSectorIds.includes(sector.id) && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Selecione um ou mais setores para o usuário
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Papel (aplicado a todos os setores)</Label>
                <Select
                  value={formRoleName}
                  onValueChange={(v) => setFormRoleName(v as typeof formRoleName)}
                >
                  <SelectTrigger data-testid="select-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Usuario">Usuário</SelectItem>
                    <SelectItem value="Coordenador">Coordenador</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  O papel será aplicado a todos os setores selecionados
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  !formEmail.trim() ||
                  !formName.trim() ||
                  createMutation.isPending ||
                  updateMutation.isPending
                }
                data-testid="button-save-user"
              >
                {editingUser ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Definir Senha Personalizada</DialogTitle>
            <DialogDescription>
              Defina uma senha personalizada para {passwordUser?.name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSetPassword}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="customPassword">Nova Senha</Label>
                <Input
                  id="customPassword"
                  type="password"
                  value={customPassword}
                  onChange={(e) => setCustomPassword(e.target.value)}
                  placeholder="Digite a nova senha"
                  data-testid="input-custom-password"
                />
                {customPassword && (
                  <div className="space-y-1 text-sm mt-2">
                    {passwordRequirements.map((req, i) => {
                      const met = req.test(customPassword);
                      return (
                        <div key={i} className="flex items-center gap-2">
                          {met ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className={met ? "text-green-600" : "text-muted-foreground"}>
                            {req.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsPasswordDialogOpen(false);
                  setPasswordUser(null);
                  setCustomPassword("");
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!customPasswordValid || setPasswordMutation.isPending}
                data-testid="button-save-custom-password"
              >
                Definir Senha
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirmation */}
      <AlertDialog open={deactivateUserId !== null} onOpenChange={(o) => !o && setDeactivateUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? Isso vai desativar o usuário e impedir o login.
              O histórico e os dados do usuário serão mantidos. A conta pode ser reativada pelo Switch de Status a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deactivateUserId) {
                  toggleStatusMutation.mutate({ id: deactivateUserId, isActive: false });
                }
                setDeactivateUserId(null);
              }}
              data-testid="button-confirm-deactivate"
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
