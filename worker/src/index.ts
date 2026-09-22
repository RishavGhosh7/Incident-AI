import { handleIncidents } from "./routes/incidents";
export { IncidentDO } from "./durable-objects/incident";
export { IncidentAnalysisWorkflow } from "./workflows/incident-analysis";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleIncidents(request, env, url.pathname);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("IncidentAI worker is running. Build the frontend to serve UI.", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  },
} satisfies ExportedHandler<Env>;
