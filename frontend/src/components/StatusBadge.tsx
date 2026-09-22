import type { IncidentStatus } from "../lib/api";

const STYLES: Record<IncidentStatus, string> = {
  open: "bg-[color:var(--color-line)] text-[color:var(--color-muted)]",
  analyzing: "bg-[color:var(--color-accent-dim)] text-[color:var(--color-accent)]",
  diagnosed: "bg-[#2a3a1f] text-[color:var(--color-ok)]",
  resolved: "bg-[#1a2f45] text-[#8ec8ff]",
};

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${STYLES[status]}`}
    >
      {status === "analyzing" && (
        <span className="size-1.5 rounded-full bg-[color:var(--color-accent)] animate-pulse-dot" />
      )}
      {status}
    </span>
  );
}
