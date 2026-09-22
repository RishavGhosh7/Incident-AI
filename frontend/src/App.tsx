import { useCallback, useEffect, useState } from "react";
import { Chat } from "./components/Chat";
import { IncidentPanel } from "./components/IncidentPanel";
import { LogInput } from "./components/LogInput";
import {
  createIncident,
  getIncident,
  listScenarios,
  streamChat,
  toggleAction,
  type Incident,
  type ScenarioSummary,
} from "./lib/api";

export default function App() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [logs, setLogs] = useState("");
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [busy, setBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listScenarios()
      .then(setScenarios)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!incident) return;
    if (incident.status === "diagnosed" || incident.status === "resolved") return;

    const timer = setInterval(() => {
      getIncident(incident.id)
        .then(setIncident)
        .catch(() => undefined);
    }, 1500);

    return () => clearInterval(timer);
  }, [incident?.id, incident?.status]);

  const onLoadScenario = useCallback(
    (id: string) => {
      setSelectedScenario(id);
      const s = scenarios.find((x) => x.id === id);
      if (!s) return;
      // Fetch full logs by creating later; for UX load via create with scenarioId only.
      // Preview alert in textarea until investigate uses scenarioId.
      setLogs(
        `[Demo] ${s.title}\nAlert: ${s.alertText}\n\n(Click Investigate — full synthetic logs load from the worker scenario.)`,
      );
    },
    [scenarios],
  );

  async function onInvestigate() {
    setBusy(true);
    setError(null);
    try {
      const body = selectedScenario
        ? { scenarioId: selectedScenario }
        : {
            logs,
            service: "custom-service",
            alertText: "Manual log investigation",
            summary: "User-pasted logs",
          };
      const { incident: created } = await createIncident(body);
      setIncident(created);
      setLogs(created.logs);
      setSelectedScenario(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create incident");
    } finally {
      setBusy(false);
    }
  }

  async function onSend(message: string) {
    if (!incident) return;
    setChatBusy(true);
    setStreamingText("");
    const optimistic: Incident = {
      ...incident,
      messages: [
        ...incident.messages,
        {
          id: `local-${Date.now()}`,
          role: "user",
          content: message,
          createdAt: new Date().toISOString(),
        },
      ],
    };
    setIncident(optimistic);

    try {
      await streamChat(incident.id, message, (chunk) => {
        setStreamingText((prev) => prev + chunk);
      });
      const refreshed = await getIncident(incident.id);
      setIncident(refreshed);
      setStreamingText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed");
      setStreamingText("");
    } finally {
      setChatBusy(false);
    }
  }

  async function onToggleAction(actionId: string) {
    if (!incident) return;
    try {
      const updated = await toggleAction(incident.id, actionId);
      setIncident(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-[color:var(--color-line)] px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--color-accent)]">
            Cloudflare · Workers AI
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            IncidentAI
          </h1>
          <p className="text-sm text-[color:var(--color-muted)]">
            Production debugging copilot — Llama 3.3 · Workflows · Durable Objects · D1
          </p>
        </div>
      </header>

      {error && (
        <div className="border-b border-[color:var(--color-danger)]/40 bg-[color:var(--color-danger)]/10 px-5 py-2 text-sm text-[color:var(--color-danger)]">
          {error}
        </div>
      )}

      <main className="grid min-h-0 flex-1 lg:grid-cols-2">
        <section className="flex min-h-0 flex-col border-r border-[color:var(--color-line)] bg-[color:var(--color-panel)]/80">
          <LogInput
            logs={logs}
            onLogsChange={(v) => {
              setLogs(v);
              setSelectedScenario(null);
            }}
            scenarios={scenarios}
            onLoadScenario={onLoadScenario}
            onInvestigate={onInvestigate}
            busy={busy}
          />
          <Chat
            messages={incident?.messages ?? []}
            streamingText={streamingText}
            disabled={!incident || chatBusy}
            onSend={onSend}
          />
        </section>

        <section className="min-h-0 bg-[color:var(--color-panel)]/60">
          <IncidentPanel incident={incident} onToggleAction={onToggleAction} />
        </section>
      </main>
    </div>
  );
}
