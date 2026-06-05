import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Users,
  BarChart3,
  Inbox,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TiDashboardData {
  summary: {
    open: number;
    inProgress: number;
    waitingUser: number;
    resolved: number;
    cancelled: number;
    slaOk: number;
    slaRisk: number;
    slaBreached: number;
  };
  queue: Array<{
    ticketId: string;
    title: string;
    status: string;
    priority: string;
    categoryName: string;
    categoryBranch: string;
    creatorName: string;
    createdAt: string;
    assignees: string[];
    slaState: "OK" | "RISK" | "BREACHED";
    resolutionDueAt: string | null;
  }>;
  wipByAssignee: Array<{ userId: string; userName: string; count: number }>;
  throughput: Array<{ date: string; resolved: number; opened: number }>;
  backlogByCategory: Array<{
    categoryName: string;
    categoryBranch: string;
    count: number;
  }>;
}

const statusLabels: Record<string, string> = {
  ABERTO: "Aberto",
  NA_FILA: "Na fila",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_USUARIO: "Aguardando",
  AGUARDANDO_APROVACAO: "Aprovação",
  RESOLVIDO: "Resolvido",
  CANCELADO: "Cancelado",
};

const priorityLabels: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

function SlaStateBadge({ state }: { state: "OK" | "RISK" | "BREACHED" }) {
  if (state === "OK") {
    return (
      <Badge variant="secondary" className="gap-1" data-testid={`badge-sla-${state}`}>
        <ShieldCheck className="h-3 w-3" />
        OK
      </Badge>
    );
  }
  if (state === "RISK") {
    return (
      <Badge variant="secondary" className="gap-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" data-testid={`badge-sla-${state}`}>
        <ShieldAlert className="h-3 w-3" />
        Risco
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1" data-testid={`badge-sla-${state}`}>
      <ShieldX className="h-3 w-3" />
      Violado
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const variants: Record<string, string> = {
    URGENTE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    ALTA: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    MEDIA: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    BAIXA: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="secondary" className={variants[priority] || ""} data-testid={`badge-priority-${priority}`}>
      {priorityLabels[priority] || priority}
    </Badge>
  );
}

export default function TiDashboard() {
  const [range, setRange] = useState<"7d" | "30d">("7d");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [slaFilter, setSlaFilter] = useState<string>("ALL");

  const { data, isLoading } = useQuery<TiDashboardData>({
    queryKey: ["/api/admin/ti/dashboard", range],
    queryFn: () =>
      fetch(`/api/admin/ti/dashboard?range=${range}`).then((r) => r.json()),
  });

  const filteredQueue = data?.queue.filter((t) => {
    if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
    if (slaFilter !== "ALL" && t.slaState !== slaFilter) return false;
    return true;
  });

  const totalActive =
    (data?.summary.open || 0) +
    (data?.summary.inProgress || 0) +
    (data?.summary.waitingUser || 0);

  const maxThroughput = data?.throughput
    ? Math.max(...data.throughput.map((d) => Math.max(d.opened, d.resolved)), 1)
    : 1;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/admin">
          <Button variant="ghost" size="icon" data-testid="button-back-admin">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-1/10">
          <BarChart3 className="h-5 w-5 text-chart-1" />
        </div>
        <div className="flex-1">
          <h1
            className="text-xl font-semibold text-foreground"
            data-testid="text-ti-dashboard-title"
          >
            Painel de Operações TI
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão geral de chamados, SLA e carga da equipe
          </p>
        </div>
        <Select
          value={range}
          onValueChange={(v) => setRange(v as "7d" | "30d")}
        >
          <SelectTrigger className="w-[140px]" data-testid="select-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card data-testid="card-summary-open">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Inbox className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold" data-testid="text-open-count">
                    {data.summary.open}
                  </p>
                  <p className="text-sm text-muted-foreground">Abertos</p>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-summary-in-progress">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                  <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold" data-testid="text-in-progress-count">
                    {data.summary.inProgress}
                  </p>
                  <p className="text-sm text-muted-foreground">Em andamento</p>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-summary-waiting">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                  <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold" data-testid="text-waiting-count">
                    {data.summary.waitingUser}
                  </p>
                  <p className="text-sm text-muted-foreground">Aguardando</p>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-summary-resolved">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold" data-testid="text-resolved-count">
                    {data.summary.resolved}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Resolvidos ({range === "7d" ? "7d" : "30d"})
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card data-testid="card-sla-ok">
              <CardContent className="flex items-center gap-3 p-4">
                <ShieldCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-2xl font-semibold" data-testid="text-sla-ok-count">
                    {data.summary.slaOk}
                  </p>
                  <p className="text-sm text-muted-foreground">SLA OK</p>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-sla-risk">
              <CardContent className="flex items-center gap-3 p-4">
                <ShieldAlert className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                <div>
                  <p className="text-2xl font-semibold" data-testid="text-sla-risk-count">
                    {data.summary.slaRisk}
                  </p>
                  <p className="text-sm text-muted-foreground">SLA em Risco</p>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-sla-breached">
              <CardContent className="flex items-center gap-3 p-4">
                <ShieldX className="h-6 w-6 text-red-600 dark:text-red-400" />
                <div>
                  <p className="text-2xl font-semibold" data-testid="text-sla-breached-count">
                    {data.summary.slaBreached}
                  </p>
                  <p className="text-sm text-muted-foreground">SLA Violado</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="queue" className="w-full">
            <TabsList data-testid="tabs-ti-dashboard">
              <TabsTrigger value="queue" data-testid="tab-queue">
                Fila ({totalActive})
              </TabsTrigger>
              <TabsTrigger value="wip" data-testid="tab-wip">
                Carga por Responsável
              </TabsTrigger>
              <TabsTrigger value="throughput" data-testid="tab-throughput">
                Throughput
              </TabsTrigger>
              <TabsTrigger value="backlog" data-testid="tab-backlog">
                Backlog por Categoria
              </TabsTrigger>
            </TabsList>

            <TabsContent value="queue" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
                  <CardTitle className="text-base">Fila de Chamados Ativos</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Todos status</SelectItem>
                        <SelectItem value="ABERTO">Aberto</SelectItem>
                        <SelectItem value="NA_FILA">Na fila</SelectItem>
                        <SelectItem value="EM_ANDAMENTO">Em andamento</SelectItem>
                        <SelectItem value="AGUARDANDO_USUARIO">Aguardando</SelectItem>
                        <SelectItem value="AGUARDANDO_APROVACAO">Aprovação</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={slaFilter} onValueChange={setSlaFilter}>
                      <SelectTrigger className="w-[130px]" data-testid="select-sla-filter">
                        <SelectValue placeholder="SLA" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Todos SLA</SelectItem>
                        <SelectItem value="OK">OK</SelectItem>
                        <SelectItem value="RISK">Risco</SelectItem>
                        <SelectItem value="BREACHED">Violado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Título</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Prioridade</TableHead>
                          <TableHead>Categoria</TableHead>
                          <TableHead>Solicitante</TableHead>
                          <TableHead>Responsáveis</TableHead>
                          <TableHead>SLA</TableHead>
                          <TableHead>Prazo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredQueue && filteredQueue.length > 0 ? (
                          filteredQueue.map((t) => (
                            <TableRow
                              key={t.ticketId}
                              className="cursor-pointer hover-elevate"
                              data-testid={`row-ticket-${t.ticketId}`}
                            >
                              <TableCell className="max-w-[200px]">
                                <Link href={`/tickets/${t.ticketId}`}>
                                  <span className="font-medium text-foreground hover:underline" data-testid={`link-ticket-${t.ticketId}`}>
                                    {t.title}
                                  </span>
                                </Link>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" data-testid={`badge-status-${t.ticketId}`}>
                                  {statusLabels[t.status] || t.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <PriorityBadge priority={t.priority} />
                              </TableCell>
                              <TableCell>
                                <span className="text-sm text-muted-foreground">
                                  {t.categoryBranch}
                                </span>
                                <span className="text-sm"> / {t.categoryName}</span>
                              </TableCell>
                              <TableCell className="text-sm">{t.creatorName}</TableCell>
                              <TableCell className="text-sm">
                                {t.assignees.length > 0
                                  ? t.assignees.join(", ")
                                  : <span className="text-muted-foreground">Sem responsável</span>}
                              </TableCell>
                              <TableCell>
                                <SlaStateBadge state={t.slaState} />
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                {t.resolutionDueAt
                                  ? new Date(t.resolutionDueAt).toLocaleDateString("pt-BR", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "-"}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                              Nenhum chamado encontrado com os filtros selecionados
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="wip" className="mt-4">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Carga de Trabalho (WIP) por Responsável
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Responsável</TableHead>
                        <TableHead className="text-right">Chamados Ativos</TableHead>
                        <TableHead className="w-[40%]">Carga</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.wipByAssignee.length > 0 ? (
                        data.wipByAssignee.map((w) => {
                          const maxWip = Math.max(
                            ...data.wipByAssignee.map((x) => x.count),
                            1
                          );
                          const pct = (w.count / maxWip) * 100;
                          return (
                            <TableRow
                              key={w.userId}
                              data-testid={`row-wip-${w.userId}`}
                            >
                              <TableCell className="font-medium">
                                {w.userName}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {w.count}
                              </TableCell>
                              <TableCell>
                                <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-chart-1 transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="text-center text-muted-foreground py-8"
                          >
                            Nenhum responsável atribuído a chamados ativos
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="throughput" className="mt-4">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">
                    Throughput - Abertos vs. Resolvidos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-4 mb-3 text-sm">
                      <div className="flex items-center gap-1">
                        <div className="h-3 w-3 rounded-sm bg-chart-1" />
                        <span className="text-muted-foreground">Abertos</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-3 w-3 rounded-sm bg-green-500" />
                        <span className="text-muted-foreground">Resolvidos</span>
                      </div>
                    </div>
                    <div className="flex items-end gap-[2px] h-40 w-full">
                      {data.throughput.map((d) => (
                        <div
                          key={d.date}
                          className="flex-1 flex flex-col items-center gap-[1px] min-w-0"
                          title={`${d.date}: ${d.opened} abertos, ${d.resolved} resolvidos`}
                          data-testid={`bar-throughput-${d.date}`}
                        >
                          <div className="w-full flex flex-col items-center gap-[1px] flex-1 justify-end">
                            <div
                              className="w-full bg-chart-1 rounded-t-sm min-h-0"
                              style={{
                                height: `${(d.opened / maxThroughput) * 100}%`,
                                minHeight: d.opened > 0 ? "2px" : 0,
                              }}
                            />
                            <div
                              className="w-full bg-green-500 rounded-t-sm min-h-0"
                              style={{
                                height: `${(d.resolved / maxThroughput) * 100}%`,
                                minHeight: d.resolved > 0 ? "2px" : 0,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-[2px] w-full mt-1">
                      {data.throughput.map((d, i) => {
                        const showLabel =
                          data.throughput.length <= 10 ||
                          i % Math.ceil(data.throughput.length / 10) === 0;
                        return (
                          <div
                            key={d.date}
                            className="flex-1 text-center min-w-0"
                          >
                            {showLabel && (
                              <span className="text-[10px] text-muted-foreground truncate block">
                                {d.date.slice(5)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="backlog" className="mt-4">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">
                    Backlog por Categoria
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-right">
                          Chamados Ativos
                        </TableHead>
                        <TableHead className="w-[30%]">Volume</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.backlogByCategory.length > 0 ? (
                        data.backlogByCategory.map((b, i) => {
                          const maxBacklog = Math.max(
                            ...data.backlogByCategory.map((x) => x.count),
                            1
                          );
                          const pct = (b.count / maxBacklog) * 100;
                          return (
                            <TableRow
                              key={`${b.categoryName}-${i}`}
                              data-testid={`row-backlog-${i}`}
                            >
                              <TableCell className="font-medium">
                                {b.categoryName}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">
                                  {b.categoryBranch}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {b.count}
                              </TableCell>
                              <TableCell>
                                <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-chart-2 transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="text-center text-muted-foreground py-8"
                          >
                            Nenhum chamado ativo no momento
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}
