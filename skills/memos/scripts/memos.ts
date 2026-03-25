#!/usr/bin/env bun

import { readFileSync, existsSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { OPERATIONS, OPERATIONS_BY_ID, type Operation } from "./operations";

type ArgMap = Map<string, string[]>;

type ParsedArgs = {
  positionals: string[];
  flags: ArgMap;
};

const SKILL_ROOT = resolve(import.meta.dir, "..");
const ENV_PATH = join(SKILL_ROOT, ".env");

function usage(): string {
  return [
    "Usage:",
    "  bun run scripts/memos.ts ops [--service memoservice] [--search memo] [--json]",
    "  bun run scripts/memos.ts describe <operationId> [--json]",
    "  bun run scripts/memos.ts call <operationId> [--path key=value] [--query key=value] [--body JSON|@file|@-] [--paginate] [--output file]",
    "  bun run scripts/memos.ts attachment-body --file /path/to/file [--memo memos/123] [--name attachments/custom] [--mime text/plain] [--output /tmp/body.json]",
    "  bun run scripts/memos.ts config",
  ].join("\n");
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: ArgMap = new Map();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const raw = arg.slice(2);
    const [name, inlineValue] = raw.includes("=") ? raw.split(/=(.*)/s, 2) : [raw, undefined];
    let value = inlineValue;

    if (value === undefined) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        value = next;
        i += 1;
      } else {
        value = "true";
      }
    }

    const bucket = flags.get(name) ?? [];
    bucket.push(value);
    flags.set(name, bucket);
  }

  return { positionals, flags };
}

function getFlag(args: ParsedArgs, name: string): string | undefined {
  return args.flags.get(name)?.at(-1);
}

function getAllFlags(args: ParsedArgs, name: string): string[] {
  return args.flags.get(name) ?? [];
}

function hasFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.has(name);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }

  const env: Record<string, string> = {};
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function normalizeBaseUrl(raw: string | undefined): string {
  if (!raw) {
    fail(`MEMOS_BASE_URL is missing. Create ${ENV_PATH} from .env.example first.`);
  }

  const trimmed = raw.replace(/\/+$/g, "");
  if (!/^https?:\/\//.test(trimmed)) {
    fail(`MEMOS_BASE_URL must start with http:// or https://. Received: ${raw}`);
  }

  if (trimmed.endsWith("/api/v1")) {
    return trimmed;
  }

  return `${trimmed}/api/v1`;
}

function loadConfig(): { baseUrl: string; accessToken: string; envPath: string } {
  const localEnv = parseEnvFile(ENV_PATH);
  const baseUrl = normalizeBaseUrl(localEnv.MEMOS_BASE_URL ?? process.env.MEMOS_BASE_URL);
  const accessToken = (localEnv.MEMOS_ACCESS_TOKEN ?? process.env.MEMOS_ACCESS_TOKEN ?? "").trim();

  if (!accessToken) {
    fail(`MEMOS_ACCESS_TOKEN is missing. Create ${ENV_PATH} from .env.example first.`);
  }

  return { baseUrl, accessToken, envPath: ENV_PATH };
}

function maskSecret(secret: string): string {
  if (secret.length <= 10) {
    return "*".repeat(secret.length);
  }

  return `${secret.slice(0, 10)}...${secret.slice(-4)}`;
}

function parseKeyValuePairs(values: string[], kind: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const value of values) {
    const eqIndex = value.indexOf("=");
    if (eqIndex === -1) {
      fail(`Expected ${kind} in key=value form, received: ${value}`);
    }

    const key = value.slice(0, eqIndex).trim();
    const itemValue = value.slice(eqIndex + 1);
    if (!key) {
      fail(`Expected ${kind} key to be non-empty, received: ${value}`);
    }

    result[key] = itemValue;
  }

  return result;
}

function normalizePathValue(input: string): string {
  if (!input.includes("/")) {
    return input;
  }

  const parts = input.split("/").filter(Boolean);
  return parts.at(-1) ?? input;
}

async function readBodyArgument(arg: string): Promise<unknown> {
  if (arg === "@-") {
    const text = await new Response(Bun.stdin.stream()).text();
    return parseJson(text, "stdin");
  }

  if (arg.startsWith("@")) {
    const path = arg.slice(1);
    const text = await Bun.file(path).text();
    return parseJson(text, path);
  }

  return parseJson(arg, "inline JSON");
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`Failed to parse ${label} as JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildOperationUrl(
  baseUrl: string,
  operation: Operation,
  rawPathParams: Record<string, string>,
  queryParams: Record<string, string>,
): string {
  let path = operation.path;
  for (const key of operation.pathParams) {
    const rawValue = rawPathParams[key];
    if (!rawValue) {
      fail(`Missing required --path ${key}=... for ${operation.id}`);
    }

    const value = encodeURIComponent(normalizePathValue(rawValue));
    path = path.replace(`{${key}}`, value);
  }

  const url = new URL(baseUrl + path);
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

async function requestJson(
  config: { baseUrl: string; accessToken: string },
  operation: Operation,
  pathParams: Record<string, string>,
  queryParams: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  const url = buildOperationUrl(config.baseUrl, operation, pathParams, queryParams);
  const headers = new Headers({
    Authorization: `Bearer ${config.accessToken}`,
    Accept: "application/json",
  });

  const init: RequestInit = {
    method: operation.method,
    headers,
  };

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    const detail = payload ?? text;
    throw new Error(`HTTP ${response.status} ${response.statusText}\n${typeof detail === "string" ? detail : JSON.stringify(detail, null, 2)}`);
  }

  return payload;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function maybeWriteOutput(outputPath: string | undefined, payload: unknown): Promise<void> {
  if (!outputPath) {
    return;
  }

  const serialized =
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  await Bun.write(outputPath, serialized.endsWith("\n") ? serialized : `${serialized}\n`);
}

function printPayload(payload: unknown): void {
  if (payload === null) {
    console.log("null");
    return;
  }

  if (typeof payload === "string") {
    console.log(payload);
    return;
  }

  console.log(JSON.stringify(payload, null, 2));
}

async function commandConfig(): Promise<void> {
  const config = loadConfig();
  printPayload({
    envPath: config.envPath,
    baseUrl: config.baseUrl,
    accessToken: maskSecret(config.accessToken),
  });
}

async function commandOps(args: ParsedArgs): Promise<void> {
  const service = getFlag(args, "service");
  const search = getFlag(args, "search")?.toLowerCase();
  const matches = OPERATIONS.filter((operation) => {
    if (service && operation.service !== service) {
      return false;
    }

    if (!search) {
      return true;
    }

    const haystack = [
      operation.id,
      operation.service,
      operation.title,
      operation.summary,
      operation.path,
    ].join(" ").toLowerCase();
    return haystack.includes(search);
  });

  if (hasFlag(args, "json")) {
    printPayload(matches);
    return;
  }

  for (const operation of matches) {
    console.log(`${operation.id}\t${operation.method}\t${operation.path}\t${operation.summary}`);
  }
}

async function commandDescribe(operationId: string, args: ParsedArgs): Promise<void> {
  const operation = OPERATIONS_BY_ID.get(operationId);
  if (!operation) {
    fail(`Unknown operation: ${operationId}`);
  }

  if (hasFlag(args, "json")) {
    printPayload(operation);
    return;
  }

  printPayload({
    id: operation.id,
    service: operation.service,
    title: operation.title,
    summary: operation.summary,
    method: operation.method,
    path: operation.path,
    pathParams: operation.pathParams,
    queryParams: operation.queryParams,
    bodySchema: operation.bodySchema ?? null,
  });
}

function validateRequiredQueryParams(operation: Operation, queryParams: Record<string, string>): void {
  for (const queryParam of operation.queryParams) {
    if (queryParam.required && !queryParams[queryParam.name]) {
      fail(`Missing required --query ${queryParam.name}=... for ${operation.id}`);
    }
  }
}

async function paginateRequest(
  config: { baseUrl: string; accessToken: string },
  operation: Operation,
  pathParams: Record<string, string>,
  queryParams: Record<string, string>,
): Promise<unknown> {
  const pages: unknown[] = [];
  let nextPageToken = queryParams.pageToken;

  for (let page = 0; page < 100; page += 1) {
    const pageQuery = { ...queryParams };
    if (nextPageToken) {
      pageQuery.pageToken = nextPageToken;
    } else {
      delete pageQuery.pageToken;
    }

    const payload = await requestJson(config, operation, pathParams, pageQuery, undefined);
    pages.push(payload);

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      break;
    }

    const token = (payload as Record<string, unknown>).nextPageToken;
    if (typeof token !== "string" || token.length === 0) {
      break;
    }

    nextPageToken = token;
  }

  return {
    operationId: operation.id,
    pageCount: pages.length,
    pages,
  };
}

async function commandCall(operationId: string, args: ParsedArgs): Promise<void> {
  const operation = OPERATIONS_BY_ID.get(operationId);
  if (!operation) {
    fail(`Unknown operation: ${operationId}`);
  }

  const pathParams = parseKeyValuePairs(getAllFlags(args, "path"), "--path");
  const queryParams = parseKeyValuePairs(getAllFlags(args, "query"), "--query");
  const bodyArg = getFlag(args, "body");
  const outputPath = getFlag(args, "output");
  const paginate = hasFlag(args, "paginate");

  validateRequiredQueryParams(operation, queryParams);

  if (operation.bodySchema && bodyArg === undefined && !paginate) {
    fail(`${operation.id} requires --body with a JSON object or @file.`);
  }

  if (!operation.bodySchema && bodyArg !== undefined) {
    fail(`${operation.id} does not accept a request body.`);
  }

  const config = loadConfig();

  if (hasFlag(args, "dry-run")) {
    const url = buildOperationUrl(config.baseUrl, operation, pathParams, queryParams);
    printPayload({
      operationId: operation.id,
      method: operation.method,
      url,
      body: bodyArg ? await readBodyArgument(bodyArg) : null,
    });
    return;
  }

  const payload =
    paginate
      ? await paginateRequest(config, operation, pathParams, queryParams)
      : await requestJson(
          config,
          operation,
          pathParams,
          queryParams,
          bodyArg ? await readBodyArgument(bodyArg) : undefined,
        );

  await maybeWriteOutput(outputPath, payload);
  printPayload(payload);
}

function inferMimeType(filePath: string): string {
  const bunType = Bun.file(filePath).type;
  if (bunType) {
    return bunType.split(";")[0] ?? bunType;
  }

  const extension = extname(filePath).toLowerCase();
  const fallback: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
  };

  return fallback[extension] ?? "application/octet-stream";
}

async function commandAttachmentBody(args: ParsedArgs): Promise<void> {
  const filePath = getFlag(args, "file");
  if (!filePath) {
    fail("attachment-body requires --file /path/to/file");
  }

  const outputPath = getFlag(args, "output");
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    fail(`Attachment file does not exist: ${filePath}`);
  }

  const bytes = await file.bytes();
  const body = {
    ...(getFlag(args, "name") ? { name: getFlag(args, "name") } : {}),
    filename: getFlag(args, "filename") ?? basename(filePath),
    type: getFlag(args, "mime") ?? inferMimeType(filePath),
    content: Buffer.from(bytes).toString("base64"),
    ...(getFlag(args, "external-link") ? { externalLink: getFlag(args, "external-link") } : {}),
    ...(getFlag(args, "memo") ? { memo: getFlag(args, "memo") } : {}),
  };

  await maybeWriteOutput(outputPath, body);
  printPayload(body);
}

async function main(): Promise<void> {
  const argv = Bun.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help")) {
    console.log(usage());
    return;
  }

  const [command, ...rest] = argv;
  const args = parseArgs(rest);

  try {
    switch (command) {
      case "ops":
        await commandOps(args);
        return;
      case "describe": {
        const operationId = args.positionals[0];
        if (!operationId) {
          fail("describe requires <operationId>");
        }
        await commandDescribe(operationId, args);
        return;
      }
      case "call": {
        const operationId = args.positionals[0];
        if (!operationId) {
          fail("call requires <operationId>");
        }
        await commandCall(operationId, args);
        return;
      }
      case "attachment-body":
        await commandAttachmentBody(args);
        return;
      case "config":
        await commandConfig();
        return;
      default:
        fail(`Unknown command: ${command}\n\n${usage()}`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

void main();
