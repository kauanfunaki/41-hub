import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Safe Markdown renderer for KB articles and previews.
 *
 * Uses react-markdown (does NOT render raw HTML by default, so no XSS) plus
 * remark-gfm for GitHub-flavored features: tables, strikethrough, task lists
 * and autolinks. Styling comes from the @tailwindcss/typography `prose` plugin.
 */
export function MarkdownContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "prose-pre:bg-muted prose-pre:text-foreground prose-pre:border",
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-table:my-2 prose-th:border prose-th:border-border prose-td:border prose-td:border-border",
        "prose-th:px-3 prose-th:py-1.5 prose-td:px-3 prose-td:py-1.5 prose-th:bg-muted/50",
        "prose-blockquote:border-l-primary/40 prose-a:text-primary",
        className,
      )}
      data-testid="markdown-content"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
