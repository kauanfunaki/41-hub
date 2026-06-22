import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MessageSquarePlus, CheckCircle2, Bug, Lightbulb, Wrench, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type FeedbackType = "BUG" | "SUGESTAO" | "MELHORIA" | "OUTRO";

const TYPE_OPTIONS: Array<{
  value: FeedbackType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  activeColor: string;
}> = [
  {
    value: "BUG",
    label: "Bug",
    description: "Algo está funcionando errado",
    icon: Bug,
    color: "border-red-300 dark:border-red-700",
    activeColor: "border-red-500 bg-red-500/5 text-red-700 dark:text-red-400",
  },
  {
    value: "SUGESTAO",
    label: "Sugestão",
    description: "Uma ideia para o portal",
    icon: Lightbulb,
    color: "border-amber-300 dark:border-amber-700",
    activeColor: "border-amber-500 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  },
  {
    value: "MELHORIA",
    label: "Melhoria",
    description: "Aperfeiçoar algo existente",
    icon: Wrench,
    color: "border-blue-300 dark:border-blue-700",
    activeColor: "border-blue-500 bg-blue-500/5 text-blue-700 dark:text-blue-400",
  },
  {
    value: "OUTRO",
    label: "Outro",
    description: "Qualquer outra mensagem",
    icon: HelpCircle,
    color: "border-slate-300 dark:border-slate-700",
    activeColor: "border-slate-500 bg-slate-500/5 text-slate-700 dark:text-slate-400",
  },
];

export default function FeedbackPage() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [type, setType] = useState<FeedbackType>("SUGESTAO");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/feedback", { type, title, message });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao enviar feedback");
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err: any) => {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    },
  });

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <div className="space-y-1.5 max-w-sm">
          <h2 className="text-xl font-semibold">Feedback enviado!</h2>
          <p className="text-sm text-muted-foreground">
            Obrigado pela contribuição. Sua mensagem foi recebida e será analisada pela equipe.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setSubmitted(false);
            setTitle("");
            setMessage("");
            setType("SUGESTAO");
          }}
        >
          Enviar outro feedback
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
          <MessageSquarePlus className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Feedback</h1>
          <p className="text-sm text-muted-foreground">
            Ajude a melhorar o portal reportando bugs ou sugerindo melhorias
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/30">
          <p className="text-sm font-semibold">Enviar feedback</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Tipo */}
          <div className="space-y-2">
            <Label>Tipo de feedback</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = type === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-center transition-all",
                      isActive ? opt.activeColor : "border-border hover:border-muted-foreground/40 hover:bg-muted/40"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", isActive ? "" : "text-muted-foreground")} />
                    <span className={cn("text-xs font-medium", isActive ? "" : "text-muted-foreground")}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Título */}
          <div className="space-y-2">
            <Label htmlFor="fb-title">
              Título <span className="text-destructive">*</span>
            </Label>
            <Input
              id="fb-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Descreva brevemente..."
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground text-right">{title.length}/200</p>
          </div>

          {/* Mensagem */}
          <div className="space-y-2">
            <Label htmlFor="fb-message">
              Mensagem <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="fb-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Descreva com detalhes o que aconteceu ou o que você gostaria de ver no portal..."
              rows={5}
            />
          </div>

          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !title.trim() || !message.trim()}
            className="w-full sm:w-auto"
          >
            {mutation.isPending ? "Enviando..." : "Enviar feedback"}
          </Button>
        </div>
      </div>
    </div>
  );
}
