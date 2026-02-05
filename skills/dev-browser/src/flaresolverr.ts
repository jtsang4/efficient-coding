/**
 * FlareSolverr Client - Cloudflare Challenge Solver Integration
 *
 * FlareSolverr is a proxy server that bypasses Cloudflare and DDoS-GUARD protection.
 * This client communicates with the FlareSolverr HTTP API to solve challenges
 * and manage persistent sessions.
 *
 * @see https://github.com/FlareSolverr/FlareSolverr
 */

import type {
  FlareSolverrRequest,
  FlareSolverrResponse,
  FlareSolverrCookie,
  SolveUrlOptions,
} from "./types";

/**
 * FlareSolverr client options
 */
export interface FlareSolverrClientOptions {
  /** FlareSolverr service URL (default: http://localhost:8191) */
  baseUrl?: string;
  /** Default timeout for requests in ms (default: 60000) */
  defaultTimeout?: number;
  /** Session TTL in minutes */
  sessionTtlMinutes?: number;
}

/**
 * Result of solving a URL
 */
export interface SolveUrlResult {
  /** Solved URL */
  url: string;
  /** HTTP status code */
  status: number;
  /** Cookies from the solution */
  cookies: FlareSolverrCookie[];
  /** User agent used */
  userAgent: string;
  /** Response headers */
  headers?: Record<string, string>;
  /** Response body (HTML content) */
  html?: string;
}

/**
 * Client for interacting with FlareSolverr API
 *
 * Example usage:
 * ```typescript
 * const flaresolverr = new FlareSolverrClient();
 *
 * // Solve a Cloudflare-protected URL
 * const result = await flaresolverr.solveUrl("https://example.com");
 *
 * // Use session to persist cookies
 * const sessionId = await flaresolverr.createSession();
 * const result2 = await flaresolverr.solveUrl("https://example.com/page", { sessionId });
 * await flaresolverr.destroySession(sessionId);
 * ```
 */
export class FlareSolverrClient {
  private baseUrl: string;
  private defaultTimeout: number;
  private sessionTtlMinutes: number;

  constructor(options: FlareSolverrClientOptions = {}) {
    this.baseUrl = options.baseUrl?.replace(/\/$/, "") || "http://localhost:8191";
    this.defaultTimeout = options.defaultTimeout ?? 60000;
    this.sessionTtlMinutes = options.sessionTtlMinutes ?? 2;
  }

  /**
   * Check if FlareSolverr service is healthy
   */
  async health(): Promise<{ status: string; version?: string; userAgent?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      throw new Error(
        `FlareSolverr health check failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get FlareSolverr version info
   */
  async version(): Promise<{ msg: string; version: string; userAgent: string }> {
    try {
      const response = await fetch(this.baseUrl);
      if (!response.ok) {
        throw new Error(`Version check failed: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      throw new Error(
        `FlareSolverr version check failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Create a new session for persistence
   *
   * Sessions preserve cookies across requests, avoiding repeated challenge solving.
   *
   * @param sessionId Optional custom session ID
   * @returns The session ID
   */
  async createSession(sessionId?: string): Promise<string> {
    const request: FlareSolverrRequest = {
      cmd: "sessions.create",
      session: sessionId,
      session_ttl_minutes: this.sessionTtlMinutes,
    };

    const response = await this.sendRequest(request);

    if (response.status !== "ok") {
      throw new Error(`Failed to create session: ${response.message}`);
    }

    // The session ID is returned in the response (implementation specific)
    // FlareSolverr returns the session ID in the solution or uses the provided one
    return sessionId || response.solution?.userAgent || "default";
  }

  /**
   * List all active sessions
   */
  async listSessions(): Promise<string[]> {
    const request: FlareSolverrRequest = {
      cmd: "sessions.list",
    };

    const response = await this.sendRequest(request);

    if (response.status !== "ok") {
      throw new Error(`Failed to list sessions: ${response.message}`);
    }

    return response.sessions || [];
  }

  /**
   * Destroy a session
   *
   * @param sessionId The session ID to destroy
   */
  async destroySession(sessionId: string): Promise<void> {
    const request: FlareSolverrRequest = {
      cmd: "sessions.destroy",
      session: sessionId,
    };

    const response = await this.sendRequest(request);

    if (response.status !== "ok") {
      throw new Error(`Failed to destroy session: ${response.message}`);
    }
  }

  /**
   * Solve a GET request for a URL
   *
   * This handles Cloudflare/DDoS-GUARD challenges automatically and returns
   * the result including cookies that can be used in subsequent requests.
   *
   * @param url The URL to solve
   * @param options Options for the solve operation
   * @returns Solve result with cookies and response
   */
  async solveUrl(url: string, options: SolveUrlOptions = {}): Promise<SolveUrlResult> {
    const request: FlareSolverrRequest = {
      cmd: "request.get",
      url,
      session: options.sessionId,
      maxTimeout: options.maxTimeout ?? this.defaultTimeout,
      returnOnlyCookies: options.returnOnlyCookies,
      cookies: options.cookies,
    };

    const response = await this.sendRequest(request);

    if (response.status !== "ok" || !response.solution) {
      throw new Error(`Failed to solve URL: ${response.message}`);
    }

    return {
      url: response.solution.url,
      status: response.solution.status,
      cookies: response.solution.cookies,
      userAgent: response.solution.userAgent,
      headers: response.solution.headers,
      html: response.solution.response,
    };
  }

  /**
   * Solve a POST request
   *
   * @param url The URL to POST to
   * @param postData The POST data
   * @param options Options for the solve operation
   * @returns Solve result with cookies and response
   */
  async solvePost(
    url: string,
    postData: string,
    options: SolveUrlOptions = {}
  ): Promise<SolveUrlResult> {
    const request: FlareSolverrRequest = {
      cmd: "request.post",
      url,
      postData,
      session: options.sessionId,
      maxTimeout: options.maxTimeout ?? this.defaultTimeout,
      returnOnlyCookies: options.returnOnlyCookies,
      cookies: options.cookies,
    };

    const response = await this.sendRequest(request);

    if (response.status !== "ok" || !response.solution) {
      throw new Error(`Failed to solve POST request: ${response.message}`);
    }

    return {
      url: response.solution.url,
      status: response.solution.status,
      cookies: response.solution.cookies,
      userAgent: response.solution.userAgent,
      headers: response.solution.headers,
      html: response.solution.response,
    };
  }

  /**
   * Get cookies for a URL without full page fetch
   *
   * This is useful when you want to inject cookies into an existing browser context.
   *
   * @param url The URL to get cookies for
   * @param options Options for the solve operation
   * @returns Array of cookies
   */
  async getCookies(url: string, options: SolveUrlOptions = {}): Promise<FlareSolverrCookie[]> {
    const result = await this.solveUrl(url, {
      ...options,
      returnOnlyCookies: true,
    });
    return result.cookies;
  }

  /**
   * Send a request to the FlareSolverr API
   */
  private async sendRequest(request: FlareSolverrRequest): Promise<FlareSolverrResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/v1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as FlareSolverrResponse;
      return data;
    } catch (error) {
      if (error instanceof Error && error.message.includes("fetch failed")) {
        throw new Error(
          `Cannot connect to FlareSolverr at ${this.baseUrl}. ` +
            `Make sure FlareSolverr is running (docker run -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest)`
        );
      }
      throw error;
    }
  }
}

/**
 * Create a FlareSolverr client with default options
 */
export function createFlareSolverrClient(options?: FlareSolverrClientOptions): FlareSolverrClient {
  return new FlareSolverrClient(options);
}

/**
 * Convert FlareSolverr cookies to Playwright cookie format
 */
export function convertToPlaywrightCookies(
  cookies: FlareSolverrCookie[],
  domain: string
): Array<{
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}> {
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain || domain,
    path: cookie.path || "/",
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  }));
}
