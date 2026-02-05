// API request/response types - shared between client and server

export interface ServeOptions {
  port?: number;
  headless?: boolean;
  cdpPort?: number;
  /** Directory to store persistent browser profiles (cookies, localStorage, etc.) */
  profileDir?: string;
  /** Browser driver to use - "auto" tries patchright first, then playwright */
  driver?: "playwright" | "patchright" | "auto";
  /** Anti-detection configuration */
  antiDetection?: AntiDetectionConfig;
}

export interface AntiDetectionConfig {
  /** Whether to enable stealth mode (removes automation flags) */
  stealth?: boolean;
  /** Custom user agent */
  userAgent?: string;
  /** Viewport size */
  viewport?: ViewportSize;
  /** FlareSolverr configuration for Cloudflare bypass */
  flaresolverr?: FlareSolverrConfig;
}

export interface PatchrightOptions {
  /** Enable stealth mode to evade bot detection */
  stealth: boolean;
  /** Additional browser args */
  args?: string[];
}

export interface FlareSolverrConfig {
  /** FlareSolverr service URL (default: http://localhost:8191) */
  baseUrl: string;
  /** Request timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Session TTL in minutes */
  sessionTtlMinutes?: number;
}

export interface FlareSolverrRequest {
  cmd: "request.get" | "request.post" | "sessions.create" | "sessions.list" | "sessions.destroy";
  url?: string;
  session?: string;
  maxTimeout?: number;
  cookies?: FlareSolverrCookie[];
  postData?: string;
  returnOnlyCookies?: boolean;
  session_ttl_minutes?: number;
}

export interface FlareSolverrResponse {
  status: string;
  message: string;
  solution?: {
    url: string;
    status: number;
    cookies: FlareSolverrCookie[];
    userAgent: string;
    headers?: Record<string, string>;
    response?: string;
  };
  sessions?: string[];
  startTimestamp: number;
  endTimestamp: number;
  version: string;
}

export interface FlareSolverrCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface SolveUrlOptions {
  /** Session ID to use (creates new if not provided) */
  sessionId?: string;
  /** Maximum time to wait for challenge resolution */
  maxTimeout?: number;
  /** Only return cookies, not full response */
  returnOnlyCookies?: boolean;
  /** Additional cookies to include */
  cookies?: FlareSolverrCookie[];
  /** POST data for POST requests */
  postData?: string;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface GetPageRequest {
  name: string;
  /** Optional viewport size for new pages */
  viewport?: ViewportSize;
}

export interface GetPageResponse {
  wsEndpoint: string;
  name: string;
  targetId: string; // CDP target ID for reliable page matching
}

export interface ListPagesResponse {
  pages: string[];
}

export interface ServerInfoResponse {
  wsEndpoint: string;
}
