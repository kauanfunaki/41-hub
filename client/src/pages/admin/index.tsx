import { Link } from "wouter";
import {
  Users,
  Building2,
  Layout,
  FileText,
  ChevronRight,
  Settings,
  Ticket,
  Bell,
  BookOpen,
  LineChart,
  Keyboard,
  Download,
  Puzzle,
  Activity,
  ShieldAlert,
  MessageSquarePlus,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface AdminStats {
  users: number;
  sectors: number;
  resources: number;
  auditLogs: number;
}

interface AdminSection {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  color: string;
  bgColor: string;
}

interface AdminGroup {
  label: string;
  items: AdminSection[];
}

const adminGroups: AdminGroup[] = [
  {
    label: "Dados & Relatórios",
    items: [
      {
        title: "Relatórios",
        description: "Exportar dados em CSV e JSON",
        icon: Download,
        href: "/admin/reports",
        color: "text-chart-5",
        bgColor: "bg-chart-5/10",
      },
      {
        title: "Analytics",
        description: "Métricas, SLA e painel de operações TI",
        icon: LineChart,
        href: "/admin/analytics",
        color: "text-chart-4",
        bgColor: "bg-chart-4/10",
      },
      {
        title: "Auditoria",
        description: "Visualizar logs de atividades",
        icon: FileText,
        href: "/admin/audit",
        color: "text-chart-3",
        bgColor: "bg-chart-3/10",
      },
      {
        title: "Feedbacks",
        description: "Bugs, sugestões e melhorias enviados pelos usuários",
        icon: MessageSquarePlus,
        href: "/admin/feedback",
        color: "text-emerald-500",
        bgColor: "bg-emerald-500/10",
      },
    ],
  },
  {
    label: "Pessoas & Organização",
    items: [
      {
        title: "Usuários",
        description: "Gerenciar usuários e permissões",
        icon: Users,
        href: "/admin/users",
        color: "text-primary",
        bgColor: "bg-primary/10",
      },
      {
        title: "Setores",
        description: "Gerenciar setores da organização",
        icon: Building2,
        href: "/admin/sectors",
        color: "text-chart-2",
        bgColor: "bg-chart-2/10",
      },
      {
        title: "Notificações",
        description: "Configurar notificações do sistema",
        icon: Bell,
        href: "/admin/notifications",
        color: "text-amber-500",
        bgColor: "bg-amber-500/10",
      },
    ],
  },
  {
    label: "Infraestrutura",
    items: [
      {
        title: "Recursos",
        description: "Gerenciar apps e dashboards",
        icon: Layout,
        href: "/admin/resources",
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
      },
      {
        title: "Config. Ops",
        description: "Configurar watchers e automações",
        icon: Activity,
        href: "/admin/ops-watchers",
        color: "text-chart-1",
        bgColor: "bg-chart-1/10",
      },
      {
        title: "Integrações",
        description: "Conectar sistemas externos",
        icon: Puzzle,
        href: "/admin/integrations",
        color: "text-violet-500",
        bgColor: "bg-violet-500/10",
      },
    ],
  },
  {
    label: "Configurações do Sistema",
    items: [
      {
        title: "Config. Chamados",
        description: "Categorias, subcategorias e políticas SLA",
        icon: Ticket,
        href: "/admin/tickets-settings",
        color: "text-chart-2",
        bgColor: "bg-chart-2/10",
      },
      {
        title: "Config. Digitação",
        description: "Gerenciar textos para o teste de digitação",
        icon: Keyboard,
        href: "/admin/typing",
        color: "text-chart-3",
        bgColor: "bg-chart-3/10",
      },
      {
        title: "Gestão de Alertas",
        description: "Configurar alertas do sistema",
        icon: ShieldAlert,
        href: "/admin/alerts",
        color: "text-orange-500",
        bgColor: "bg-orange-500/10",
      },
      {
        title: "Base de Conhecimento",
        description: "Gerenciar artigos vinculados a categorias",
        icon: BookOpen,
        href: "/admin/kb",
        color: "text-chart-1",
        bgColor: "bg-chart-1/10",
      },
    ],
  },
];

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

export default function AdminIndex() {
  const { data: stats } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1
            className="text-xl font-semibold text-foreground"
            data-testid="text-admin-title"
          >
            Painel Administrativo
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie usuários, chamados, notificações e recursos do Hub
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Setores",
            value: stats?.sectors ?? 0,
            icon: Building2,
            stripe: "bg-primary",
            textColor: "text-foreground",
            iconBg: "bg-primary/10",
            iconColor: "text-primary",
          },
          {
            label: "Usuários",
            value: stats?.users ?? 0,
            icon: Users,
            stripe: "bg-chart-2",
            textColor: "text-foreground",
            iconBg: "bg-chart-2/10",
            iconColor: "text-chart-2",
          },
          {
            label: "Recursos",
            value: stats?.resources ?? 0,
            icon: Layout,
            stripe: "bg-chart-3",
            textColor: "text-foreground",
            iconBg: "bg-chart-3/10",
            iconColor: "text-chart-3",
          },
          {
            label: "Logs (30 dias)",
            value: stats?.auditLogs ?? 0,
            icon: FileText,
            stripe: "bg-chart-4",
            textColor: "text-foreground",
            iconBg: "bg-chart-4/10",
            iconColor: "text-chart-4",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border bg-card overflow-hidden"
          >
            <div className={cn("h-[3px] w-full", stat.stripe)} />
            <div className="p-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-3xl font-bold tabular-nums tracking-tight">
                  {stat.value}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {stat.label}
                </p>
              </div>
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg shrink-0 mt-0.5",
                  stat.iconBg,
                )}
              >
                <stat.icon className={cn("h-4 w-4", stat.iconColor)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Grouped sections */}
      <div className="flex flex-col gap-6">
        {adminGroups.map((group) => (
          <div key={group.label} className="flex flex-col gap-3">
            <SectionDivider label={group.label} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.items.map((section) => (
                <Link key={section.href} href={section.href}>
                  <div
                    className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-accent transition-colors cursor-pointer group"
                    data-testid={`admin-section-${section.title.toLowerCase().replace(/[\s.]+/g, "-")}`}
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
                        section.bgColor,
                      )}
                    >
                      <section.icon
                        className={cn("h-5 w-5", section.color)}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-tight">
                        {section.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        {section.description}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
