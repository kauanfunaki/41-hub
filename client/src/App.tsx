import { useEffect } from "react";
import { ShieldOff } from "lucide-react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { NotificationProvider } from "@/providers/notification-provider";
import { LoginLoadingScreen } from "@/components/login-loading-screen";
import { TutorialModal } from "@/components/tutorial-modal";
import { GlobalSearch, SearchTriggerButton } from "@/components/global-search";
import { primeAudio } from "@/lib/sound";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import LocalLogin from "@/pages/local-login";
import { PasswordChangeModal } from "@/components/password-change-modal";
import Home from "@/pages/home";
import Apps from "@/pages/apps";
import Dashboards from "@/pages/dashboards";
import Favorites from "@/pages/favorites";
import Profile from "@/pages/profile";
import ResourceViewer from "@/pages/resource-viewer";
import AdminIndex from "@/pages/admin/index";
import AdminSectors from "@/pages/admin/sectors";
import AdminUsers from "@/pages/admin/users";
import AdminResources from "@/pages/admin/resources";
import AdminAudit from "@/pages/admin/audit";
import AdminSettings from "@/pages/admin/settings";
import AdminTicketCategories from "@/pages/admin/ticket-categories";
import AdminTicketSlaPolicies from "@/pages/admin/ticket-sla";
import AdminTicketsSettings from "@/pages/admin/tickets-settings";
import AdminNotifications from "@/pages/admin/notifications";
import AdminKb from "@/pages/admin/kb";
import AdminTyping from "@/pages/admin/typing";
import AdminReports from "@/pages/admin/reports";
import TicketsIndex from "@/pages/tickets/index";
import TicketsNew from "@/pages/tickets/new";
import TicketsDetail from "@/pages/tickets/detail";
import TypingTest from "@/pages/typing";
import TypingLeaderboard from "@/pages/typing-leaderboard";
import Alerts from "@/pages/alerts";
import AdminAlerts from "@/pages/admin-alerts";
import Analytics from "@/pages/analytics";
import AdminIntegrations from "@/pages/admin/integrations";
import AdminTicketsAnalytics from "@/pages/admin/tickets-analytics";
import Kb from "@/pages/kb";
import KbArticle from "@/pages/kb-article";
import OpsCenter from "@/pages/ops";
import AdminOpsWatchers from "@/pages/admin/ops-watchers";

function TicketAccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-12 gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <ShieldOff className="h-8 w-8 text-destructive" />
      </div>
      <h2 className="text-xl font-semibold">Acesso não autorizado</h2>
      <p className="text-muted-foreground max-w-sm">
        Seu perfil de acesso (Usuário) não permite visualizar ou criar chamados.
        Entre em contato com um Administrador se precisar de acesso.
      </p>
    </div>
  );
}

function TicketGuard({ component: Component }: { component: React.ComponentType }) {
  const { user } = useAuth();
  const isUsuarioOnly = user && !user.isAdmin && !(user.roles?.some((r: any) => r.roleName === "Coordenador"));
  if (isUsuarioOnly) return <TicketAccessDenied />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/apps" component={Apps} />
      <Route path="/dashboards" component={Dashboards} />
      <Route path="/favorites" component={Favorites} />
      <Route path="/profile" component={Profile} />
      <Route path="/resource/:id" component={ResourceViewer} />
      <Route path="/tickets" component={() => <TicketGuard component={TicketsIndex} />} />
      <Route path="/tickets/new" component={() => <TicketGuard component={TicketsNew} />} />
      <Route path="/tickets/:id" component={() => <TicketGuard component={TicketsDetail} />} />
      <Route path="/typing" component={TypingTest} />
      <Route path="/typing/leaderboard" component={TypingLeaderboard} />
      <Route path="/admin" component={AdminIndex} />
      <Route path="/admin/sectors" component={AdminSectors} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/resources" component={AdminResources} />
      <Route path="/admin/audit" component={AdminAudit} />
      <Route path="/admin/settings" component={AdminSettings} />
      <Route path="/admin/tickets-settings" component={AdminTicketsSettings} />
      <Route path="/admin/notifications" component={AdminNotifications} />
      <Route path="/admin/kb" component={AdminKb} />
      <Route path="/admin/ti" component={Analytics} />
      <Route path="/admin/typing" component={AdminTyping} />
      <Route path="/admin/reports" component={AdminReports} />
      <Route path="/admin/tickets/categories" component={AdminTicketCategories} />
      <Route path="/admin/tickets/sla" component={AdminTicketSlaPolicies} />
      <Route path="/admin/integrations" component={AdminIntegrations} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/admin/alerts" component={AdminAlerts} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/admin/analytics/tickets" component={AdminTicketsAnalytics} />
      <Route path="/kb" component={Kb} />
      <Route path="/kb/articles/:id" component={KbArticle} />
      <Route path="/ops" component={OpsCenter} />
      <Route path="/admin/ops-watchers" component={AdminOpsWatchers} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedLayout() {
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      {/* Global notification polling + toast + sound – mounted once here */}
      <NotificationProvider />
      <div className="flex h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex flex-col flex-1 overflow-hidden">
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-card px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <SearchTriggerButton />
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </SidebarInset>
      </div>
      <TutorialModal />
      <GlobalSearch />
    </SidebarProvider>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading, isAuthenticating } = useAuth();

  // Unlock audio on first user gesture (works for any page, auth or not)
  useEffect(() => {
    const onFirstGesture = () => primeAudio();
    document.addEventListener("pointerdown", onFirstGesture, { once: true });
    return () => document.removeEventListener("pointerdown", onFirstGesture);
  }, []);

  if (isLoading || isAuthenticating) {
    return <LoginLoadingScreen />;
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/login/local" component={LocalLogin} />
        <Route component={Login} />
      </Switch>
    );
  }

  return (
    <>
      <PasswordChangeModal />
      <AuthenticatedLayout />
    </>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;