import { useState, useContext, createContext, useRef, useEffect } from "react";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}
import { PageContainer } from "@/components/page-container";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Puzzle,
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Code2,
  Globe,
  Play,
  Loader2,
  X,
  ArrowLeft,
  MessageSquare,
  Send,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ApiToken {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  revokedAt: string | null;
  createdByName: string | null;
}

// Base URL shown in docs — no /api suffix; each endpoint path starts with /api/...
const BASE_URL = window.location.origin;

// ── URL utilities ─────────────────────────────────────────────────────────
function normalizeBaseUrl(base: string): string {
  // Remove trailing slashes
  return base.replace(/\/+$/, "");
}

function normalizePath(path: string): string {
  // Ensure leading slash
  let p = path.startsWith("/") ? path : "/" + path;
  // Collapse /api/api → /api (happens when user puts /api in base URL)
  p = p.replace(/^\/api\/api(\/|$)/, "/api$1");
  return p;
}

function buildFinalUrl(
  base: string,
  path: string,
  pathParams: Record<string, string>,
  queryPairs: { k: string; v: string }[]
): string {
  let p = normalizePath(path);
  for (const [k, v] of Object.entries(pathParams)) {
    p = p.replace(`:${k}`, encodeURIComponent(v || `:${k}`));
  }
  const qs = queryPairs
    .filter((q) => q.k.trim())
    .map((q) => `${encodeURIComponent(q.k)}=${encodeURIComponent(q.v)}`)
    .join("&");
  return `${normalizeBaseUrl(base)}${p}${qs ? "?" + qs : ""}`;
}

// ── API Explorer types and context ────────────────────────────────────────
interface EndpointDef {
  method: string;
  path: string;
  desc: string;
  scope: "read" | "write";
  body?: string;
}

interface ExplorerContextValue {
  open: (def: EndpointDef) => void;
  tokens: ApiToken[];
}
const ExplorerContext = createContext<ExplorerContextValue | null>(null);

// ── API Explorer Dialog ───────────────────────────────────────────────────
function ApiExplorer({
  def,
  tokens,
  onClose,
}: {
  def: EndpointDef;
  tokens: ApiToken[];
  onClose: () => void;
}) {
  const defaultBaseUrl = window.location.origin;
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [token, setToken] = useState(tokens[0]?.id ?? "");
  const [customToken, setCustomToken] = useState("");
  const [pathParams, setPathParams] = useState<Record<string, string>>({});
  const [queryPairs, setQueryPairs] = useState<{ k: string; v: string }[]>([{ k: "", v: "" }]);
  const [body, setBody] = useState(def.body ?? "");
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    status: number;
    time: number;
    body: string;
    ok: boolean;
    isHtml?: boolean;
    url?: string;
  } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const paramNames = Array.from(new Set((def.path.match(/:(\w+)/g) ?? []).map((p) => p.slice(1))));
  const hasBody = ["POST", "PATCH", "PUT"].includes(def.method);

  const activeToken = customToken.trim() || (tokens.find((t) => t.id === token && !t.revokedAt)?.id ?? "");

  const buildUrl = () => buildFinalUrl(baseUrl, def.path, pathParams, queryPairs);

  const buildCurl = () => {
    const url = buildUrl();
    const bearerToken = customToken.trim() || (token ? `hub_<token-${token.slice(0, 6)}>` : "<token>");
    const parts = [`curl -X ${def.method} "${url}"`];
    parts.push(`  -H "Accept: application/json"`);
    parts.push(`  -H "Authorization: Bearer ${bearerToken}"`);
    if (hasBody && body.trim()) {
      parts.push(`  -H "Content-Type: application/json"`);
      parts.push(`  -d '${body.replace(/'/g, "'\\''")}'`);
    }
    return parts.join(" \\\n");
  };

  const handleSend = async () => {
    if (hasBody && body.trim()) {
      try { JSON.parse(body); setBodyError(null); }
      catch { setBodyError("JSON inválido"); return; }
    }
    setLoading(true);
    setResult(null);
    setSendError(null);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const start = Date.now();
    try {
      const url = buildUrl();
      const headers: Record<string, string> = { "Accept": "application/json" };
      const bearerToken = customToken.trim() || (token ? token : "");
      if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
      if (hasBody && body.trim()) headers["Content-Type"] = "application/json";
      const res = await fetch(url, {
        method: def.method,
        headers,
        body: hasBody && body.trim() ? body : undefined,
        signal: abortRef.current.signal,
        credentials: "include",
      });
      const time = Date.now() - start;
      const raw = await res.text();
      const contentType = res.headers.get("content-type") ?? "";
      const isHtml = contentType.includes("text/html") || raw.trimStart().startsWith("<!DOCTYPE");
      let pretty = raw;
      if (!isHtml) {
        try { pretty = JSON.stringify(JSON.parse(raw), null, 2); } catch (_) {}
      }
      setResult({ status: res.status, time, body: pretty, ok: res.ok && !isHtml, isHtml, url });
    } catch (e: any) {
      if (e.name !== "AbortError") setSendError(e.message ?? "Erro de rede");
    } finally {
      setLoading(false);
    }
  };

  const statusColor = result
    ? result.status < 300 ? "text-green-600 dark:text-green-400"
    : result.status < 500 ? "text-amber-600 dark:text-amber-400"
    : "text-red-600 dark:text-red-400"
    : "";

  return (
    <div className="flex flex-col gap-4">
      {/* Base URL */}
      <div className="space-y-1.5">
        <Label className="text-xs">Base URL <span className="text-muted-foreground font-normal">(sem /api — o path já inclui)</span></Label>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className="font-mono text-xs"
          placeholder="https://hub.41tech.cloud"
        />
      </div>

      {/* Token */}
      <div className="space-y-1.5">
        <Label className="text-xs">Token</Label>
        <div className="flex gap-2">
          {tokens.filter((t) => !t.revokedAt).length > 0 && (
            <select
              className="flex-1 rounded-md border bg-background px-3 py-2 text-xs"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            >
              <option value="">Selecionar token</option>
              {tokens.filter((t) => !t.revokedAt).map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.scopes.join(", ")})</option>
              ))}
            </select>
          )}
          <Input
            value={customToken}
            onChange={(e) => setCustomToken(e.target.value)}
            placeholder="Ou cole token manualmente"
            type="password"
            className="flex-1 font-mono text-xs"
          />
        </div>
      </div>

      {/* Path params */}
      {paramNames.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Parâmetros de rota</Label>
          <div className="space-y-1.5">
            {paramNames.map((name) => (
              <div key={name} className="flex items-center gap-2">
                <code className="w-24 shrink-0 text-xs text-muted-foreground font-mono">:{name}</code>
                <Input
                  value={pathParams[name] ?? ""}
                  onChange={(e) =>
                    setPathParams((p) => ({ ...p, [name]: e.target.value }))
                  }
                  placeholder={name}
                  className="text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Query params */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Query params</Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => setQueryPairs((p) => [...p, { k: "", v: "" }])}
          >
            + Adicionar
          </Button>
        </div>
        {queryPairs.map((pair, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={pair.k}
              onChange={(e) => setQueryPairs((p) => p.map((x, j) => j === i ? { ...x, k: e.target.value } : x))}
              placeholder="key"
              className="text-xs"
            />
            <span className="text-muted-foreground text-xs">=</span>
            <Input
              value={pair.v}
              onChange={(e) => setQueryPairs((p) => p.map((x, j) => j === i ? { ...x, v: e.target.value } : x))}
              placeholder="value"
              className="text-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setQueryPairs((p) => p.filter((_, j) => j !== i))}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Body */}
      {hasBody && (
        <div className="space-y-1.5">
          <Label className="text-xs">Body (JSON)</Label>
          <Textarea
            value={body}
            onChange={(e) => { setBody(e.target.value); setBodyError(null); }}
            rows={4}
            className="font-mono text-xs"
            placeholder='{ "key": "value" }'
          />
          {bodyError && <p className="text-xs text-destructive">{bodyError}</p>}
        </div>
      )}

      {/* URL preview */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Preview da URL final</Label>
        <div className="rounded-md bg-muted px-3 py-2 text-xs font-mono break-all text-muted-foreground flex items-start gap-2">
          <span className={`shrink-0 font-bold ${METHOD_COLORS[def.method] ?? ""} rounded px-1`}>{def.method}</span>
          <span className="text-foreground">{buildUrl()}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button onClick={handleSend} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Enviar
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        {result && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-xs"
            onClick={() => { navigator.clipboard.writeText(buildCurl()); }}
          >
            <Copy className="h-3 w-3 mr-1" />
            Copiar cURL
          </Button>
        )}
      </div>

      {/* Error */}
      {sendError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {sendError}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className={`text-sm font-bold ${statusColor}`}>{result.status}</span>
            <span className="text-xs text-muted-foreground">{result.time}ms</span>
          </div>
          {result.isHtml && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 space-y-1">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                Resposta HTML detectada — a URL caiu no fallback do SPA (rota inexistente na API).
              </p>
              <p className="text-xs text-muted-foreground">
                Verifique se a Base URL está correta (não inclua <code>/api</code> — o path já começa com <code>/api/...</code>).
              </p>
              {result.url && (
                <p className="text-xs font-mono break-all text-muted-foreground">
                  URL chamada: <span className="text-foreground">{result.url}</span>
                </p>
              )}
            </div>
          )}
          <ScrollArea className="h-56 rounded-md border">
            <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all">{result.isHtml ? "(HTML omitido — veja o aviso acima)" : result.body}</pre>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCopy}>
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative rounded-md bg-muted px-3 py-2.5 pr-10 text-xs font-mono whitespace-pre-wrap break-all">
      <div className="absolute top-1.5 right-1.5">
        <CopyButton text={code} />
      </div>
      {code}
    </div>
  );
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  POST: "bg-green-500/15 text-green-600 dark:text-green-400",
  PATCH: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  PUT: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  DELETE: "bg-red-500/15 text-red-600 dark:text-red-400",
};

function EndpointRow({
  method,
  path,
  desc,
  scope,
  queryParams,
  body,
  response,
}: {
  method: string;
  path: string;
  desc: string;
  scope: "read" | "write";
  queryParams?: string;
  body?: string;
  response?: string;
}) {
  const explorer = useContext(ExplorerContext);
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-mono font-bold min-w-[52px] text-center ${METHOD_COLORS[method] ?? ""}`}
        >
          {method}
        </span>
        <code className="text-xs font-mono text-foreground flex-1 min-w-0 break-all">{path}</code>
        <Badge variant={scope === "write" ? "default" : "secondary"} className="text-xs shrink-0">
          {scope}
        </Badge>
        {explorer && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs px-2 gap-1 shrink-0"
            onClick={() => explorer.open({ method, path, desc, scope, body })}
          >
            <Play className="h-3 w-3" />
            Testar
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{desc}</p>
      {queryParams && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Query params:</span> {queryParams}
        </p>
      )}
      {body && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground font-medium">Body (JSON)</summary>
          <pre className="mt-1 rounded bg-muted p-2 text-xs font-mono whitespace-pre-wrap break-all">{body}</pre>
        </details>
      )}
      {response && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground font-medium">Resposta (exemplo)</summary>
          <pre className="mt-1 rounded bg-muted p-2 text-xs font-mono whitespace-pre-wrap break-all">{response}</pre>
        </details>
      )}
    </div>
  );
}

function EndpointGroup({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className={`px-4 py-2.5 border-b ${color}`}>
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
      </div>
      <div className="divide-y">{children}</div>
    </Card>
  );
}

// ── Slack Settings Panel ─────────────────────────────────────────────────────

function SlackSettingsPanel() {
  const { toast } = useToast();
  const [techUrl, setTechUrl] = useState("");
  const [grupo41Url, setGrupo41Url] = useState("");

  const { isLoading } = useQuery({
    queryKey: ["/api/admin/settings/slack"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/settings/slack");
      return res.json();
    },
    onSuccess: (data: any) => {
      setTechUrl(data.webhookTech ?? "");
      setGrupo41Url(data.webhookGrupo41 ?? "");
    },
  } as any);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/admin/settings/slack", {
        webhookTech: techUrl,
        webhookGrupo41: grupo41Url,
      });
      if (!res.ok) throw new Error("Falha ao salvar");
    },
    onSuccess: () => {
      toast({ title: "Configurações salvas", description: "Webhooks Slack atualizados." });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const sendMetricsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/slack/send-weekly-metrics", {});
      if (!res.ok) throw new Error("Falha ao enviar");
    },
    onSuccess: () => toast({ title: "Enviado", description: "Relatório semanal enviado ao #41-tech." }),
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const sendTypingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/slack/send-monthly-typing", {});
      if (!res.ok) throw new Error("Falha ao enviar");
    },
    onSuccess: () => toast({ title: "Enviado", description: "Ranking de digitação enviado ao #grupo-41." }),
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            Webhooks Slack
          </CardTitle>
          <CardDescription>
            Configure os Incoming Webhooks para que o sistema envie notificações automáticas aos canais do Slack.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="slack-tech">URL do canal #41-tech</Label>
            <Input
              id="slack-tech"
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={techUrl}
              onChange={(e) => setTechUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Recebe notificações de solicitações de reabertura e relatórios semanais.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slack-grupo41">URL do canal #grupo-41</Label>
            <Input
              id="slack-grupo41"
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={grupo41Url}
              onChange={(e) => setGrupo41Url(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Recebe o ranking mensal de digitação.
            </p>
          </div>

          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            size="sm"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar webhooks
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-muted-foreground" />
            Envio manual
          </CardTitle>
          <CardDescription>
            Acione relatórios manualmente para testar a integração ou cobrir envios perdidos.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendMetricsMutation.mutate()}
            disabled={sendMetricsMutation.isPending || !techUrl}
          >
            {sendMetricsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Enviar métricas semanais → #41-tech
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendTypingMutation.mutate()}
            disabled={sendTypingMutation.isPending || !grupo41Url}
          >
            {sendTypingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Enviar ranking digitação → #grupo-41
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminIntegrations() {
  const { toast } = useToast();
  const isDesktop = useIsDesktop();
  const [createOpen, setCreateOpen] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenScope, setNewTokenScope] = useState("read");
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [explorerDef, setExplorerDef] = useState<EndpointDef | null>(null);

  const { data: tokens = [], isLoading } = useQuery<ApiToken[]>({
    queryKey: ["/api/admin/integrations/tokens"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; scopes: string[] }) =>
      apiRequest("POST", "/api/admin/integrations/tokens", data),
    onSuccess: async (res) => {
      const data = await res.json();
      setGeneratedToken(data.token);
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/tokens"] });
      toast({ title: "Token criado — copie antes de fechar!" });
    },
    onError: () => toast({ title: "Erro ao criar token", variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/integrations/tokens/${id}`),
    onSuccess: () => {
      toast({ title: "Token revogado" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/tokens"] });
    },
    onError: () => toast({ title: "Erro ao revogar token", variant: "destructive" }),
  });

  const activeTokens = tokens.filter((t) => !t.revokedAt);
  const revokedTokens = tokens.filter((t) => t.revokedAt);

  return (
    <PageContainer className="flex flex-col gap-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
          <Puzzle className="h-5 w-5 text-violet-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Integrações</h1>
          <p className="text-sm text-muted-foreground">
            API REST, Tokens e Webhooks para integrações externas
          </p>
        </div>
      </div>

      <Tabs defaultValue="tokens">
        <TabsList>
          <TabsTrigger value="tokens">
            <Key className="h-4 w-4 mr-2" />
            API Tokens
          </TabsTrigger>
          <TabsTrigger value="docs">
            <Code2 className="h-4 w-4 mr-2" />
            Documentação
          </TabsTrigger>
          <TabsTrigger value="slack">
            <MessageSquare className="h-4 w-4 mr-2" />
            Slack
          </TabsTrigger>
        </TabsList>

        {/* ===== TOKENS TAB ===== */}
        <TabsContent value="tokens" className="space-y-4 mt-4">
          {/* Generated token banner */}
          {generatedToken && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Token gerado — copie agora, não será exibido novamente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                    {showToken ? generatedToken : "•".repeat(Math.min(generatedToken.length, 40))}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowToken((s) => !s)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <CopyButton text={generatedToken} />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGeneratedToken(null)}
                >
                  Fechar
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Tokens ativos</h2>
              <p className="text-xs text-muted-foreground">
                Tokens de API para integração com sistemas externos
              </p>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo token
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : activeTokens.length === 0 ? (
            <div className="rounded-xl border bg-card">
              <EmptyState
                icon={Key}
                title="Nenhum token ativo"
                description="Crie um token para integrar sistemas externos."
                action={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Novo token</Button>}
              />
            </div>
          ) : (
            <div className="space-y-2">
              {activeTokens.map((token) => (
                <Card key={token.id}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 shrink-0">
                      <Key className="h-4 w-4 text-violet-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{token.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {token.scopes.map((s) => (
                          <Badge key={s} variant="secondary" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      <p>
                        {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
                          new Date(token.createdAt)
                        )}
                      </p>
                      {token.createdByName && <p>por {token.createdByName}</p>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                      onClick={() => setRevokeId(token.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {revokedTokens.length > 0 && (
            <>
              <Separator />
              <p className="text-sm font-medium text-muted-foreground">
                Tokens revogados ({revokedTokens.length})
              </p>
              <div className="space-y-2 opacity-60">
                {revokedTokens.map((token) => (
                  <Card key={token.id}>
                    <CardContent className="flex items-center gap-4 p-3">
                      <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm line-through text-muted-foreground">
                          {token.name}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground shrink-0">
                        Revogado em{" "}
                        {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
                          new Date(token.revokedAt!)
                        )}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ===== DOCS TAB ===== */}
        <TabsContent value="docs" className="mt-4">
        <ExplorerContext.Provider value={{ open: setExplorerDef, tokens }}>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
        <div className="space-y-4">
          {/* Base URL + Auth */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Base URL
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                    {BASE_URL}
                  </code>
                  <CopyButton text={BASE_URL} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Autenticação</CardTitle>
                <CardDescription>Header obrigatório em todas as requisições</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <CodeBlock code={`Authorization: Bearer hub_<token>`} />
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="secondary">read</Badge>
                    <span className="text-muted-foreground">somente leitura</span>
                  </div>
                  <span className="text-muted-foreground">·</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="secondary">write</Badge>
                    <span className="text-muted-foreground">leitura e escrita</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resources */}
          <EndpointGroup title="Recursos (Resources)" color="bg-blue-500/10 text-blue-500">
            <EndpointRow method="GET" path="/api/resources" desc="Lista recursos visíveis ao usuário autenticado" scope="read"
              response={`[{ "id": "uuid", "name": "App X", "type": "APP", "url": "https://...", "healthStatus": "UP", "tags": [] }]`} />
            <EndpointRow method="GET" path="/api/admin/resources" desc="Lista todos os recursos (admin)" scope="read"
              response={`[{ "id": "uuid", "name": "App X", "type": "APP|DASHBOARD", "isActive": true }]`} />
            <EndpointRow method="POST" path="/api/admin/resources" desc="Cria recurso" scope="write"
              body={`{ "name": "string", "type": "APP|DASHBOARD", "url": "string", "sectorId": "uuid", "embedMode": "LINK|IFRAME|POWERBI" }`} />
            <EndpointRow method="PATCH" path="/api/admin/resources/:id" desc="Atualiza recurso" scope="write"
              body={`{ "name": "string", "isActive": true }`} />
            <EndpointRow method="DELETE" path="/api/admin/resources/:id" desc="Remove recurso" scope="write" />
          </EndpointGroup>

          {/* Tickets */}
          <EndpointGroup title="Chamados (Tickets)" color="bg-amber-500/10 text-amber-500">
            <EndpointRow method="GET" path="/api/tickets" desc="Lista chamados do usuário (abertos e históricos)" scope="read"
              queryParams="status, priority, from, to"
              response={`[{ "id": "uuid", "title": "string", "status": "ABERTO|EM_ANDAMENTO|RESOLVIDO|CANCELADO", "priority": "BAIXA|MEDIA|ALTA|URGENTE" }]`} />
            <EndpointRow method="GET" path="/api/tickets/:id" desc="Detalhe de um chamado" scope="read" />
            <EndpointRow method="POST" path="/api/tickets" desc="Abre novo chamado" scope="write"
              body={`{ "title": "string", "description": "string", "categoryId": "uuid", "priority": "MEDIA" }`} />
            <EndpointRow method="PATCH" path="/api/tickets/:id" desc="Atualiza status / prioridade (assignee ou admin)" scope="write"
              body={`{ "status": "EM_ANDAMENTO", "priority": "ALTA" }`} />
          </EndpointGroup>

          {/* Ticket Comments */}
          <EndpointGroup title="Comentários de Chamado" color="bg-purple-500/10 text-purple-500">
            <EndpointRow method="GET" path="/api/tickets/:id/comments" desc="Lista comentários do chamado" scope="read" />
            <EndpointRow method="POST" path="/api/tickets/:id/comments" desc="Adiciona comentário" scope="write"
              body={`{ "body": "string", "isInternal": false }`} />
          </EndpointGroup>

          {/* Ticket Categories */}
          <EndpointGroup title="Categorias de Chamado" color="bg-green-500/10 text-green-500">
            <EndpointRow method="GET" path="/api/tickets/categories" desc="Árvore de categorias (branch → serviço)" scope="read"
              response={`[{ "id": "uuid", "name": "string", "branch": "string", "parentId": null }]`} />
          </EndpointGroup>

          {/* Alerts */}
          <EndpointGroup title="Alertas (System Alerts)" color="bg-red-500/10 text-red-500">
            <EndpointRow method="GET" path="/api/alerts" desc="Alertas ativos para o usuário (inclui isRead)" scope="read"
              queryParams="active=true|false"
              response={`[{ "id": "uuid", "title": "string", "message": "string", "severity": "info|warning|critical", "isRead": false }]`} />
            <EndpointRow method="POST" path="/api/alerts/:id/read" desc="Marca alerta como lido" scope="write" />
            <EndpointRow method="POST" path="/api/admin/alerts" desc="Cria alerta (admin)" scope="write"
              body={`{ "title": "string", "message": "string", "severity": "info|warning|critical", "isActive": true }`} />
            <EndpointRow method="PATCH" path="/api/admin/alerts/:id" desc="Atualiza alerta (admin)" scope="write" />
            <EndpointRow method="DELETE" path="/api/admin/alerts/:id" desc="Remove alerta (admin)" scope="write" />
          </EndpointGroup>

          {/* Notifications */}
          <EndpointGroup title="Notificações" color="bg-sky-500/10 text-sky-500">
            <EndpointRow method="GET" path="/api/notifications" desc="Lista notificações do usuário" scope="read"
              response={`[{ "id": "uuid", "type": "alert|ticket|...", "title": "string", "isRead": false }]`} />
            <EndpointRow method="POST" path="/api/notifications/:id/read" desc="Marca notificação como lida" scope="write" />
            <EndpointRow method="POST" path="/api/notifications/read-all" desc="Marca todas como lidas" scope="write" />
          </EndpointGroup>

          {/* KB Articles */}
          <EndpointGroup title="Base de Conhecimento (KB)" color="bg-chart-1/10 text-chart-1">
            <EndpointRow method="GET" path="/api/kb" desc="Lista artigos publicados" scope="read"
              queryParams="q (busca), categoryId, tags"
              response={`[{ "id": "uuid", "title": "string", "body": "markdown", "categoryName": "string", "viewCount": 0 }]`} />
            <EndpointRow method="GET" path="/api/kb/:id" desc="Artigo completo (registra visualização)" scope="read" />
            <EndpointRow method="POST" path="/api/kb/:id/feedback" desc="Envia feedback de utilidade" scope="write"
              body={`{ "helpful": true }`} />
            <EndpointRow method="GET" path="/api/admin/kb" desc="Lista todos (admin, inclui rascunhos)" scope="read" />
            <EndpointRow method="POST" path="/api/admin/kb" desc="Cria artigo (admin)" scope="write"
              body={`{ "title": "string", "body": "markdown", "categoryId": "uuid", "isPublished": true }`} />
            <EndpointRow method="PATCH" path="/api/admin/kb/:id" desc="Atualiza artigo (admin)" scope="write" />
            <EndpointRow method="DELETE" path="/api/admin/kb/:id" desc="Remove artigo (admin)" scope="write" />
          </EndpointGroup>

          {/* Users */}
          <EndpointGroup title="Usuários (Users)" color="bg-indigo-500/10 text-indigo-500">
            <EndpointRow method="GET" path="/api/auth/me" desc="Retorna dados do usuário autenticado (sessão atual)" scope="read"
              response={`{ "id": "uuid", "name": "João Silva", "email": "joao@41tech.cloud", "isAdmin": false, "roles": [{ "roleName": "Coordenador", "sectorId": "uuid", "sectorName": "TI" }] }`} />
            <EndpointRow method="GET" path="/api/admin/users" desc="Lista todos os usuários (admin)" scope="read"
              queryParams="q (busca por nome/email), sectorId, limit, page"
              response={`[{ "id": "uuid", "name": "string", "email": "string", "isAdmin": false, "isActive": true, "roles": [] }]`} />
            <EndpointRow method="POST" path="/api/admin/users" desc="Cria usuário local (admin)" scope="write"
              body={`{ "name": "string", "email": "string", "password": "string", "isAdmin": false }`}
              response={`{ "id": "uuid", "name": "string", "email": "string", "isAdmin": false }`} />
            <EndpointRow method="PATCH" path="/api/admin/users/:id" desc="Atualiza dados do usuário (admin)" scope="write"
              body={`{ "name": "string", "isAdmin": false, "isActive": true }`} />
            <EndpointRow method="DELETE" path="/api/admin/users/:id" desc="Remove usuário (admin)" scope="write" />
          </EndpointGroup>

          {/* Audit Logs */}
          <EndpointGroup title="Logs de Auditoria" color="bg-slate-500/10 text-slate-500">
            <EndpointRow method="GET" path="/api/admin/audit" desc="Lista logs de auditoria (admin)" scope="read"
              queryParams="limit, page, from, to"
              response={`[{ "id": "uuid", "action": "resource_create", "actorName": "string", "targetType": "string", "targetId": "uuid", "ip": "string" }]`} />
          </EndpointGroup>

          {/* Reports */}
          <EndpointGroup title="Relatórios (Reports)" color="bg-emerald-500/10 text-emerald-500">
            <EndpointRow method="GET" path="/api/admin/reports/tickets" desc="Exporta chamados (admin)" scope="read"
              queryParams="format=csv|json, from=YYYY-MM-DD, to=YYYY-MM-DD" />
            <EndpointRow method="GET" path="/api/admin/reports/resources" desc="Exporta recursos (admin)" scope="read"
              queryParams="format=csv|json, includeInactive=true" />
            <EndpointRow method="GET" path="/api/admin/reports/users" desc="Exporta usuários (admin)" scope="read"
              queryParams="format=csv|json" />
            <EndpointRow method="GET" path="/api/admin/reports/typing" desc="Exporta sessões de digitação (admin)" scope="read"
              queryParams="format=csv|json" />
          </EndpointGroup>

          {/* Error codes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Códigos de Erro</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 text-xs">
                {[
                  ["400", "Bad Request", "Dados inválidos no body/query"],
                  ["401", "Unauthorized", "Token ausente ou inválido"],
                  ["403", "Forbidden", "Escopo insuficiente (read vs write) ou não é admin"],
                  ["404", "Not Found", "Recurso não encontrado"],
                  ["503", "Service Unavailable", "Tabela/coluna ausente no banco — execute as migrations"],
                  ["500", "Internal Server Error", "Erro inesperado no servidor"],
                ].map(([code, label, desc]) => (
                  <div key={code} className="flex items-start gap-3">
                    <Badge variant={code === "500" || code === "503" ? "destructive" : "outline"} className="shrink-0 font-mono">
                      {code}
                    </Badge>
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Webhook payload */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Webhooks</CardTitle>
              <CardDescription>
                Configure em Admin → Config. Chamados → Integrações para receber eventos em tempo real.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock
                code={`POST <sua_url>  HTTP/1.1
Content-Type: application/json
X-Hub-Event: ticket_created

{
  "event": "ticket_created",
  "timestamp": "2026-04-16T14:00:00.000Z",
  "data": {
    "ticketId": "uuid",
    "title": "Problema com acesso",
    "status": "ABERTO",
    "priority": "ALTA"
  }
}`}
              />
            </CardContent>
          </Card>
        </div>{/* end left col */}

          {/* RIGHT: Sticky explorer (desktop only) */}
          <div className="hidden lg:block">
            <div className="sticky top-6">
              <Card className="overflow-hidden">
                <div className={`px-4 py-3 border-b flex items-center gap-2 min-h-[48px] ${explorerDef ? "bg-muted/50" : ""}`}>
                  {explorerDef ? (
                    <>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-mono font-bold min-w-[52px] text-center shrink-0 ${METHOD_COLORS[explorerDef.method] ?? ""}`}>
                        {explorerDef.method}
                      </span>
                      <code className="text-xs font-mono text-foreground truncate flex-1">{explorerDef.path}</code>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setExplorerDef(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Play className="h-4 w-4" />
                      Explorador de API
                    </span>
                  )}
                </div>
                <CardContent className="p-4 max-h-[calc(100vh-16rem)] overflow-y-auto">
                  {explorerDef ? (
                    <ApiExplorer
                      def={explorerDef}
                      tokens={tokens}
                      onClose={() => setExplorerDef(null)}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                        <Play className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Nenhum endpoint selecionado</p>
                      <p className="text-xs text-muted-foreground mt-1">Clique em "Testar" em qualquer endpoint</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

        </div>{/* end grid */}
        </ExplorerContext.Provider>
        </TabsContent>

        {/* ===== SLACK TAB ===== */}
        <TabsContent value="slack" className="mt-4">
          <SlackSettingsPanel />
        </TabsContent>
      </Tabs>

      {/* API Explorer Dialog — mobile only */}
        <Dialog open={explorerDef !== null && !isDesktop} onOpenChange={(o) => !o && setExplorerDef(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Play className="h-4 w-4" />
                Testar endpoint
                {explorerDef && (
                  <span className={`rounded-md px-2 py-0.5 text-xs font-mono font-bold ${METHOD_COLORS[explorerDef.method] ?? ""}`}>
                    {explorerDef.method}
                  </span>
                )}
                {explorerDef && (
                  <code className="text-xs font-mono text-muted-foreground">{explorerDef.path}</code>
                )}
              </DialogTitle>
            </DialogHeader>
            {explorerDef && (
              <ApiExplorer
                def={explorerDef}
                tokens={tokens}
                onClose={() => setExplorerDef(null)}
              />
            )}
          </DialogContent>
        </Dialog>

      {/* Create Token Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo token de API</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome do token</Label>
              <Input
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                placeholder="Ex: n8n-integration, slack-bot"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Escopo</Label>
              <Select value={newTokenScope} onValueChange={setNewTokenScope}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">read — somente leitura</SelectItem>
                  <SelectItem value="write">write — leitura e escrita</SelectItem>
                  <SelectItem value="ops">ops — 41 Ops Center (n8n)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              O token será exibido <strong>uma única vez</strong> após a criação. Guarde-o em
              local seguro.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                createMutation.mutate({
                  name: newTokenName,
                  scopes: [newTokenScope],
                })
              }
              disabled={!newTokenName.trim() || createMutation.isPending}
            >
              Gerar token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirm Dialog */}
      <AlertDialog
        open={revokeId !== null}
        onOpenChange={(o) => !o && setRevokeId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar token?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Qualquer integração usando este token parará de
              funcionar imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (revokeId) revokeMutation.mutate(revokeId);
                setRevokeId(null);
              }}
            >
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
