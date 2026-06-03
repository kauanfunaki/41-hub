import { useState } from "react";
import {
  ArrowLeft,
  Download,
  FileText,
  Bell,
  Package,
  Users,
  Keyboard,
  Activity,
  Calendar,
  Loader2,
  ChevronRight,
  BookOpen,
  Rss,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ReportType =
  | "tickets"
  | "resources"
  | "notifications"
  | "users"
  | "typing"
  | "audit-logs"
  | "ops-watchers"
  | "kb";

interface ReportDef {
  key: ReportType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  badge?: string;
}

const REPORTS: ReportDef[] = [
  {
    key: "tickets",
    label: "Chamados",
    description: "Todos os chamados com status, prioridade, categoria e SLA.",
    icon: FileText,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    key: "resources",
    label: "Recursos / Apps",
    description: "Apps e dashboards cadastrados, com setor e status.",
    icon: Package,
    color: "text-chart-2",
    bgColor: "bg-chart-2/10",
  },
  {
    key: "notifications",
    label: "Notificações",
    description: "Notificações enviadas, com destinatário e status de leitura.",
    icon: Bell,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  {
    key: "users",
    label: "Usuários",
    description: "Todos os usuários com setores e provedor de autenticação.",
    icon: Users,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    badge: "Novo",
  },
  {
    key: "typing",
    label: "Digitação",
    description: "Scores e sessões do teste de digitação por dificuldade.",
    icon: Keyboard,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    badge: "Novo",
  },
  {
    key: "audit-logs",
    label: "Logs de Auditoria",
    description: "Trilha de auditoria completa de ações do sistema.",
    icon: Activity,
    color: "text-chart-4",
    bgColor: "bg-chart-4/10",
    badge: "Novo",
  },
  {
    key: "ops-watchers",
    label: "Ops Center",
    description: "Eventos processados pelos watchers BPO/BLD com status e arquivos.",
    icon: Rss,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    badge: "Novo",
  },
  {
    key: "kb",
    label: "Base de Conhecimento",
    description: "Artigos com total de visualizações e feedback dos usuários.",
    icon: BookOpen,
    color: "text-sky-500",
    bgColor: "bg-sky-500/10",
    badge: "Novo",
  },
];

async function downloadReport(url: string, filename: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    let msg = "Falha ao gerar relatório";
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function DateRangeRow({
  fromValue,
  onFromChange,
  toValue,
  onToChange,
  fromId,
  toId,
}: {
  fromValue: string;
  onFromChange: (v: string) => void;
  toValue: string;
  onToChange: (v: string) => void;
  fromId: string;
  toId: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label
          htmlFor={fromId}
          className="text-xs text-muted-foreground flex items-center gap-1"
        >
          <Calendar className="h-3 w-3" /> De
        </Label>
        <Input
          id={fromId}
          type="date"
          value={fromValue}
          onChange={(e) => onFromChange(e.target.value)}
          className="w-40 [color-scheme:light] dark:[color-scheme:dark]"
          data-testid={`input-${fromId}`}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={toId} className="text-xs text-muted-foreground">
          Até
        </Label>
        <Input
          id={toId}
          type="date"
          value={toValue}
          onChange={(e) => onToChange(e.target.value)}
          className="w-40 [color-scheme:light] dark:[color-scheme:dark]"
          data-testid={`input-${toId}`}
        />
      </div>
    </div>
  );
}

function ExportButtons({
  type,
  loading,
  onExport,
}: {
  type: string;
  loading: string | null;
  onExport: (format: "csv" | "json") => void;
}) {
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onExport("csv")}
        disabled={loading === `${type}-csv`}
        className="flex-1 justify-center"
        data-testid={`button-export-${type}-csv`}
      >
        {loading === `${type}-csv` ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onExport("json")}
        disabled={loading === `${type}-json`}
        className="flex-1 justify-center"
        data-testid={`button-export-${type}-json`}
      >
        {loading === `${type}-json` ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        JSON
      </Button>
    </div>
  );
}

export default function AdminReports() {
  const { toast } = useToast();
  const [selected, setSelected] = useState<ReportType>("tickets");
  const [loading, setLoading] = useState<string | null>(null);

  const [ticketFrom, setTicketFrom] = useState("");
  const [ticketTo, setTicketTo] = useState("");
  const [notifFrom, setNotifFrom] = useState("");
  const [notifTo, setNotifTo] = useState("");
  const [usersFrom, setUsersFrom] = useState("");
  const [usersTo, setUsersTo] = useState("");
  const [typingFrom, setTypingFrom] = useState("");
  const [typingTo, setTypingTo] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [opsFrom, setOpsFrom] = useState("");
  const [opsTo, setOpsTo] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const handleExport = async (type: ReportType, format: "csv" | "json") => {
    const key = `${type}-${format}`;
    setLoading(key);
    try {
      let url = `/api/admin/reports/${type}?format=${format}`;
      if (type === "tickets") {
        if (ticketFrom) url += `&from=${ticketFrom}`;
        if (ticketTo) url += `&to=${ticketTo}`;
      } else if (type === "notifications") {
        if (notifFrom) url += `&from=${notifFrom}`;
        if (notifTo) url += `&to=${notifTo}`;
      } else if (type === "resources" && includeInactive) {
        url += `&includeInactive=true`;
      } else if (type === "users") {
        if (usersFrom) url += `&from=${usersFrom}`;
        if (usersTo) url += `&to=${usersTo}`;
      } else if (type === "typing") {
        if (typingFrom) url += `&from=${typingFrom}`;
        if (typingTo) url += `&to=${typingTo}`;
      } else if (type === "audit-logs") {
        if (auditFrom) url += `&from=${auditFrom}`;
        if (auditTo) url += `&to=${auditTo}`;
      } else if (type === "ops-watchers") {
        if (opsFrom) url += `&from=${opsFrom}`;
        if (opsTo) url += `&to=${opsTo}`;
      }
      const ext = format === "csv" ? "csv" : "json";
      await downloadReport(url, `${type}_report.${ext}`);
      toast({
        title: "Exportado com sucesso",
        description: `Relatório de ${type} baixado.`,
      });
    } catch (err: any) {
      toast({
        title: "Falha ao exportar",
        description: err?.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const selectedDef = REPORTS.find((r) => r.key === selected)!;
  const SelectedIcon = selectedDef.icon;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-5/10 shrink-0">
          <Download className="h-5 w-5 text-chart-5" />
        </div>
        <div>
          <h1
            className="text-xl font-semibold text-foreground"
            data-testid="text-reports-title"
          >
            Relatórios
          </h1>
          <p className="text-sm text-muted-foreground">
            Exporte dados do sistema em CSV ou JSON
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="lg:w-64 shrink-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 px-1">
            Tipo de relatório
          </p>
          <div className="space-y-0.5">
            {REPORTS.map((report) => {
              const Icon = report.icon;
              const isSelected = selected === report.key;
              return (
                <button
                  key={report.key}
                  className={cn(
                    "relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all",
                    isSelected
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-foreground",
                  )}
                  onClick={() => setSelected(report.key)}
                  data-testid={`report-select-${report.key}`}
                >
                  {isSelected && (
                    <div className="absolute left-0 inset-y-1.5 w-0.5 rounded-full bg-primary" />
                  )}
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md shrink-0 transition-colors",
                      isSelected ? "bg-primary/15" : report.bgColor,
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5",
                        isSelected ? "text-primary" : report.color,
                      )}
                    />
                  </div>
                  <span className="flex-1 text-sm font-medium">{report.label}</span>
                  {report.badge && (
                    <Badge variant="secondary" className="text-xs">
                      {report.badge}
                    </Badge>
                  )}
                  {isSelected && (
                    <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1">
          <div className="rounded-xl border bg-card overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center gap-3 p-5 border-b">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                  selectedDef.bgColor,
                )}
              >
                <SelectedIcon className={cn("h-5 w-5", selectedDef.color)} />
              </div>
              <div>
                <h2 className="text-base font-semibold">{selectedDef.label}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedDef.description}
                </p>
              </div>
            </div>

            {/* Filters + Export */}
            <div className="p-5 space-y-5">
              {/* Per-report filters */}
              {(selected === "tickets" ||
                selected === "notifications" ||
                selected === "users" ||
                selected === "typing" ||
                selected === "audit-logs" ||
                selected === "ops-watchers") && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                    Período
                  </p>
                  {selected === "tickets" && (
                    <DateRangeRow
                      fromValue={ticketFrom}
                      onFromChange={setTicketFrom}
                      toValue={ticketTo}
                      onToChange={setTicketTo}
                      fromId="ticket-from"
                      toId="ticket-to"
                    />
                  )}
                  {selected === "notifications" && (
                    <DateRangeRow
                      fromValue={notifFrom}
                      onFromChange={setNotifFrom}
                      toValue={notifTo}
                      onToChange={setNotifTo}
                      fromId="notif-from"
                      toId="notif-to"
                    />
                  )}
                  {selected === "users" && (
                    <DateRangeRow
                      fromValue={usersFrom}
                      onFromChange={setUsersFrom}
                      toValue={usersTo}
                      onToChange={setUsersTo}
                      fromId="users-from"
                      toId="users-to"
                    />
                  )}
                  {selected === "typing" && (
                    <DateRangeRow
                      fromValue={typingFrom}
                      onFromChange={setTypingFrom}
                      toValue={typingTo}
                      onToChange={setTypingTo}
                      fromId="typing-from"
                      toId="typing-to"
                    />
                  )}
                  {selected === "audit-logs" && (
                    <DateRangeRow
                      fromValue={auditFrom}
                      onFromChange={setAuditFrom}
                      toValue={auditTo}
                      onToChange={setAuditTo}
                      fromId="audit-from"
                      toId="audit-to"
                    />
                  )}
                  {selected === "ops-watchers" && (
                    <DateRangeRow
                      fromValue={opsFrom}
                      onFromChange={setOpsFrom}
                      toValue={opsTo}
                      onToChange={setOpsTo}
                      fromId="ops-from"
                      toId="ops-to"
                    />
                  )}
                </div>
              )}

              {selected === "resources" && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="include-inactive"
                    checked={includeInactive}
                    onCheckedChange={setIncludeInactive}
                    data-testid="switch-include-inactive"
                  />
                  <Label
                    htmlFor="include-inactive"
                    className="text-sm cursor-pointer"
                  >
                    Incluir inativos
                  </Label>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                  Exportar como
                </p>
                <ExportButtons
                  type={selected}
                  loading={loading}
                  onExport={(format) => handleExport(selected, format)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
