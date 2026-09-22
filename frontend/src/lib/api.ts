export type IncidentStatus = "open" | "analyzing" | "diagnosed" | "resolved";
export type Severity = "low" | "medium" | "high" | "critical";

export interface Diagnosis {
  cause: string;
  evidence: string[];
  confidence: number;
  next_steps: string[];
}

export interface Remediation {
  actions: Array<{ id: string; label: string; done: boolean }>;
  summary: string;
}

export interface AnalysisMetrics {
  errorCount: number;
  warnCount: number;
  http5xxCount: number;
  latencyMsMax: number | null;
  connectionPoolPct: number | null;
  signals: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface Incident {
  id: string;
  service: string;
  severity: Severity;
  status: IncidentStatus;
  startedAt: string;
  summary: string;
  alertText: string;
  logs: string;
  metrics: AnalysisMetrics | null;
  diagnosis: Diagnosis | null;
  remediation: Remediation | null;
  reportMd: string | null;
  workflowInstanceId: string | null;
  workflowStep: string | null;
  messages: ChatMessage[];
  updatedAt: string;
}

export interface ScenarioSummary {
  id: string;
  title: string;
  service: string;
  severity: Severity;
  alertText: string;
  summary: string;
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function listScenarios(): Promise<ScenarioSummary[]> {
  return parseJson(await fetch("/api/scenarios"));
}

export async function createIncident(body: {
  scenarioId?: string;
  logs?: string;
  service?: string;
  alertText?: string;
  summary?: string;
}): Promise<{ incident: Incident; workflowInstanceId: string }> {
  return parseJson(
    await fetch("/api/incidents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function getIncident(id: string): Promise<Incident> {
  return parseJson(await fetch(`/api/incidents/${id}`));
}

export async function toggleAction(
  incidentId: string,
  actionId: string,
): Promise<Incident> {
  return parseJson(
    await fetch(`/api/incidents/${incidentId}/actions/${actionId}/toggle`, {
      method: "POST",
    }),
  );
}

export async function streamChat(
  incidentId: string,
  message: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const res = await fetch(`/api/incidents/${incidentId}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok || !res.body) {
    throw new Error(await res.text());
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as { text?: string };
        if (json.text) {
          full += json.text;
          onChunk(json.text);
        }
      } catch {
        /* ignore */
      }
    }
  }

  return full;
}
