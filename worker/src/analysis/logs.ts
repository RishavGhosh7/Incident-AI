import type { AnalysisMetrics, PatternResult } from "../types";

export function analyzeErrors(logs: string): AnalysisMetrics {
  const lines = logs.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let errorCount = 0;
  let warnCount = 0;
  let http5xxCount = 0;
  let latencyMsMax: number | null = null;
  let connectionPoolPct: number | null = null;
  const signals: string[] = [];

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (/\bERROR\b/.test(upper)) {
      errorCount += 1;
      signals.push("error");
    }
    if (/\bWARN\b/.test(upper)) {
      warnCount += 1;
      signals.push("warn");
    }

    const httpMatch = line.match(/\bHTTP\s+(5\d{2})\b/i);
    if (httpMatch) {
      http5xxCount += 1;
      signals.push(`http_${httpMatch[1]}`);
    }

    const latencyMatch = line.match(/latency.*?(\d+(?:\.\d+)?)\s*ms/i);
    if (latencyMatch) {
      const ms = Number(latencyMatch[1]);
      if (!Number.isNaN(ms)) {
        latencyMsMax = latencyMsMax === null ? ms : Math.max(latencyMsMax, ms);
        signals.push("high_latency");
      }
    }

    const poolMatch = line.match(
      /(?:pool\s+utilization|connection\s+pool)[^0-9]*(\d+(?:\.\d+)?)\s*%/i,
    );
    if (poolMatch) {
      const pct = Number(poolMatch[1]);
      if (!Number.isNaN(pct)) {
        connectionPoolPct =
          connectionPoolPct === null ? pct : Math.max(connectionPoolPct, pct);
        signals.push("pool_pressure");
      }
    }

    const activeMatch = line.match(/Active connections:\s*(\d+)\s*\/\s*(\d+)/i);
    if (activeMatch) {
      const used = Number(activeMatch[1]);
      const max = Number(activeMatch[2]);
      if (max > 0) {
        const pct = Math.round((used / max) * 100);
        connectionPoolPct =
          connectionPoolPct === null ? pct : Math.max(connectionPoolPct, pct);
        signals.push("pool_pressure");
      }
    }

    if (/connection\s+timeout|database\s+connection/i.test(line)) {
      signals.push("db_timeout");
    }
    if (/redis.*(refused|unreachable)|connection refused.*redis/i.test(line)) {
      signals.push("redis_down");
    }
    if (/circuit\s+breaker/i.test(line)) {
      signals.push("circuit_breaker");
    }
    if (/upstream\s+timeout|dependency\s+timeout|identity-provider/i.test(line)) {
      signals.push("upstream_timeout");
    }
  }

  return {
    errorCount,
    warnCount,
    http5xxCount,
    latencyMsMax,
    connectionPoolPct,
    signals: [...new Set(signals)],
  };
}

export function identifyPatterns(metrics: AnalysisMetrics): PatternResult {
  const candidates: string[] = [];
  let primary: string | null = null;
  let boost = 0.5;

  const has = (s: string) => metrics.signals.includes(s);

  if (
    has("db_timeout") ||
    has("pool_pressure") ||
    (metrics.connectionPoolPct !== null && metrics.connectionPoolPct >= 90)
  ) {
    candidates.push("Database connection pool exhaustion");
    primary = "Database connection pool exhaustion";
    boost = 0.82;
  }

  if (has("redis_down")) {
    candidates.push("Redis / cache layer unavailable");
    if (!primary) {
      primary = "Redis / cache layer unavailable";
      boost = 0.88;
    }
  }

  if (has("upstream_timeout") || has("circuit_breaker")) {
    candidates.push("Downstream dependency timeout cascade");
    if (!primary) {
      primary = "Downstream dependency timeout cascade";
      boost = 0.8;
    }
  }

  if (metrics.http5xxCount >= 3 && !primary) {
    candidates.push("Elevated 5xx from application service");
    primary = "Elevated 5xx from application service";
    boost = 0.65;
  }

  if (metrics.latencyMsMax !== null && metrics.latencyMsMax >= 1500) {
    candidates.push("Severe latency regression");
    if (!primary) {
      primary = "Severe latency regression";
      boost = 0.7;
    }
  }

  if (candidates.length === 0) {
    candidates.push("Unknown — needs deeper log inspection");
    primary = "Unknown — needs deeper log inspection";
    boost = 0.4;
  }

  return {
    candidateCauses: [...new Set(candidates)],
    primaryCauseHint: primary,
    confidenceBoost: boost,
  };
}
