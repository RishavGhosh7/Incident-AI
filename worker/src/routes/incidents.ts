import { getScenario, SCENARIOS } from "../data/scenarios";
import { chatSystemPrompt } from "../ai/prompts";
import { streamChat, toPlainTextSse } from "../ai/client";
import type { CreateIncidentRequest, IncidentState } from "../types";

function buildMemoryFallbackReply(state: IncidentState, message: string): string {
  const d = state.diagnosis;
  const m = state.metrics;
  const lines = [
    `Incident **#${state.id}** (\`${state.service}\`) — status: **${state.status}**.`,
    "",
  ];
  if (d) {
    lines.push(
      `**Cause:** ${d.cause}`,
      `**Confidence:** ${Math.round(d.confidence * 100)}%`,
      "",
      "**Evidence:**",
      ...d.evidence.map((e) => `- ${e}`),
      "",
      "**Next steps:**",
      ...d.next_steps.map((s) => `- ${s}`),
    );
  } else {
    lines.push("Diagnosis is still running or unavailable.");
  }
  if (m) {
    lines.push(
      "",
      `Metrics — errors: ${m.errorCount}, 5xx: ${m.http5xxCount}, latency max: ${m.latencyMsMax ?? "n/a"}ms, pool: ${m.connectionPoolPct ?? "n/a"}%.`,
    );
  }
  lines.push("", `_Responding from incident memory (your question: “${message.slice(0, 120)}”)._`);
  return lines.join("\n");
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "access-control-allow-origin": "*",
    },
  });
}

function cors(request: Request): Response | null {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    });
  }
  return null;
}

async function doFetch(
  env: Env,
  incidentId: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const id = env.INCIDENT.idFromName(incidentId);
  const stub = env.INCIDENT.get(id);
  return stub.fetch(`https://incident${path}`, init);
}

function rowToState(row: Record<string, unknown>, messages: IncidentState["messages"]): IncidentState {
  return {
    id: String(row.id),
    service: String(row.service),
    severity: row.severity as IncidentState["severity"],
    status: row.status as IncidentState["status"],
    startedAt: String(row.started_at),
    summary: String(row.summary ?? ""),
    alertText: String(row.alert_text ?? ""),
    logs: String(row.logs ?? ""),
    metrics: row.metrics_json ? JSON.parse(String(row.metrics_json)) : null,
    diagnosis: row.diagnosis_json ? JSON.parse(String(row.diagnosis_json)) : null,
    remediation: row.remediation_json
      ? JSON.parse(String(row.remediation_json))
      : null,
    reportMd: row.report_md ? String(row.report_md) : null,
    workflowInstanceId: row.workflow_instance_id
      ? String(row.workflow_instance_id)
      : null,
    workflowStep: row.workflow_step ? String(row.workflow_step) : null,
    messages,
    updatedAt: String(row.updated_at),
  };
}

export async function handleIncidents(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  const preflight = cors(request);
  if (preflight) return preflight;

  if (pathname === "/api/scenarios" && request.method === "GET") {
    return json(
      SCENARIOS.map(({ id, title, service, severity, alertText, summary }) => ({
        id,
        title,
        service,
        severity,
        alertText,
        summary,
      })),
    );
  }

  if (pathname === "/api/incidents" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id, service, severity, status, started_at, summary, updated_at
       FROM incidents ORDER BY updated_at DESC LIMIT 50`,
    ).all();
    return json(results ?? []);
  }

  if (pathname === "/api/incidents" && request.method === "POST") {
    const body = (await request.json()) as CreateIncidentRequest;
    const scenario = body.scenarioId ? getScenario(body.scenarioId) : undefined;

    const id = crypto.randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const service = body.service ?? scenario?.service ?? "unknown-service";
    const severity = body.severity ?? scenario?.severity ?? "high";
    const alertText = body.alertText ?? scenario?.alertText ?? "Manual investigation";
    const logs = body.logs ?? scenario?.logs ?? "";
    const summary =
      body.summary ?? scenario?.summary ?? `Investigate ${service}`;

    if (!logs.trim()) {
      return json({ error: "logs or scenarioId required" }, 400);
    }

    const initPayload = {
      id,
      service,
      severity,
      status: "open" as const,
      startedAt: now,
      summary,
      alertText,
      logs,
      messages: [],
    };

    const initRes = await doFetch(env, id, "/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(initPayload),
    });
    if (!initRes.ok) {
      return json({ error: await initRes.text() }, 500);
    }

    const instance = await env.INCIDENT_WORKFLOW.create({
      params: {
        incidentId: id,
        logs,
        service,
        alertText,
      },
    });

    await env.DB.prepare(
      `INSERT INTO workflow_runs (id, incident_id, instance_id, status, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), id, instance.id, "running", now)
      .run();

    await doFetch(env, id, "/workflow-update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflowInstanceId: instance.id,
        workflowStep: "queued",
        status: "analyzing",
      }),
    });

    const assistantIntro = {
      role: "assistant" as const,
      content: `Incident **#${id}** created for \`${service}\`.\n\nAlert: ${alertText}\n\nI've started the multi-step analysis workflow. Watch the panel on the right for progress — then ask me anything about this incident.`,
    };
    await doFetch(env, id, "/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(assistantIntro),
    });

    const stateRes = await doFetch(env, id, "/state");
    const state = await stateRes.json();
    return json({ incident: state, workflowInstanceId: instance.id }, 201);
  }

  const incidentMatch = pathname.match(/^\/api\/incidents\/([^/]+)$/);
  if (incidentMatch && request.method === "GET") {
    const incidentId = incidentMatch[1];
    const stateRes = await doFetch(env, incidentId, "/state");
    if (stateRes.ok) {
      const state = await stateRes.json();
      if (state) return json(state);
    }

    const row = await env.DB.prepare(`SELECT * FROM incidents WHERE id = ?`)
      .bind(incidentId)
      .first();
    if (!row) return json({ error: "not found" }, 404);
    const { results: messages } = await env.DB.prepare(
      `SELECT id, role, content, created_at as createdAt FROM messages
       WHERE incident_id = ? ORDER BY created_at ASC`,
    )
      .bind(incidentId)
      .all();
    return json(
      rowToState(
        row as Record<string, unknown>,
            (messages as Array<Record<string, unknown>>).map((m) => ({
          id: String(m.id),
          role: m.role as "user" | "assistant" | "system",
          content: String(m.content),
          createdAt: String(m.createdAt),
        })),
      ),
    );
  }

  const chatMatch = pathname.match(/^\/api\/incidents\/([^/]+)\/chat$/);
  if (chatMatch && request.method === "POST") {
    const incidentId = chatMatch[1];
    const body = (await request.json()) as { message?: string };
    const message = body.message?.trim();
    if (!message) return json({ error: "message required" }, 400);

    const stateRes = await doFetch(env, incidentId, "/state");
    if (!stateRes.ok) return json({ error: "incident not found" }, 404);
    const state = (await stateRes.json()) as IncidentState;
    if (!state) return json({ error: "incident not found" }, 404);

    await doFetch(env, incidentId, "/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "user", content: message }),
    });

    const history = [
      {
        role: "system",
        content: chatSystemPrompt({
          incidentId: state.id,
          service: state.service,
          status: state.status,
          diagnosis: state.diagnosis,
          remediation: state.remediation,
          metrics: state.metrics,
          reportMd: state.reportMd,
        }),
      },
      ...state.messages.slice(-12).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    const fallback = buildMemoryFallbackReply(state, message);
    const aiStream = await streamChat(env.AI, history, fallback);
    const plain = toPlainTextSse(aiStream);

    // Tee stream: one to client, one to accumulate for persistence
    const [clientStream, persistStream] = plain.tee();

    const persistPromise = (async () => {
      const reader = persistStream.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const jsonPayload = JSON.parse(payload) as { text?: string };
            if (jsonPayload.text) full += jsonPayload.text;
          } catch {
            /* ignore */
          }
        }
      }
      if (full.trim()) {
        await doFetch(env, incidentId, "/message", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role: "assistant", content: full }),
        });
      }
    })();

    // Ensure persistence runs; don't block the response on it completing first
    void persistPromise;

    return new Response(clientStream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      },
    });
  }

  const toggleMatch = pathname.match(
    /^\/api\/incidents\/([^/]+)\/actions\/([^/]+)\/toggle$/,
  );
  if (toggleMatch && request.method === "POST") {
    const [, incidentId, actionId] = toggleMatch;
    const res = await doFetch(env, incidentId, "/toggle-action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actionId }),
    });
    return json(await res.json(), res.status);
  }

  return json({ error: "not found" }, 404);
}
