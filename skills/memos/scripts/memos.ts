#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { OPERATIONS, OPERATIONS_BY_ID, type Operation } from "./operations";

type ArgMap = Map<string, string[]>;

type ParsedArgs = {
  positionals: string[];
  flags: ArgMap;
};

type Config = {
  baseUrl: string;
  accessToken: string;
  envPath: string;
};

type MemoRecord = {
  name?: string;
  state?: string;
  createTime?: string;
  updateTime?: string;
  displayTime?: string;
  content?: string;
  visibility?: string;
  tags?: unknown;
  pinned?: boolean;
  snippet?: string;
};

type MemoQueryOptions = {
  state: string;
  pageSize: number;
  onPage: (page: MemoRecord[], meta: { pageIndex: number; nextPageToken?: string }) => "continue" | "stop" | Promise<"continue" | "stop">;
};

type TimeWindow = {
  days: number;
  window: "rolling" | "calendar";
  timezone: string;
  start: Date;
  end: Date;
};

const SKILL_ROOT = resolve(import.meta.dir, "..");
const ENV_PATH = join(SKILL_ROOT, ".env");
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const MEMO_LIST_OPERATION = OPERATIONS_BY_ID.get("MemoService_ListMemos");

function usage(): string {
  return [
    "Usage:",
    "  bun run scripts/memos.ts ops [--service memoservice] [--search memo] [--json]",
    "  bun run scripts/memos.ts describe <operationId> [--json]",
    "  bun run scripts/memos.ts call <operationId> [--path key=value] [--query key=value] [--body JSON|@file|@-] [--paginate] [--dry-run] [--output file]",
    "  bun run scripts/memos.ts latest [--count 10] [--state NORMAL] [--include-content] [--dry-run] [--output file]",
    "  bun run scripts/memos.ts recent --days 7 [--window rolling|calendar] [--tz Asia/Shanghai] [--state NORMAL] [--include-content] [--dry-run] [--output file]",
    "  bun run scripts/memos.ts search [--text keyword] [--tag Thought] [--days 30] [--window rolling|calendar] [--tz Asia/Shanghai] [--limit 50] [--state NORMAL] [--include-content] [--dry-run] [--output file]",
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

function loadConfig(): Config {
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

function parseIntegerFlag(
  args: ParsedArgs,
  name: string,
  options: { defaultValue?: number; min?: number } = {},
): number | undefined {
  const raw = getFlag(args, name);
  if (raw === undefined) {
    return options.defaultValue;
  }

  if (!/^-?\d+$/.test(raw)) {
    fail(`--${name} must be an integer. Received: ${raw}`);
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value)) {
    fail(`--${name} must be a safe integer. Received: ${raw}`);
  }

  if (options.min !== undefined && value < options.min) {
    fail(`--${name} must be >= ${options.min}. Received: ${raw}`);
  }

  return value;
}

function parseStringFlag(args: ParsedArgs, name: string, defaultValue?: string): string | undefined {
  const raw = getFlag(args, name);
  if (raw === undefined) {
    return defaultValue;
  }

  const value = raw.trim();
  if (!value) {
    fail(`--${name} must be non-empty.`);
  }

  return value;
}

function parseEnumFlag<T extends string>(args: ParsedArgs, name: string, allowed: readonly T[], defaultValue: T): T {
  const raw = getFlag(args, name);
  if (raw === undefined) {
    return defaultValue;
  }

  if (allowed.includes(raw as T)) {
    return raw as T;
  }

  fail(`--${name} must be one of: ${allowed.join(", ")}. Received: ${raw}`);
}

function parseTimezoneFlag(args: ParsedArgs): string {
  const timeZone = parseStringFlag(args, "tz", DEFAULT_TIMEZONE) ?? DEFAULT_TIMEZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    fail(`--tz must be a valid IANA timezone such as Asia/Shanghai or America/Los_Angeles. Received: ${timeZone}`);
  }
}

function getTimeZoneParts(date: Date, timeZone: string): Record<string, number> {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const map: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type === "literal") {
      continue;
    }

    map[part.type] = Number.parseInt(part.value, 10);
  }

  return map;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getTimeZoneParts(date, timeZone);
  const utcFromLocalView = Date.UTC(
    parts.year,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  return utcFromLocalView - date.getTime();
}

function getLocalDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = getTimeZoneParts(date, timeZone);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

function getTimeZoneMidnightUtc(dateParts: { year: number; month: number; day: number }, timeZone: string): number {
  const baseUtc = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 0, 0, 0);
  let candidate = baseUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offset = getTimeZoneOffsetMs(new Date(candidate), timeZone);
    const adjusted = baseUtc - offset;
    if (adjusted === candidate) {
      break;
    }
    candidate = adjusted;
  }

  return candidate;
}

function buildTimeWindow(args: ParsedArgs, now: Date): TimeWindow | undefined {
  const days = parseIntegerFlag(args, "days", { min: 1 });
  if (days === undefined) {
    return undefined;
  }

  const window = parseEnumFlag(args, "window", ["rolling", "calendar"] as const, "rolling");
  const timezone = parseTimezoneFlag(args);
  const end = new Date(now);
  let start: Date;

  if (window === "rolling") {
    start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  } else {
    const localToday = getLocalDateParts(now, timezone);
    const targetDate = new Date(Date.UTC(localToday.year, localToday.month - 1, localToday.day));
    targetDate.setUTCDate(targetDate.getUTCDate() - days);
    start = new Date(
      getTimeZoneMidnightUtc(
        {
          year: targetDate.getUTCFullYear(),
          month: targetDate.getUTCMonth() + 1,
          day: targetDate.getUTCDate(),
        },
        timezone,
      ),
    );
  }

  return { days, window, timezone, start, end };
}

function getMemoTimestamp(memo: MemoRecord): string | undefined {
  return memo.displayTime ?? memo.createTime;
}

function getMemoTimeMs(memo: MemoRecord): number | undefined {
  const raw = getMemoTimestamp(memo);
  if (!raw) {
    return undefined;
  }

  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? undefined : ms;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function formatTimeInZone(dateLike: string | undefined, timeZone: string): string | null {
  if (!dateLike) {
    return null;
  }

  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString("sv-SE", {
    timeZone,
    hour12: false,
  });
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags.filter((item): item is string => typeof item === "string");
}

function projectMemo(memo: MemoRecord, options: { timeZone: string; includeContent: boolean }) {
  const timestamp = getMemoTimestamp(memo);
  const normalizedContent = typeof memo.content === "string" ? memo.content : "";
  const fallbackSnippet = typeof memo.snippet === "string" ? memo.snippet : "";
  const snippetSource = normalizedContent || fallbackSnippet;

  const projected: Record<string, unknown> = {
    name: memo.name ?? null,
    state: memo.state ?? null,
    createTime: memo.createTime ?? null,
    updateTime: memo.updateTime ?? null,
    displayTime: memo.displayTime ?? null,
    displayTimeLocal: formatTimeInZone(timestamp, options.timeZone),
    visibility: memo.visibility ?? null,
    tags: normalizeTags(memo.tags),
    pinned: memo.pinned ?? false,
    snippet: normalizeWhitespace(snippetSource).slice(0, 140),
  };

  if (options.includeContent) {
    projected.content = normalizedContent;
  }

  return projected;
}

function getOldestMemoTimeMs(page: MemoRecord[]): number | undefined {
  for (let index = page.length - 1; index >= 0; index -= 1) {
    const timeMs = getMemoTimeMs(page[index] as MemoRecord);
    if (timeMs !== undefined) {
      return timeMs;
    }
  }

  return undefined;
}

function matchesSearchFilters(memo: MemoRecord, texts: string[], tags: string[]): boolean {
  const content = typeof memo.content === "string" ? memo.content.toLowerCase() : "";
  const memoTags = new Set(normalizeTags(memo.tags));

  const textMatch =
    texts.length === 0 ||
    texts.some((text) => content.includes(text.toLowerCase()));

  const tagMatch =
    tags.length === 0 ||
    tags.some((tag) => memoTags.has(tag));

  return textMatch && tagMatch;
}

function requireMemoListOperation(): Operation {
  if (!MEMO_LIST_OPERATION) {
    fail("MemoService_ListMemos is missing from operations.ts.");
  }

  return MEMO_LIST_OPERATION;
}

function parseMemoPage(payload: unknown): { memos: MemoRecord[]; nextPageToken?: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { memos: [] };
  }

  const record = payload as Record<string, unknown>;
  const memos = Array.isArray(record.memos) ? (record.memos as MemoRecord[]) : [];
  const nextPageToken = typeof record.nextPageToken === "string" && record.nextPageToken.length > 0 ? record.nextPageToken : undefined;
  return { memos, nextPageToken };
}

async function scanMemos(config: Config, options: MemoQueryOptions): Promise<void> {
  const operation = requireMemoListOperation();
  let nextPageToken: string | undefined;

  for (let pageIndex = 0; pageIndex < 1000; pageIndex += 1) {
    const queryParams: Record<string, string> = {
      orderBy: "display_time desc",
      pageSize: String(options.pageSize),
    };

    if (options.state) {
      queryParams.state = options.state;
    }

    if (nextPageToken) {
      queryParams.pageToken = nextPageToken;
    }

    const payload = await requestJson(config, operation, {}, queryParams, undefined);
    const page = parseMemoPage(payload);
    const action = await options.onPage(page.memos, {
      pageIndex,
      nextPageToken: page.nextPageToken,
    });

    if (action === "stop") {
      return;
    }

    if (!page.nextPageToken) {
      return;
    }

    nextPageToken = page.nextPageToken;
  }
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

async function commandLatest(args: ParsedArgs): Promise<void> {
  const count = parseIntegerFlag(args, "count", { defaultValue: 10, min: 1 }) ?? 10;
  const state = parseStringFlag(args, "state", "NORMAL") ?? "NORMAL";
  const includeContent = hasFlag(args, "include-content");
  const outputPath = getFlag(args, "output");
  const timeZone = parseTimezoneFlag(args);
  const pageSize = Math.min(Math.max(count, 10), DEFAULT_PAGE_SIZE);

  if (hasFlag(args, "dry-run")) {
    const payload = {
      command: "latest",
      countRequested: count,
      state,
      includeContent,
      timezone: timeZone,
      strategy: {
        orderBy: "display_time desc",
        pageSize,
        localFiltering: false,
      },
    };
    await maybeWriteOutput(outputPath, payload);
    printPayload(payload);
    return;
  }

  const config = loadConfig();
  const memos: Record<string, unknown>[] = [];

  await scanMemos(config, {
    state,
    pageSize,
    onPage: (page) => {
      for (const memo of page) {
        memos.push(projectMemo(memo, { timeZone, includeContent }));
        if (memos.length >= count) {
          return "stop";
        }
      }
      return "continue";
    },
  });

  const payload = {
    command: "latest",
    countRequested: count,
    countReturned: memos.length,
    memos,
  };

  await maybeWriteOutput(outputPath, payload);
  printPayload(payload);
}

async function commandRecent(args: ParsedArgs): Promise<void> {
  const now = new Date();
  const timeWindow = buildTimeWindow(args, now);
  if (!timeWindow) {
    fail("recent requires --days N");
  }

  const state = parseStringFlag(args, "state", "NORMAL") ?? "NORMAL";
  const includeContent = hasFlag(args, "include-content");
  const outputPath = getFlag(args, "output");

  if (hasFlag(args, "dry-run")) {
    const payload = {
      command: "recent",
      days: timeWindow.days,
      window: timeWindow.window,
      timezone: timeWindow.timezone,
      windowStart: timeWindow.start.toISOString(),
      windowEnd: timeWindow.end.toISOString(),
      state,
      includeContent,
      strategy: {
        orderBy: "display_time desc",
        pageSize: DEFAULT_PAGE_SIZE,
        localFiltering: true,
      },
    };
    await maybeWriteOutput(outputPath, payload);
    printPayload(payload);
    return;
  }

  const threshold = timeWindow.start.getTime();
  const config = loadConfig();
  const memos: Record<string, unknown>[] = [];

  await scanMemos(config, {
    state,
    pageSize: DEFAULT_PAGE_SIZE,
    onPage: (page) => {
      for (const memo of page) {
        const timeMs = getMemoTimeMs(memo);
        if (timeMs !== undefined && timeMs >= threshold) {
          memos.push(projectMemo(memo, { timeZone: timeWindow.timezone, includeContent }));
        }
      }

      const oldestTimeMs = getOldestMemoTimeMs(page);
      if (oldestTimeMs !== undefined && oldestTimeMs < threshold) {
        return "stop";
      }

      return "continue";
    },
  });

  const payload = {
    command: "recent",
    days: timeWindow.days,
    window: timeWindow.window,
    timezone: timeWindow.timezone,
    windowStart: timeWindow.start.toISOString(),
    windowEnd: timeWindow.end.toISOString(),
    count: memos.length,
    memos,
  };

  await maybeWriteOutput(outputPath, payload);
  printPayload(payload);
}

async function commandSearch(args: ParsedArgs): Promise<void> {
  const texts = getAllFlags(args, "text")
    .map((value) => value.trim())
    .filter(Boolean);
  const tags = getAllFlags(args, "tag")
    .map((value) => value.trim())
    .filter(Boolean);

  if (texts.length === 0 && tags.length === 0) {
    fail("search requires at least one --text or --tag filter.");
  }

  const now = new Date();
  const timeWindow = buildTimeWindow(args, now);
  const state = parseStringFlag(args, "state", "NORMAL") ?? "NORMAL";
  const includeContent = hasFlag(args, "include-content");
  const outputPath = getFlag(args, "output");
  const timeZone = timeWindow?.timezone ?? parseTimezoneFlag(args);
  const limit = parseIntegerFlag(args, "limit", { defaultValue: 50, min: 1 }) ?? 50;
  const threshold = timeWindow?.start.getTime();

  if (hasFlag(args, "dry-run")) {
    const payload = {
      command: "search",
      timezone: timeZone,
      filters: {
        text: texts,
        tags,
        days: timeWindow?.days ?? null,
        window: timeWindow?.window ?? null,
        state,
        limit,
      },
      strategy: {
        orderBy: "display_time desc",
        pageSize: DEFAULT_PAGE_SIZE,
        localFiltering: true,
      },
    };
    await maybeWriteOutput(outputPath, payload);
    printPayload(payload);
    return;
  }

  const config = loadConfig();
  const memos: Record<string, unknown>[] = [];

  await scanMemos(config, {
    state,
    pageSize: DEFAULT_PAGE_SIZE,
    onPage: (page) => {
      for (const memo of page) {
        const timeMs = getMemoTimeMs(memo);
        if (threshold !== undefined && (timeMs === undefined || timeMs < threshold)) {
          continue;
        }

        if (!matchesSearchFilters(memo, texts, tags)) {
          continue;
        }

        memos.push(projectMemo(memo, { timeZone, includeContent }));
        if (memos.length >= limit) {
          return "stop";
        }
      }

      const oldestTimeMs = getOldestMemoTimeMs(page);
      if (threshold !== undefined && oldestTimeMs !== undefined && oldestTimeMs < threshold) {
        return "stop";
      }

      return "continue";
    },
  });

  const payload = {
    command: "search",
    timezone: timeZone,
    filters: {
      text: texts,
      tags,
      days: timeWindow?.days ?? null,
      window: timeWindow?.window ?? null,
      state,
      limit,
    },
    count: memos.length,
    memos,
  };

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
      case "latest":
        await commandLatest(args);
        return;
      case "recent":
        await commandRecent(args);
        return;
      case "search":
        await commandSearch(args);
        return;
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
