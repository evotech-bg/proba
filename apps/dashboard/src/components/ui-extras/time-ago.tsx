import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

/**
 * Renders a relative time string ("3 minutes ago") only after mount so the
 * SSR output and the client output can never disagree. During SSR / first
 * paint we emit a placeholder span with `suppressHydrationWarning` so React
 * doesn't trip the hydration mismatch path (which detaches event handlers).
 */
export function TimeAgo({
  date,
  addSuffix = true,
  className,
}: {
  date: string | number | Date;
  addSuffix?: boolean;
  className?: string;
}) {
  const [text, setText] = useState<string>("");
  useEffect(() => {
    const update = () => {
      const d = new Date(date);
      setText(date && !Number.isNaN(d.getTime()) ? formatDistanceToNow(d, { addSuffix }) : "—");
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [date, addSuffix]);
  const valid = date && !Number.isNaN(new Date(date).getTime());
  return (
    <span className={className} suppressHydrationWarning>
      {!valid ? "—" : text || "…"}
    </span>
  );
}
