#!/usr/bin/env bun

import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { Command } from "commander";
import { config as dotenvConfig } from "dotenv";
import * as cheerio from "cheerio";
import sanitizeFilename from "sanitize-filename";
import TurndownService from "turndown";

type JsonObject = Record<string, unknown>;

type CuboxListResponse<T> = {
  code: number;
  message: string;
  data: {
    pageCount?: number;
    totalCounts?: number;
    list?: T[];
  };
};

type CuboxCard = {
  cardId: string;
  title: string;
  description?: string | null;
  url?: string | null;
  domain?: string | null;
  resourceKey?: string | null;
  snapKey?: string | null;
  content?: string | null;
  contentId?: string | null;
  articleWordCount?: number | null;
  coverKey?: string | null;
  littleIcon?: string | null;
  isArchived?: boolean | null;
  hasStar?: boolean | null;
  hasMark?: boolean | null;
  isRead?: boolean | null;
  markCount?: number | null;
  groupId?: string | null;
  groupName?: string | null;
  createTime?: string | null;
  updateTime?: string | null;
  status?: string | null;
  isParsed?: boolean | null;
  inBlackOrWhiteList?: boolean | null;
  type?: number | null;
  tags?: unknown[] | null;
  marks?: unknown[] | null;
  summary?: string | null;
  hasInsight?: boolean | null;
};

type CuboxDetailResponse = {
  code: number;
  message: string;
  data: CuboxCard & {
    content: string;
  };
};

type SearchMode = "preview" | "quick" | "full-text";

type SearchRunSummary = {
  keyword: string;
  mode: SearchMode;
  totalCounts: number;
  pageCount: number;
  fetchedPages: number;
  fetchedCards: number;
};

type AggregatedCard = CuboxCard & {
  cleanTitle: string;
  cleanDescription: string;
  matchedKeywords: string[];
  matchedModes: SearchMode[];
  hitCount: number;
  score: number;
};

type ExportedImage = {
  sourceUrl: string;
  localPath: string;
  relativePath: string;
};

type DetailExport = {
  cardId: string;
  title: string;
  articleDir: string;
  markdownPath: string;
  htmlPath: string;
  metadataPath: string;
  downloadedImages: ExportedImage[];
};

type SearchOptions = {
  topic: string;
  keywords: string[];
  modes: SearchMode[];
  maxPages: number;
  pageSize: number;
  maxResults: number;
  archiving: boolean;
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
dotenvConfig({ path: path.join(skillRoot, ".env"), override: false, quiet: true });
dotenvConfig({ quiet: true });

const MODE_WEIGHT: Record<SearchMode, number> = {
  preview: 1,
  quick: 2,
  "full-text": 3,
};

const program = new Command();

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseExtraHeaders(): Record<string, string> {
  const raw = process.env.CUBOX_EXTRA_HEADERS_JSON?.trim();
  if (!raw) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `CUBOX_EXTRA_HEADERS_JSON is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("CUBOX_EXTRA_HEADERS_JSON must be a JSON object.");
  }

  return Object.fromEntries(
    Object.entries(parsed).flatMap(([key, value]) => {
      if (typeof value !== "string" || !value.trim()) {
        return [];
      }
      return [[key, value]];
    }),
  );
}

function decodeHtml(input: string | null | undefined): string {
  if (!input) {
    return "";
  }
  return cheerio.load(`<body>${input}</body>`).text().replace(/\s+/g, " ").trim();
}

function cleanTitle(input: string | null | undefined): string {
  return decodeHtml(input);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function coerceNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function ensureSearchModes(values: string[]): SearchMode[] {
  const normalized = uniqueStrings(values.length ? values : ["preview", "quick", "full-text"]);
  const modes: SearchMode[] = [];

  for (const value of normalized) {
    if (value === "preview" || value === "quick" || value === "full-text") {
      modes.push(value);
      continue;
    }
    if (value === "all") {
      return ["preview", "quick", "full-text"];
    }
    throw new Error(`Unsupported mode: ${value}`);
  }

  return modes.length ? modes : ["preview", "quick", "full-text"];
}

function defaultCollectionRoot(): string {
  return path.join(os.tmpdir(), "cubox-collection");
}

function safeJson(data: unknown) {
  return JSON.stringify(data, null, 2);
}

async function ensureDir(target: string) {
  await fs.mkdir(target, { recursive: true });
}

async function writeJson(target: string, data: unknown) {
  await fs.writeFile(target, `${safeJson(data)}\n`, "utf8");
}

function slugifyTitle(title: string, cardId: string): string {
  const slug = sanitizeFilename(title)
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${cardId}-${slug || "article"}`;
}

function inferExtension(urlString: string, contentType: string | null): string {
  try {
    const url = new URL(urlString);
    const extFromPath = path.extname(url.pathname);
    if (extFromPath && extFromPath.length <= 8) {
      return extFromPath;
    }
  } catch {
    // Ignore and fall back to content type.
  }

  if (!contentType) {
    return ".bin";
  }

  const normalized = contentType.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
  };
  return map[normalized] ?? ".bin";
}

function buildMarkdown(detail: CuboxCard, body: string): string {
  const metadataLines = [
    `# ${detail.title}`,
    "",
    `- Card ID: \`${detail.cardId}\``,
    `- URL: ${detail.url || ""}`,
    `- Domain: ${detail.domain || ""}`,
    `- Group: ${detail.groupName || ""}`,
    `- Created: ${detail.createTime || ""}`,
    `- Updated: ${detail.updateTime || ""}`,
  ];

  const cleanedBody = body.replace(/\n{3,}/g, "\n\n").trim();
  return `${metadataLines.join("\n")}\n\n${cleanedBody ? `${cleanedBody}\n` : ""}`;
}

function collectValue(value: string, previous: string[] = []) {
  previous.push(value);
  return previous;
}

function createTurndownService() {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
  });

  service.remove("script");
  service.remove("style");

  service.addRule("flattenSpan", {
    filter: ["span"],
    replacement(content) {
      return content;
    },
  });

  service.addRule("preserveVideoLinks", {
    filter(node) {
      return node.nodeName === "A" && node.getAttribute("data-cubox-media-type") === "video";
    },
    replacement(content, node) {
      const href = node.getAttribute("href") || "";
      const label = content.trim() || "Video";
      return `\n[${label}](${href})\n`;
    },
  });

  return service;
}

class CuboxClient {
  private readonly baseUrl: string;
  private readonly authorization: string;
  private readonly baseHeaders: Record<string, string>;

  constructor() {
    this.baseUrl = process.env.CUBOX_API_BASE?.trim() || "https://cubox.pro";
    this.authorization = getRequiredEnv("CUBOX_AUTHORIZATION");
    this.baseHeaders = {
      accept: "application/json",
      authorization: this.authorization,
      ...parseExtraHeaders(),
    };

    if (process.env.CUBOX_ACCEPT_LANGUAGE?.trim()) {
      this.baseHeaders["accept-language"] = process.env.CUBOX_ACCEPT_LANGUAGE.trim();
    }

    if (process.env.CUBOX_USER_AGENT?.trim()) {
      this.baseHeaders["user-agent"] = process.env.CUBOX_USER_AGENT.trim();
    }
  }

  private async requestJson<T>(pathname: string, query?: Record<string, string | number | boolean>) {
    const url = new URL(pathname, this.baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      headers: this.baseHeaders,
    });

    if (!response.ok) {
      throw new Error(`Cubox request failed: ${response.status} ${response.statusText} (${url})`);
    }

    const json = (await response.json()) as T & { code?: number; message?: string };
    if (typeof json === "object" && json !== null && "code" in json && json.code !== 200) {
      throw new Error(`Cubox API returned code=${json.code}: ${json.message ?? ""}`);
    }

    return json;
  }

  async getContext() {
    const [groups, tags, keywordList] = await Promise.all([
      this.requestJson<{ code: number; data: unknown[] }>("/c/api/v2/group/my"),
      this.requestJson<{ code: number; data: { tagList: unknown[] } }>("/c/api/norm/tag/list"),
      this.requestJson<{ code: number; data: { cards: CuboxCard[]; content: unknown[] } }>(
        "/c/api/norm/card/keyword/list",
      ),
    ]);

    return {
      groups: groups.data,
      tags: tags.data.tagList,
      keywordList: keywordList.data,
    };
  }

  async searchPreview(keyword: string, page: number, pageSize: number, archiving: boolean) {
    return this.requestJson<CuboxListResponse<CuboxCard>>("/c/api/norm/card/search/preview", {
      keyword,
      page,
      pageSize,
      archiving,
    });
  }

  async query(keyword: string, mode: Exclude<SearchMode, "preview">, page: number, archiving: boolean) {
    return this.requestJson<CuboxListResponse<CuboxCard>>("/c/api/norm/card/query", {
      page,
      orderType: mode === "quick" ? 4 : 5,
      asc: false,
      isArticle: false,
      keyword,
      searchMode: mode,
      archiving,
    });
  }

  async getDetail(cardId: string) {
    return this.requestJson<CuboxDetailResponse>("/c/api/norm/card/detail", {
      cardId,
    });
  }
}

function mergeCards(
  index: Map<string, AggregatedCard>,
  keyword: string,
  mode: SearchMode,
  cards: CuboxCard[],
) {
  for (const card of cards) {
    const existing = index.get(card.cardId);
    const cleanCardTitle = cleanTitle(card.title);
    const cleanCardDescription = cleanTitle(card.description ?? "");

    if (!existing) {
      index.set(card.cardId, {
        ...card,
        title: cleanCardTitle,
        description: cleanCardDescription,
        cleanTitle: cleanCardTitle,
        cleanDescription: cleanCardDescription,
        matchedKeywords: [keyword],
        matchedModes: [mode],
        hitCount: 1,
        score: MODE_WEIGHT[mode],
      });
      continue;
    }

    existing.matchedKeywords = uniqueStrings([...existing.matchedKeywords, keyword]);
    existing.matchedModes = uniqueStrings([...existing.matchedModes, mode]) as SearchMode[];
    existing.hitCount += 1;
    existing.score += MODE_WEIGHT[mode];
    existing.title = cleanCardTitle || existing.title;
    existing.description = cleanCardDescription || existing.description;
    existing.cleanTitle = existing.title;
    existing.cleanDescription = existing.description ?? "";
    existing.url = card.url || existing.url;
    existing.domain = card.domain || existing.domain;
    existing.articleWordCount = card.articleWordCount ?? existing.articleWordCount;
    existing.groupId = card.groupId ?? existing.groupId;
    existing.groupName = card.groupName ?? existing.groupName;
    existing.updateTime = card.updateTime ?? existing.updateTime;
    existing.createTime = card.createTime ?? existing.createTime;
  }
}

async function executeSearch(client: CuboxClient, options: SearchOptions) {
  const keywords = uniqueStrings(options.keywords.length ? options.keywords : [options.topic]);
  if (!keywords.length) {
    throw new Error("At least one keyword or a topic is required.");
  }

  const index = new Map<string, AggregatedCard>();
  const searchRuns: SearchRunSummary[] = [];

  for (const keyword of keywords) {
    for (const mode of options.modes) {
      let page = 1;
      let pageCount = 1;
      let totalCounts = 0;
      let fetchedCards = 0;

      while (page <= Math.min(pageCount, options.maxPages)) {
        if (mode === "preview") {
          const response = await client.searchPreview(keyword, page, options.pageSize, options.archiving);
          pageCount = Math.max(response.data.pageCount ?? 1, 1);
          totalCounts = response.data.totalCounts ?? 0;
          const cards = response.data.list ?? [];
          fetchedCards += cards.length;
          mergeCards(index, keyword, mode, cards);
        } else {
          const response = await client.query(keyword, mode, page, options.archiving);
          pageCount = Math.max(response.data.pageCount ?? 1, 1);
          totalCounts = response.data.totalCounts ?? 0;
          const cards = response.data.list ?? [];
          fetchedCards += cards.length;
          mergeCards(index, keyword, mode, cards);
        }

        page += 1;
      }

      searchRuns.push({
        keyword,
        mode,
        totalCounts,
        pageCount,
        fetchedPages: Math.min(pageCount, options.maxPages),
        fetchedCards,
      });
    }
  }

  const results = [...index.values()]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if ((right.articleWordCount ?? 0) !== (left.articleWordCount ?? 0)) {
        return (right.articleWordCount ?? 0) - (left.articleWordCount ?? 0);
      }
      return (right.updateTime ?? "").localeCompare(left.updateTime ?? "");
    })
    .slice(0, options.maxResults);

  return {
    topic: options.topic,
    keywords,
    modes: options.modes,
    archiving: options.archiving,
    searchRuns,
    totalUniqueCards: index.size,
    results,
  };
}

function resolveImageSource(element: cheerio.Cheerio<any>, articleUrl: string | null | undefined) {
  const candidates = [
    element.attr("data-cubox-image-src"),
    element.attr("src"),
    element.attr("data-src"),
    element.attr("data-original"),
  ]
    .map((value) => value?.trim())
    .filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      return new URL(candidate, articleUrl || "https://cubox.pro").toString();
    } catch {
      continue;
    }
  }

  return null;
}

async function downloadToFile(url: string, target: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText} (${url})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(target, Buffer.from(arrayBuffer));
  return response.headers.get("content-type");
}

async function transformDetailToLocalAssets(
  detail: CuboxCard & { content: string },
  articleDir: string,
): Promise<{ markdown: string; html: string; downloadedImages: ExportedImage[] }> {
  const $ = cheerio.load(detail.content, {
    decodeEntities: false,
  });

  $(".reader-title").remove();
  $(".reader-metadata").remove();
  $(".reader-footer").remove();

  const imagesDir = path.join(articleDir, "images");
  await ensureDir(imagesDir);

  const downloadedImages: ExportedImage[] = [];
  const imageNodes = $("img").toArray();

  for (let index = 0; index < imageNodes.length; index += 1) {
    const node = imageNodes[index];
    const element = $(node);
    const sourceUrl = resolveImageSource(element, detail.url);

    if (!sourceUrl) {
      element.remove();
      continue;
    }

    const fallbackName = `image-${String(index + 1).padStart(2, "0")}`;
    let relativePath = sourceUrl;
    let localPath = sourceUrl;

    try {
      const contentType = await downloadToFile(sourceUrl, path.join(imagesDir, `${fallbackName}.bin`));
      const extension = inferExtension(sourceUrl, contentType);
      localPath = path.join(imagesDir, `${fallbackName}${extension}`);
      await fs.rename(path.join(imagesDir, `${fallbackName}.bin`), localPath);
      relativePath = path.relative(articleDir, localPath);
      downloadedImages.push({
        sourceUrl,
        localPath,
        relativePath,
      });
      element.attr("src", relativePath);
    } catch {
      element.attr("src", sourceUrl);
    }

    const alt = element.attr("alt")?.trim() || `Image ${index + 1}`;
    element.attr("alt", alt);
    element.removeAttr("data-cubox-image-src");
    element.removeAttr("data-cubox-image-load");
    element.removeAttr("data-cubox-image-index");
    element.removeAttr("loading");
  }

  let videoIndex = 0;
  for (const node of $("video").toArray()) {
    const element = $(node);
    const source = element.attr("src") || element.find("source").first().attr("src");
    if (!source) {
      element.remove();
      continue;
    }

    let resolved = source;
    try {
      resolved = new URL(source, detail.url || "https://cubox.pro").toString();
    } catch {
      // Keep original source string.
    }

    videoIndex += 1;
    const anchor = `<p><a data-cubox-media-type="video" href="${resolved}">Video ${videoIndex}</a></p>`;
    element.replaceWith(anchor);
  }

  const articleHtml = $.html().trim();
  const turndown = createTurndownService();
  const markdownBody = turndown.turndown(articleHtml).replace(/\n{3,}/g, "\n\n").trim();

  return {
    markdown: buildMarkdown(detail, markdownBody),
    html: articleHtml,
    downloadedImages,
  };
}

async function exportCardDetail(
  client: CuboxClient,
  cardId: string,
  collectionRoot: string,
): Promise<DetailExport> {
  const response = await client.getDetail(cardId);
  const detail = response.data;
  const articleDir = path.join(collectionRoot, slugifyTitle(detail.title, detail.cardId));
  await ensureDir(articleDir);

  const transformed = await transformDetailToLocalAssets(detail, articleDir);
  const markdownPath = path.join(articleDir, "article.md");
  const htmlPath = path.join(articleDir, "article.html");
  const metadataPath = path.join(articleDir, "metadata.json");

  await fs.writeFile(markdownPath, transformed.markdown, "utf8");
  await fs.writeFile(htmlPath, `${transformed.html}\n`, "utf8");
  await writeJson(metadataPath, {
    ...detail,
    exportedAt: new Date().toISOString(),
    downloadedImages: transformed.downloadedImages,
  });

  return {
    cardId: detail.cardId,
    title: detail.title,
    articleDir,
    markdownPath,
    htmlPath,
    metadataPath,
    downloadedImages: transformed.downloadedImages,
  };
}

function printSearchSummary(searchResult: Awaited<ReturnType<typeof executeSearch>>) {
  console.log(`# Topic: ${searchResult.topic}`);
  console.log("");
  console.log(`Keywords: ${searchResult.keywords.join(", ")}`);
  console.log(`Modes: ${searchResult.modes.join(", ")}`);
  console.log(`Unique cards: ${searchResult.totalUniqueCards}`);
  console.log("");

  for (const card of searchResult.results) {
    console.log(`- [score=${card.score}] ${card.title}`);
    console.log(`  cardId=${card.cardId}`);
    console.log(`  modes=${card.matchedModes.join(", ")} keywords=${card.matchedKeywords.join(", ")}`);
    if (card.url) {
      console.log(`  url=${card.url}`);
    }
  }
}

program.name("cubox").description("Search and export Cubox collection content.");

program
  .command("context")
  .option("--json", "Output JSON")
  .action(async (options: { json?: boolean }) => {
    const client = new CuboxClient();
    const context = await client.getContext();
    if (options.json) {
      console.log(safeJson(context));
      return;
    }

    console.log(`# Groups: ${Array.isArray(context.groups) ? context.groups.length : 0}`);
    console.log(`# Tags: ${Array.isArray(context.tags) ? context.tags.length : 0}`);
    console.log(`# Keyword cards: ${context.keywordList.cards.length}`);
  });

function addSearchOptions(command: Command) {
  return command
    .requiredOption("--topic <topic>", "Research topic")
    .option("--keyword <keyword>", "Repeatable keyword", collectValue, [])
    .option("--mode <mode>", "preview | quick | full-text | all", collectValue, [])
    .option("--max-pages <number>", "Pages per mode and keyword", "1")
    .option("--page-size <number>", "Preview page size", "50")
    .option("--max-results <number>", "Maximum deduplicated results", "20")
    .option("--archiving", "Search archived cards")
    .option("--json", "Output JSON");
}

addSearchOptions(program.command("search").description("Search Cubox by topic and keywords")).action(
  async (rawOptions: Record<string, unknown>) => {
    const client = new CuboxClient();
    const options: SearchOptions = {
      topic: String(rawOptions.topic),
      keywords: uniqueStrings((rawOptions.keyword as string[] | undefined) ?? []),
      modes: ensureSearchModes(((rawOptions.mode as string[] | undefined) ?? []) as string[]),
      maxPages: coerceNumber(rawOptions.maxPages as string | undefined, 1),
      pageSize: coerceNumber(rawOptions.pageSize as string | undefined, 50),
      maxResults: coerceNumber(rawOptions.maxResults as string | undefined, 20),
      archiving: Boolean(rawOptions.archiving),
    };

    const result = await executeSearch(client, options);
    if (rawOptions.json) {
      console.log(safeJson(result));
      return;
    }
    printSearchSummary(result);
  },
);

addSearchOptions(program.command("research").description("Search and export detail files for the best hits"))
  .option("--detail-limit <number>", "How many details to fetch", "5")
  .option("--collection-root <path>", "Override temp collection root")
  .action(async (rawOptions: Record<string, unknown>) => {
    const client = new CuboxClient();
    const options: SearchOptions = {
      topic: String(rawOptions.topic),
      keywords: uniqueStrings((rawOptions.keyword as string[] | undefined) ?? []),
      modes: ensureSearchModes(((rawOptions.mode as string[] | undefined) ?? []) as string[]),
      maxPages: coerceNumber(rawOptions.maxPages as string | undefined, 1),
      pageSize: coerceNumber(rawOptions.pageSize as string | undefined, 50),
      maxResults: coerceNumber(rawOptions.maxResults as string | undefined, 20),
      archiving: Boolean(rawOptions.archiving),
    };

    const searchResult = await executeSearch(client, options);
    const collectionRoot = rawOptions.collectionRoot
      ? path.resolve(String(rawOptions.collectionRoot))
      : defaultCollectionRoot();
    await ensureDir(collectionRoot);
    const detailLimit = Math.min(
      coerceNumber(rawOptions.detailLimit as string | undefined, 5),
      searchResult.results.length,
    );

    const details: DetailExport[] = [];
    for (const card of searchResult.results.slice(0, detailLimit)) {
      details.push(await exportCardDetail(client, card.cardId, collectionRoot));
    }

    const output = {
      ...searchResult,
      collectionRoot,
      details,
    };

    if (rawOptions.json) {
      console.log(safeJson(output));
      return;
    }

    printSearchSummary(searchResult);
    console.log("");
    console.log(`Collection root: ${collectionRoot}`);
    for (const detail of details) {
      console.log(`- Exported ${detail.title}`);
      console.log(`  ${detail.markdownPath}`);
    }
  });

program
  .command("fetch-detail")
  .requiredOption("--card-id <cardId>", "Cubox card ID")
  .option("--collection-root <path>", "Override temp collection root")
  .option("--json", "Output JSON")
  .action(async (options: { cardId: string; collectionRoot?: string; json?: boolean }) => {
    const client = new CuboxClient();
    const collectionRoot = options.collectionRoot
      ? path.resolve(options.collectionRoot)
      : defaultCollectionRoot();
    await ensureDir(collectionRoot);
    const detail = await exportCardDetail(client, options.cardId, collectionRoot);
    if (options.json) {
      console.log(safeJson(detail));
      return;
    }
    console.log(`Exported: ${detail.title}`);
    console.log(detail.markdownPath);
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
