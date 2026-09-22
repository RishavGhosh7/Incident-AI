import type { AnalysisMetrics, Diagnosis, PatternResult, Remediation } from "../types";

export const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export function diagnosisSystemPrompt(): string {
  return `You are IncidentAI, an expert production debugging copilot.
Analyze the provided service alert, logs, metrics, and pattern hints.
Respond with ONLY valid JSON (no markdown fences) matching this schema:
{
  "cause": "string — primary root cause",
  "evidence": ["string", "..."],
  "confidence": 0.0-1.0,
  "next_steps": ["string", "..."]
}
Be specific, cite log signals, and keep evidence to 3-6 bullets.`;
}

export function diagnosisUserPrompt(input: {
  service: string;
  alertText: string;
  logs: string;
  metrics: AnalysisMetrics;
  patterns: PatternResult;
}): string {
  return `Service: ${input.service}
Alert: ${input.alertText}

Parsed metrics:
${JSON.stringify(input.metrics, null, 2)}

Pattern analysis:
${JSON.stringify(input.patterns, null, 2)}

Raw logs:
${input.logs.slice(0, 6000)}

Return the diagnosis JSON now.`;
}

export function chatSystemPrompt(ctx: {
  incidentId: string;
  service: string;
  status: string;
  diagnosis: Diagnosis | null;
  remediation: Remediation | null;
  metrics: AnalysisMetrics | null;
  reportMd: string | null;
}): string {
  return `You are IncidentAI, a concise production incident response copilot.
You help engineers investigate and resolve incidents. Use the incident memory below.
If asked what was determined, summarize diagnosis, evidence, and next steps clearly.
Do not invent metrics that are not in memory. Keep answers practical and structured.

Incident #${ctx.incidentId}
Service: ${ctx.service}
Status: ${ctx.status}
Metrics: ${ctx.metrics ? JSON.stringify(ctx.metrics) : "n/a"}
Diagnosis: ${ctx.diagnosis ? JSON.stringify(ctx.diagnosis) : "pending"}
Remediation: ${ctx.remediation ? JSON.stringify(ctx.remediation) : "pending"}
Report:
${ctx.reportMd ?? "(not ready)"}`;
}

export function parseDiagnosisJson(
  text: string,
  fallback: Diagnosis,
): Diagnosis {
  try {
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return fallback;
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<Diagnosis>;
    return {
      cause: typeof parsed.cause === "string" ? parsed.cause : fallback.cause,
      evidence: Array.isArray(parsed.evidence)
        ? parsed.evidence.map(String)
        : fallback.evidence,
      confidence:
        typeof parsed.confidence === "number"
          ? Math.min(1, Math.max(0, parsed.confidence))
          : fallback.confidence,
      next_steps: Array.isArray(parsed.next_steps)
        ? parsed.next_steps.map(String)
        : fallback.next_steps,
    };
  } catch {
    return fallback;
  }
}

export function buildFallbackDiagnosis(
  patterns: PatternResult,
  metrics: AnalysisMetrics,
): Diagnosis {
  const evidence: string[] = [];
  if (metrics.errorCount) evidence.push(`${metrics.errorCount} ERROR log lines`);
  if (metrics.http5xxCount) evidence.push(`${metrics.http5xxCount} HTTP 5xx responses`);
  if (metrics.latencyMsMax !== null)
    evidence.push(`Latency peaked at ${metrics.latencyMsMax}ms`);
  if (metrics.connectionPoolPct !== null)
    evidence.push(`DB connection pool at ${metrics.connectionPoolPct}%`);
  if (evidence.length === 0) evidence.push("Pattern detector used available log signals");

  return {
    cause: patterns.primaryCauseHint ?? "Undetermined",
    evidence,
    confidence: patterns.confidenceBoost,
    next_steps: [
      "Inspect the top candidate dependency",
      "Verify recent deploys and config changes",
      "Confirm error rate is returning to baseline",
    ],
  };
}

export function buildRemediation(diagnosis: Diagnosis): Remediation {
  const actions = diagnosis.next_steps.map((label, i) => ({
    id: `step-${i + 1}`,
    label,
    done: false,
  }));
  if (actions.length === 0) {
    actions.push(
      { id: "step-1", label: "Inspect connection pool / dependency health", done: false },
      { id: "step-2", label: "Check service and dependency dashboards", done: false },
      { id: "step-3", label: "Roll forward fix or restart affected pods if needed", done: false },
    );
  }
  return {
    summary: `Remediation plan for: ${diagnosis.cause}`,
    actions,
  };
}

export function buildReport(input: {
  incidentId: string;
  service: string;
  alertText: string;
  metrics: AnalysisMetrics;
  patterns: PatternResult;
  diagnosis: Diagnosis;
  remediation: Remediation;
}): string {
  const evidence = input.diagnosis.evidence.map((e) => `- ${e}`).join("\n");
  const actions = input.remediation.actions
    .map((a) => `- [ ] ${a.label}`)
    .join("\n");
  return `# Incident Report — ${input.incidentId}

**Service:** ${input.service}  
**Alert:** ${input.alertText}  
**Cause:** ${input.diagnosis.cause}  
**Confidence:** ${Math.round(input.diagnosis.confidence * 100)}%

## Metrics
- Errors: ${input.metrics.errorCount}
- Warnings: ${input.metrics.warnCount}
- HTTP 5xx: ${input.metrics.http5xxCount}
- Max latency: ${input.metrics.latencyMsMax ?? "n/a"} ms
- Pool utilization: ${input.metrics.connectionPoolPct ?? "n/a"}%

## Candidate causes
${input.patterns.candidateCauses.map((c) => `- ${c}`).join("\n")}

## Evidence
${evidence}

## Remediation
${actions}
`;
}
