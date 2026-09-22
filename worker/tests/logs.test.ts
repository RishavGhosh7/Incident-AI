import { describe, expect, it } from "vitest";
import { analyzeErrors, identifyPatterns } from "../src/analysis/logs";

const SAMPLE = `14:15:03 ERROR checkout-service  Database connection timeout
14:15:05 WARN  database          Connection pool utilization: 96%
14:15:09 ERROR checkout-service  HTTP 500 /checkout
14:15:06 WARN  checkout-service  Latency p99: 2400ms`;

describe("analyzeErrors", () => {
  it("counts errors, 5xx, latency, and pool utilization", () => {
    const m = analyzeErrors(SAMPLE);
    expect(m.errorCount).toBeGreaterThanOrEqual(2);
    expect(m.http5xxCount).toBe(1);
    expect(m.latencyMsMax).toBe(2400);
    expect(m.connectionPoolPct).toBe(96);
    expect(m.signals).toContain("db_timeout");
    expect(m.signals).toContain("pool_pressure");
  });
});

describe("identifyPatterns", () => {
  it("detects DB pool exhaustion", () => {
    const patterns = identifyPatterns(analyzeErrors(SAMPLE));
    expect(patterns.primaryCauseHint).toMatch(/connection pool/i);
    expect(patterns.confidenceBoost).toBeGreaterThan(0.7);
  });

  it("detects redis outage", () => {
    const logs = `ERROR payments Redis connection refused 10.0.0.1:6379
ERROR payments HTTP 503 /payments`;
    const patterns = identifyPatterns(analyzeErrors(logs));
    expect(patterns.primaryCauseHint).toMatch(/redis/i);
  });
});
