import type {
  ChatMessage,
  Diagnosis,
  IncidentState,
  IncidentStatus,
  AnalysisMetrics,
  Remediation,
  Severity,
} from "../types";

interface StoredIncident {
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

export class IncidentDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private cache: StoredIncident | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "GET" && path === "/state") {
        const incident = await this.load();
        return Response.json(incident);
      }

      if (request.method === "POST" && path === "/init") {
        const body = (await request.json()) as Partial<StoredIncident> & {
          id: string;
        };
        const now = new Date().toISOString();
        const incident: StoredIncident = {
          id: body.id,
          service: body.service ?? "unknown-service",
          severity: body.severity ?? "high",
          status: body.status ?? "open",
          startedAt: body.startedAt ?? now,
          summary: body.summary ?? "",
          alertText: body.alertText ?? "",
          logs: body.logs ?? "",
          metrics: body.metrics ?? null,
          diagnosis: body.diagnosis ?? null,
          remediation: body.remediation ?? null,
          reportMd: body.reportMd ?? null,
          workflowInstanceId: body.workflowInstanceId ?? null,
          workflowStep: body.workflowStep ?? null,
          messages: body.messages ?? [],
          updatedAt: now,
        };
        await this.save(incident);
        await this.persistToD1(incident);
        return Response.json(incident);
      }

      if (request.method === "POST" && path === "/message") {
        const body = (await request.json()) as {
          role: ChatMessage["role"];
          content: string;
          id?: string;
        };
        const incident = await this.requireIncident();
        const msg: ChatMessage = {
          id: body.id ?? crypto.randomUUID(),
          role: body.role,
          content: body.content,
          createdAt: new Date().toISOString(),
        };
        incident.messages.push(msg);
        incident.updatedAt = new Date().toISOString();
        await this.save(incident);
        await this.env.DB.prepare(
          `INSERT INTO messages (id, incident_id, role, content, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
          .bind(msg.id, incident.id, msg.role, msg.content, msg.createdAt)
          .run();
        return Response.json({ message: msg, state: incident });
      }

      if (request.method === "POST" && path === "/workflow-update") {
        const body = (await request.json()) as Partial<StoredIncident> & {
          status?: IncidentStatus;
          workflowStep?: string;
        };
        const incident = await this.requireIncident();
        if (body.status) incident.status = body.status;
        if (body.workflowStep !== undefined) incident.workflowStep = body.workflowStep;
        if (body.workflowInstanceId !== undefined)
          incident.workflowInstanceId = body.workflowInstanceId;
        if (body.metrics !== undefined) incident.metrics = body.metrics;
        if (body.diagnosis !== undefined) incident.diagnosis = body.diagnosis;
        if (body.remediation !== undefined) incident.remediation = body.remediation;
        if (body.reportMd !== undefined) incident.reportMd = body.reportMd;
        if (body.summary !== undefined) incident.summary = body.summary;
        incident.updatedAt = new Date().toISOString();
        await this.save(incident);
        await this.persistToD1(incident);
        return Response.json(incident);
      }

      if (request.method === "POST" && path === "/toggle-action") {
        const body = (await request.json()) as { actionId: string };
        const incident = await this.requireIncident();
        if (incident.remediation) {
          incident.remediation = {
            ...incident.remediation,
            actions: incident.remediation.actions.map((a) =>
              a.id === body.actionId ? { ...a, done: !a.done } : a,
            ),
          };
          const allDone = incident.remediation.actions.every((a) => a.done);
          if (allDone) incident.status = "resolved";
          incident.updatedAt = new Date().toISOString();
          await this.save(incident);
          await this.persistToD1(incident);
        }
        return Response.json(incident);
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "DO error";
      return Response.json({ error: message }, { status: 500 });
    }
  }

  private async load(): Promise<StoredIncident | null> {
    if (this.cache) return this.cache;
    const stored = await this.state.storage.get<StoredIncident>("incident");
    this.cache = stored ?? null;
    return this.cache;
  }

  private async requireIncident(): Promise<StoredIncident> {
    const incident = await this.load();
    if (!incident) throw new Error("Incident not initialized");
    return incident;
  }

  private async save(incident: StoredIncident): Promise<void> {
    this.cache = incident;
    await this.state.storage.put("incident", incident);
  }

  private async persistToD1(incident: StoredIncident): Promise<void> {
    await this.env.DB.prepare(
      `INSERT INTO incidents (
        id, service, severity, status, started_at, summary, alert_text, logs,
        metrics_json, diagnosis_json, remediation_json, report_md,
        workflow_instance_id, workflow_step, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        service=excluded.service,
        severity=excluded.severity,
        status=excluded.status,
        summary=excluded.summary,
        alert_text=excluded.alert_text,
        logs=excluded.logs,
        metrics_json=excluded.metrics_json,
        diagnosis_json=excluded.diagnosis_json,
        remediation_json=excluded.remediation_json,
        report_md=excluded.report_md,
        workflow_instance_id=excluded.workflow_instance_id,
        workflow_step=excluded.workflow_step,
        updated_at=excluded.updated_at`,
    )
      .bind(
        incident.id,
        incident.service,
        incident.severity,
        incident.status,
        incident.startedAt,
        incident.summary,
        incident.alertText,
        incident.logs,
        incident.metrics ? JSON.stringify(incident.metrics) : null,
        incident.diagnosis ? JSON.stringify(incident.diagnosis) : null,
        incident.remediation ? JSON.stringify(incident.remediation) : null,
        incident.reportMd,
        incident.workflowInstanceId,
        incident.workflowStep,
        incident.updatedAt,
      )
      .run();
  }
}

export type { IncidentState };
