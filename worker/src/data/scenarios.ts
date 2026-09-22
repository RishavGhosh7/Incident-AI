export interface Scenario {
  id: string;
  title: string;
  service: string;
  severity: "low" | "medium" | "high" | "critical";
  alertText: string;
  summary: string;
  logs: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "checkout-db-pool",
    title: "Checkout API — DB connection exhaustion",
    service: "checkout-api",
    severity: "high",
    alertText: "Payment API — 500 errors increased by 38%",
    summary: "Checkout API started returning 500s; investigate DB connection pool.",
    logs: `14:15:01 INFO  checkout-service  Handling POST /checkout
14:15:03 ERROR checkout-service  Database connection timeout after 5000ms
14:15:04 ERROR checkout-service  Failed to execute payment transaction
14:15:05 WARN  database          Connection pool utilization: 96%
14:15:06 WARN  checkout-service  Latency p99: 2400ms (baseline 180ms)
14:15:07 WARN  database          Connection pool utilization: 98%
14:15:09 ERROR checkout-service  HTTP 500 /checkout request_id=req_8841
14:15:10 ERROR checkout-service  HTTP 500 /checkout request_id=req_8842
14:15:11 ERROR checkout-service  Database connection timeout
14:15:12 WARN  database          Active connections: 196/200
14:15:14 ERROR checkout-service  HTTP 500 /payments/authorize
14:15:15 INFO  load-balancer     Upstream checkout-api unhealthy checks=3`,
  },
  {
    id: "payments-redis",
    title: "Payments — Redis connection refused",
    service: "payments-api",
    severity: "critical",
    alertText: "Payments service error rate 52% — cache layer unreachable",
    summary: "Payment authorizations failing; Redis appears down.",
    logs: `15:42:01 ERROR payments-service  Redis connection refused 10.0.4.12:6379
15:42:02 ERROR payments-service  Failed to read session cache key=sess_9912
15:42:03 WARN  payments-service  Falling back to primary DB for session lookup
15:42:04 ERROR payments-service  HTTP 503 /payments/authorize
15:42:05 ERROR redis-sentinel    Master unreachable; failover pending
15:42:06 ERROR payments-service  Redis connection refused 10.0.4.12:6379
15:42:08 WARN  payments-service  Latency p95: 3100ms
15:42:09 ERROR payments-service  HTTP 500 /payments/capture
15:42:10 ERROR payments-service  Circuit breaker OPEN for redis-cache
15:42:12 WARN  payments-service  Error budget burned: 48% in 5m`,
  },
  {
    id: "auth-cascade",
    title: "Auth — dependency timeout cascade",
    service: "auth-service",
    severity: "high",
    alertText: "Login failures elevated — downstream identity provider timeouts",
    summary: "Auth service timing out calling identity provider; cascading 504s.",
    logs: `09:08:01 WARN  auth-service      Upstream identity-provider latency 1800ms
09:08:03 ERROR auth-service      Upstream timeout calling identity-provider /oauth/token
09:08:04 ERROR auth-service      HTTP 504 /login
09:08:05 WARN  auth-service      Retry attempt 1/3 for identity-provider
09:08:07 ERROR auth-service      Upstream timeout calling identity-provider /oauth/token
09:08:08 ERROR auth-service      HTTP 504 /login
09:08:09 WARN  gateway           Rate of 5xx from auth-service increased 41%
09:08:10 ERROR auth-service      Circuit breaker HALF-OPEN identity-provider
09:08:12 ERROR auth-service      HTTP 500 /session/refresh
09:08:13 WARN  auth-service      Thread pool utilization: 91%
09:08:15 ERROR auth-service      Dependency timeout cascade detected`,
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
