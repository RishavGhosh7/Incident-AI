import type { Incident } from "../lib/api";
import { StatusBadge } from "./StatusBadge";

interface Props {
  incident: Incident | null;
  onToggleAction: (actionId: string) => void;
}

const STEP_LABELS: Record<string, string> = {
  queued: "Queued",
  collect_logs: "Collect logs",
  analyze_errors: "Analyze errors",
  identify_patterns: "Identify patterns",
  llm_diagnosis: "LLM diagnosis",
  generate_remediation: "Remediation plan",
  final_report: "Final report",
  update_state: "Update state",
};

export function IncidentPanel({ incident, onToggleAction }: Props) {
  if (!incident) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-[color:var(--color-muted)]">
        Incident panel will populate once you start an investigation.
      </div>
    );
  }

  const m = incident.metrics;
  const d = incident.diagnosis;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-[color:var(--color-muted)]">
            Incident #{incident.id}
          </p>
          <h2 className="text-xl font-semibold tracking-tight">{incident.service}</h2>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            {incident.alertText}
          </p>
        </div>
        <StatusBadge status={incident.status} />
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric
          label="5xx"
          value={m ? String(m.http5xxCount) : "—"}
          hint={m && m.http5xxCount > 0 ? "↑ errors" : undefined}
        />
        <Metric
          label="Latency"
          value={m?.latencyMsMax != null ? `${m.latencyMsMax}ms` : "—"}
          hint={m?.latencyMsMax && m.latencyMsMax > 1000 ? "↑ slow" : undefined}
        />
        <Metric
          label="DB pool"
          value={m?.connectionPoolPct != null ? `${m.connectionPoolPct}%` : "—"}
          hint={
            m?.connectionPoolPct && m.connectionPoolPct >= 90
              ? "↑ pressure"
              : undefined
          }
        />
        <Metric label="Errors" value={m ? String(m.errorCount) : "—"} />
      </section>

      {incident.workflowStep && (
        <section className="rounded border border-[color:var(--color-line)] bg-[color:var(--color-panel-2)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
            Workflow step
          </p>
          <p className="mt-1 text-sm text-[color:var(--color-accent)]">
            {STEP_LABELS[incident.workflowStep] ?? incident.workflowStep}
          </p>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
          AI diagnosis
        </h3>
        {d ? (
          <div className="rounded border border-[color:var(--color-line)] bg-[color:var(--color-panel-2)] p-3 space-y-2">
            <p className="text-base font-medium">{d.cause}</p>
            <p className="text-sm text-[color:var(--color-accent)]">
              Confidence: {Math.round(d.confidence * 100)}%
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-[color:var(--color-muted)]">
              {d.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-[color:var(--color-muted)]">
            Waiting for workflow diagnosis…
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
          Recommended actions
        </h3>
        {incident.remediation ? (
          <ul className="space-y-2">
            {incident.remediation.actions.map((a) => (
              <li key={a.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded border border-[color:var(--color-line)] bg-[color:var(--color-panel-2)] px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={a.done}
                    onChange={() => onToggleAction(a.id)}
                    className="mt-1 accent-[color:var(--color-accent)]"
                  />
                  <span className={a.done ? "line-through opacity-60" : ""}>
                    {a.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[color:var(--color-muted)]">No actions yet.</p>
        )}
      </section>

      {incident.reportMd && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
            Report
          </h3>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-[color:var(--color-line)] bg-[color:var(--color-ink)] p-3 font-mono text-[11px] leading-relaxed text-[color:var(--color-muted)]">
            {incident.reportMd}
          </pre>
        </section>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded border border-[color:var(--color-line)] bg-[color:var(--color-panel-2)] p-3">
      <p className="text-[10px] uppercase tracking-wide text-[color:var(--color-muted)]">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg font-semibold">{value}</p>
      {hint && (
        <p className="text-xs text-[color:var(--color-danger)]">{hint}</p>
      )}
    </div>
  );
}
