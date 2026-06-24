import { useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/markdown-content";
import {
  Bold,
  Italic,
  Code,
  SquareCode,
  Link2,
  List,
  ListOrdered,
  Quote,
  Heading,
  Table as TableIcon,
} from "lucide-react";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  id?: string;
  "data-testid"?: string;
}

/**
 * Markdown editor with a formatting toolbar and a live preview tab.
 * Supports bold, italic, inline code, code blocks, links, lists, blockquotes,
 * headings and GFM tables. Rendering is delegated to <MarkdownContent>.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 12,
  id,
  ...rest
}: MarkdownEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");

  function apply(
    transform: (selected: string) => { text: string; selStart?: number; selEnd?: number },
  ) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const { text, selStart, selEnd } = transform(selected);
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + (selStart ?? 0), start + (selEnd ?? text.length));
    });
  }

  const wrap = (before: string, after = before, ph = "texto") =>
    apply((sel) => {
      const inner = sel || ph;
      return { text: `${before}${inner}${after}`, selStart: before.length, selEnd: before.length + inner.length };
    });

  const linePrefix = (prefix: string, ph = "item") =>
    apply((sel) => {
      const body = sel || ph;
      const text = body.split("\n").map((line) => `${prefix}${line}`).join("\n");
      return { text, selStart: 0, selEnd: text.length };
    });

  const block = (snippet: string) => apply(() => ({ text: snippet, selStart: 0, selEnd: snippet.length }));

  const link = () =>
    apply((sel) => {
      const label = sel || "texto";
      const text = `[${label}](https://)`;
      // place cursor inside the empty URL
      return { text, selStart: text.length - 1, selEnd: text.length - 1 };
    });

  const tableSnippet = "\n| Coluna 1 | Coluna 2 |\n| --- | --- |\n| Célula | Célula |\n";
  const codeBlockSnippet = "\n```\ncódigo\n```\n";

  const tools = [
    { icon: Bold, title: "Negrito", onClick: () => wrap("**") },
    { icon: Italic, title: "Itálico", onClick: () => wrap("*") },
    { icon: Heading, title: "Título", onClick: () => linePrefix("## ", "Título") },
    { icon: Code, title: "Código inline", onClick: () => wrap("`", "`", "código") },
    { icon: SquareCode, title: "Bloco de código", onClick: () => block(codeBlockSnippet) },
    { icon: Link2, title: "Link", onClick: link },
    { icon: List, title: "Lista", onClick: () => linePrefix("- ") },
    { icon: ListOrdered, title: "Lista numerada", onClick: () => linePrefix("1. ") },
    { icon: Quote, title: "Citação", onClick: () => linePrefix("> ") },
    { icon: TableIcon, title: "Tabela", onClick: () => block(tableSnippet) },
  ];

  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-2 py-1">
        <div className="flex items-center gap-0.5 flex-wrap">
          {tab === "write" &&
            tools.map((t) => (
              <Button
                key={t.title}
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title={t.title}
                onClick={t.onClick}
                data-testid={`md-tool-${t.title}`}
              >
                <t.icon className="h-3.5 w-3.5" />
              </Button>
            ))}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            type="button"
            variant={tab === "write" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setTab("write")}
            data-testid="md-tab-write"
          >
            Escrever
          </Button>
          <Button
            type="button"
            variant={tab === "preview" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setTab("preview")}
            data-testid="md-tab-preview"
          >
            Visualizar
          </Button>
        </div>
      </div>

      {tab === "write" ? (
        <Textarea
          ref={ref}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-y font-mono text-sm"
          {...rest}
        />
      ) : (
        <div className="px-4 py-3 min-h-[200px]">
          {value.trim() ? (
            <MarkdownContent content={value} />
          ) : (
            <p className="text-sm text-muted-foreground">Nada para visualizar.</p>
          )}
        </div>
      )}

      <div className="border-t bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
        Markdown suportado: **negrito**, *itálico*, `código`, listas, tabelas, citações, links e blocos de código.
      </div>
    </div>
  );
}
