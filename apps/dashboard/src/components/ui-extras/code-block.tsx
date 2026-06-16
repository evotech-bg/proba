import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Lang = "gherkin" | "json" | "ts" | "sql";

function highlight(code: string, lang: Lang): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  let h = esc(code);

  if (lang === "gherkin") {
    h = h.replace(/^(#.*)$/gm, '<span class="tok-com">$1</span>');
    h = h.replace(/\b(Feature|Scenario|Background|Given|When|Then|And|But|Examples)\b/g, '<span class="tok-kw">$1</span>');
    h = h.replace(/(@\w+)/g, '<span class="tok-tag">$1</span>');
    h = h.replace(/("[^"]*")/g, '<span class="tok-str">$1</span>');
  } else if (lang === "json") {
    h = h.replace(/("(?:\\.|[^"\\])*")(\s*:)/g, '<span class="tok-prop">$1</span>$2');
    h = h.replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <span class="tok-str">$1</span>');
    h = h.replace(/\b(true|false|null)\b/g, '<span class="tok-kw">$1</span>');
    h = h.replace(/\b(-?\d+\.?\d*)\b/g, '<span class="tok-num">$1</span>');
  } else if (lang === "ts") {
    h = h.replace(/(\/\/.*)$/gm, '<span class="tok-com">$1</span>');
    h = h.replace(/\b(import|from|const|let|var|async|await|function|return|if|else|for|while|export|new|class|extends|test|expect)\b/g, '<span class="tok-kw">$1</span>');
    h = h.replace(/(`[^`]*`|"[^"]*"|'[^']*')/g, '<span class="tok-str">$1</span>');
    h = h.replace(/\b(\w+)(?=\()/g, '<span class="tok-fn">$1</span>');
  } else if (lang === "sql") {
    h = h.replace(/\b(select|from|where|insert|update|delete|join|on|and|or|not|in|values)\b/gi, '<span class="tok-kw">$1</span>');
  }
  return h;
}

export function CodeBlock({
  code, lang, className, pulse = false,
}: { code: string; lang: Lang; className?: string; pulse?: boolean }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className={cn("relative group rounded-md bg-panel ring-1 ring-hairline overflow-hidden", className)}>
      <div className="flex items-center justify-between px-3 py-1.5 hairline-b">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{lang}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-60 group-hover:opacity-100" onClick={onCopy} aria-label="Copy code">
          {copied ? <Check className="h-3 w-3 text-pass" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      <pre
        className={cn("text-[12px] leading-relaxed font-mono px-3 py-3 overflow-auto", pulse && "regen-pulse")}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: highlight(code, lang) }}
      />
    </div>
  );
}
