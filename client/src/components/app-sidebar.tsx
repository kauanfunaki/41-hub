import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import {
  Home,
  LayoutGrid,
  BarChart3,
  Star,
  Settings,
  LogOut,
  User,
  Ticket,
  Keyboard,
  ChevronRight,
  Package,
  Bell,
  BookOpen,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ThemeLogo } from "@/components/theme-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const recursosSubItems = [
  { title: "Apps", url: "/apps", icon: LayoutGrid },
  { title: "Dashboards", url: "/dashboards", icon: BarChart3 },
  { title: "Favoritos", url: "/favorites", icon: Star },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();
  const isAdmin = user?.isAdmin;
  const isUsuarioOnly =
    !isAdmin && !(user?.roles?.some((r: any) => r.roleName === "Coordenador"));

  const [recursosOpen, setRecursosOpen] = useState(
    ["/apps", "/dashboards", "/favorites"].some((p) => location.startsWith(p)),
  );

  const { data: opsWatchers } = useQuery<{ slug: string }[]>({
    queryKey: ["/api/ops/watchers"],
    enabled: isAuthenticated,
    staleTime: 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });
  const showOpsCenter =
    isAdmin || (opsWatchers !== undefined && opsWatchers.length > 0);

  // Ticket + alert count badges for sidebar
  const { data: activeTickets = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/tickets", { sidebar: true }],
    queryFn: async () => {
      const res = await fetch("/api/tickets", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthenticated && !isUsuarioOnly,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
  const { data: activeAlertsData = [] } = useQuery<{ id: string; isRead?: boolean }[]>({
    queryKey: ["/api/alerts", { sidebar: true }],
    queryFn: async () => {
      const res = await fetch("/api/alerts?active=true", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
  const ticketCount = Array.isArray(activeTickets) ? activeTickets.length : 0;
  const alertCount = Array.isArray(activeAlertsData) ? activeAlertsData.filter((a) => !a.isRead).length : 0;

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center justify-center">
          <ThemeLogo className="h-10 w-auto" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Visão geral */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/"}
                  data-testid="nav-home"
                >
                  <Link href="/">
                    <Home className="h-4 w-4" />
                    <span>Visão geral</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Recursos (collapsible) */}
              <Collapsible open={recursosOpen} onOpenChange={setRecursosOpen}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      isActive={recursosSubItems.some((i) =>
                        location.startsWith(i.url),
                      )}
                      data-testid="nav-recursos"
                    >
                      <Package className="h-4 w-4" />
                      <span>Recursos</span>
                      <ChevronRight
                        className={`ml-auto h-4 w-4 transition-transform ${
                          recursosOpen ? "rotate-90" : ""
                        }`}
                      />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {recursosSubItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={location.startsWith(item.url)}
                            data-testid={`nav-${item.title.toLowerCase()}`}
                          >
                            <Link href={item.url}>
                              <item.icon className="h-3.5 w-3.5" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* Chamados — hidden for plain "Usuario" role */}
              {!isUsuarioOnly && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.startsWith("/tickets")}
                    data-testid="nav-chamados"
                  >
                    <Link href="/tickets">
                      <Ticket className="h-4 w-4" />
                      <span>Chamados</span>
                      {ticketCount > 0 && (
                        <Badge
                          variant="secondary"
                          className="ml-auto h-5 min-w-[1.25rem] px-1 text-[10px] flex items-center justify-center"
                        >
                          {ticketCount > 99 ? "99+" : ticketCount}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Ops Center */}
              {showOpsCenter && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.startsWith("/ops")}
                    data-testid="nav-ops"
                  >
                    <Link href="/ops">
                      <Activity className="h-4 w-4" />
                      <span>Ops Center</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Digitação */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.startsWith("/typing")}
                  data-testid="nav-digitação"
                >
                  <Link href="/typing">
                    <Keyboard className="h-4 w-4" />
                    <span>Digitação</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Alertas */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/alerts"}
                  data-testid="nav-alertas"
                >
                  <Link href="/alerts">
                    <Bell className="h-4 w-4" />
                    <span>Alertas</span>
                    {alertCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="ml-auto h-5 min-w-[1.25rem] px-1 text-[10px] flex items-center justify-center"
                      >
                        {alertCount > 99 ? "99+" : alertCount}
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Configurações</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Perfil */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.startsWith("/profile")}
                  data-testid="nav-perfil"
                >
                  <Link href="/profile">
                    <User className="h-4 w-4" />
                    <span>Perfil</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Base de Conhecimento */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.startsWith("/kb")}
                  data-testid="nav-kb"
                >
                  <Link href="/kb">
                    <BookOpen className="h-4 w-4" />
                    <span>Base de Conhecimento</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Admin — single entry point for all admin settings */}
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.startsWith("/admin") || location.startsWith("/analytics")}
                    data-testid="nav-admin"
                  >
                    <Link href="/admin">
                      <Settings className="h-4 w-4" />
                      <span>Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        {isAuthenticated && user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-auto py-2 px-2"
                data-testid="button-user-menu"
              >
                <Avatar className="h-8 w-8">
                  {user.photoUrl && (
                    <AvatarImage
                      src={user.photoUrl}
                      alt={user.name}
                      onError={(e) => {
                        (
                          e.currentTarget as HTMLImageElement
                        ).style.display = "none";
                      }}
                    />
                  )}
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start text-left overflow-hidden">
                  <span className="text-sm font-medium truncate max-w-[140px]">
                    {user.name}
                  </span>
                  <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                    {user.email}
                  </span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <Link href="/profile">
                <DropdownMenuItem
                  data-testid="menu-profile"
                  className="cursor-pointer"
                >
                  <User className="mr-2 h-4 w-4" />
                  <span>Perfil</span>
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={logout}
                className="text-destructive focus:text-destructive"
                data-testid="menu-logout"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sair</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="text-sm text-muted-foreground text-center">
            Não autenticado
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
