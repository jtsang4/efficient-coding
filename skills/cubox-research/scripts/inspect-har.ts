#!/usr/bin/env bun

import { promises as fs } from "node:fs";
import path from "node:path";

type HarHeader = {
  name?: string;
  value?: string;
};

type HarEntry = {
  request?: {
    method?: string;
    url?: string;
    headers?: HarHeader[];
    queryString?: Array<{ name?: string; value?: string }>;
    postData?: {
      mimeType?: string;
      params?: Array<{ name?: string; value?: string }>;
      text?: string;
    } | null;
  };
  response?: {
    status?: number;
    content?: {
      text?: string;
    };
  };
};

type HarFile = {
  log?: {
    entries?: HarEntry[];
  };
};

type EndpointSummary = {
  method: string;
  pathname: string;
  count: number;
  statuses: Set<number>;
  queryParams: Set<string>;
  headerNames: Set<string>;
  bodyParams: Set<string>;
  responseKeys: Set<string>;
};

function parseJsonSafely(input: string | undefined) {
  if (!input) {
    return null;
  }
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function getResponseKeys(text: string | undefined): string[] {
  const parsed = parseJsonSafely(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }
  return Object.keys(parsed);
}

async function main() {
  const harPath = process.argv[2];

  if (!harPath) {
    throw new Error("Usage: bun run ./scripts/inspect-har.ts <path-to-har>");
  }

  const file = await fs.readFile(harPath, "utf8");
  const har = JSON.parse(file) as HarFile;
  const entries = har.log?.entries ?? [];
  const summaries = new Map<string, EndpointSummary>();

  for (const entry of entries) {
    const request = entry.request;
    if (!request?.url || !request.method) {
      continue;
    }

    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      continue;
    }

    if (!url.pathname.startsWith("/c/api/")) {
      continue;
    }

    const key = `${request.method.toUpperCase()} ${url.pathname}`;
    let summary = summaries.get(key);

    if (!summary) {
      summary = {
        method: request.method.toUpperCase(),
        pathname: url.pathname,
        count: 0,
        statuses: new Set<number>(),
        queryParams: new Set<string>(),
        headerNames: new Set<string>(),
        bodyParams: new Set<string>(),
        responseKeys: new Set<string>(),
      };
      summaries.set(key, summary);
    }

    summary.count += 1;
    if (typeof entry.response?.status === "number") {
      summary.statuses.add(entry.response.status);
    }

    for (const [name] of url.searchParams.entries()) {
      summary.queryParams.add(name);
    }

    for (const header of request.headers ?? []) {
      if (header.name) {
        summary.headerNames.add(header.name);
      }
    }

    for (const param of request.postData?.params ?? []) {
      if (param.name) {
        summary.bodyParams.add(param.name);
      }
    }

    for (const keyName of getResponseKeys(entry.response?.content?.text)) {
      summary.responseKeys.add(keyName);
    }
  }

  const rows = [...summaries.values()].sort((left, right) => {
    return `${left.method} ${left.pathname}`.localeCompare(`${right.method} ${right.pathname}`);
  });

  const output: string[] = [];
  output.push(`# HAR Summary: ${path.basename(harPath)}`);
  output.push("");
  output.push(`Total observed Cubox API endpoints: ${rows.length}`);
  output.push("");

  for (const row of rows) {
    output.push(`## ${row.method} ${row.pathname}`);
    output.push("");
    output.push(`- Seen: ${row.count} time(s)`);
    output.push(`- Statuses: ${[...row.statuses].sort((a, b) => a - b).join(", ") || "none"}`);
    output.push(`- Query params: ${[...row.queryParams].sort().join(", ") || "none"}`);
    output.push(`- Body params: ${[...row.bodyParams].sort().join(", ") || "none"}`);
    output.push(`- Header names: ${[...row.headerNames].sort().join(", ") || "none"}`);
    output.push(`- Top-level response keys: ${[...row.responseKeys].sort().join(", ") || "none"}`);
    output.push("");
  }

  console.log(output.join("\n"));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

