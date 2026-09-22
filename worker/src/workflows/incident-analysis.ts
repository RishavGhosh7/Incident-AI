import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { analyzeErrors, identifyPatterns } from "../analysis/logs";
import { runDiagnosis } from "../ai/client";
import {
  buildRemediation,
  buildReport,
} from "../ai/prompts";
import type { WorkflowParams } from "../types";

async function updateIncident(
  env: Env,
  incidentId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const id = env.INCIDENT.idFromName(incidentId);
  const stub = env.INCIDENT.get(id);
  await stub.fetch("https://incident/workflow-update", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export class IncidentAnalysisWorkflow extends WorkflowEntrypoint<
  Env,
  WorkflowParams
> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    const { incidentId, logs, service, alertText } = event.payload;

    await step.do("mark-analyzing", async () => {
      await updateIncident(this.env, incidentId, {
        status: "analyzing",
        workflowStep: "collect_logs",
        workflowInstanceId: event.instanceId,
      });
      return true;
    });

    const collected = await step.do("collect_logs", async () => {
      const normalized = logs
        .split(/\r?\n/)
        .map((l) => l.trimEnd())
        .filter((l) => l.length > 0)
        .join("\n");
      await updateIncident(this.env, incidentId, {
        workflowStep: "collect_logs",
        summary: `Collected ${normalized.split("\n").length} log lines for ${service}`,
      });
      return normalized;
    });

    const metrics = await step.do("analyze_errors", async () => {
      const result = analyzeErrors(collected);
      await updateIncident(this.env, incidentId, {
        workflowStep: "analyze_errors",
        metrics: result,
      });
      return result;
    });

    const patterns = await step.do("identify_patterns", async () => {
      const result = identifyPatterns(metrics);
      await updateIncident(this.env, incidentId, {
        workflowStep: "identify_patterns",
      });
      return result;
    });

    const diagnosis = await step.do(
      "llm_diagnosis",
      {
        retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
      },
      async () => {
        await updateIncident(this.env, incidentId, {
          workflowStep: "llm_diagnosis",
        });
        return runDiagnosis(this.env.AI, {
          service,
          alertText,
          logs: collected,
          metrics,
          patterns,
        });
      },
    );

    const remediation = await step.do("generate_remediation", async () => {
      const plan = buildRemediation(diagnosis);
      await updateIncident(this.env, incidentId, {
        workflowStep: "generate_remediation",
        diagnosis,
        remediation: plan,
      });
      return plan;
    });

    const reportMd = await step.do("final_report", async () => {
      const report = buildReport({
        incidentId,
        service,
        alertText,
        metrics,
        patterns,
        diagnosis,
        remediation,
      });
      await updateIncident(this.env, incidentId, {
        status: "diagnosed",
        workflowStep: "final_report",
        diagnosis,
        remediation,
        reportMd: report,
        summary: diagnosis.cause,
      });
      return report;
    });

    return {
      incidentId,
      diagnosis,
      remediation,
      reportMd,
      metrics,
      patterns,
    };
  }
}
