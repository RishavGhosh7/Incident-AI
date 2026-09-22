import type { ScenarioSummary } from "../lib/api";

interface Props {
  logs: string;
  onLogsChange: (value: string) => void;
  scenarios: ScenarioSummary[];
  onLoadScenario: (id: string) => void;
  onInvestigate: () => void;
  busy: boolean;
}

export function LogInput({
  logs,
  onLogsChange,
  scenarios,
  onLoadScenario,
  onInvestigate,
  busy,
}: Props) {
  return (
    <div className="space-y-3 border-b border-[color:var(--color-line)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-[color:var(--color-muted)] uppercase">
          Logs / alert input
        </h2>
        <button
          type="button"
          disabled={busy || !logs.trim()}
          onClick={onInvestigate}
          className="rounded bg-[color:var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-[color:var(--color-ink)] transition enabled:hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Starting…" : "Investigate"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={busy}
            onClick={() => onLoadScenario(s.id)}
            className="rounded border border-[color:var(--color-line)] bg-[color:var(--color-panel-2)] px-2.5 py-1 text-xs text-[color:var(--color-text)] transition hover:border-[color:var(--color-accent)]"
            title={s.alertText}
          >
            {s.title}
          </button>
        ))}
      </div>

      <textarea
        value={logs}
        onChange={(e) => onLogsChange(e.target.value)}
        placeholder="Paste synthetic application logs here, or load a demo scenario…"
        rows={7}
        className="w-full resize-y rounded border border-[color:var(--color-line)] bg-[color:var(--color-ink)] p-3 font-mono text-xs leading-relaxed text-[color:var(--color-text)] outline-none focus:border-[color:var(--color-accent)]"
      />
    </div>
  );
}
