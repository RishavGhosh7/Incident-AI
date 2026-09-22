export type IncidentStatus =
  | "open"
  | "analyzing"
  | "diagnosed"
  | "resolved";

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

export interface PatternResult {
  candidateCauses: string[];
  primaryCauseHint: string | null;
  confidenceBoost: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface IncidentState {
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

export interface CreateIncidentRequest {
  service?: string;
  severity?: Severity;
  alertText?: string;
  logs?: string;
  scenarioId?: string;
  summary?: string;
}

export interface WorkflowParams {
  incidentId: string;
  logs: string;
  service: string;
  alertText: string;
}
