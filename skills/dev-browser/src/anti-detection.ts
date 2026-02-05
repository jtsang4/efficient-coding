/**
 * Anti-Detection Browser Launcher
 *
 * This module provides functions to launch browsers with anti-detection capabilities:
 * - Patchright integration for stealth automation
 * - Custom user agents and viewport
 * - Browser arg modification for removing automation flags
 *
 * @see https://github.com/Kaliiiiiiiiii-Vinyzu/patchright
 */

import type { Browser, BrowserContext, Page } from "playwright";

/**
 * Default stealth args for launching browsers
 *
 * These args help reduce bot detection signatures during browser automation.
 */
export const DEFAULT_STEALTH_ARGS = [
  // Remove automation flag
  "--disable-blink-features=AutomationControlled",
  // Disable Chrome's automation features
  "--disable-features=IsolateOrigins,site-per-process",
  // Disable devtools extensions
  "--disable-dev-shm-usage",
  "--disable-extensions",
  // Disable save password prompt
  "--disable-save-password-bubble",
  // Disable component extensions with background pages
  "--disable-component-extensions-with-background-pages",
  // Disable notifications
  "--disable-notifications",
  // Disable default apps
  "--disable-default-apps",
  // Disable background networking
  "--disable-background-networking",
  // Disable sync
  "--disable-sync",
  // Disable backgrounding renderer
  "--disable-backgrounding-occluded-windows",
  // Disable renderer backgrounding
  "--disable-renderer-backgrounding",
  // Disable background timer throttling
  "--disable-background-timer-throttling",
  // Disable breakpad
  "--disable-breakpad",
  // Disable client-side phishing
  "--disable-client-side-phishing-detection",
  // Disable component update
  "--disable-component-update",
  // Disable hang monitor
  "--disable-hang-monitor",
  // Disable IPC flooding
  "--disable-ipc-flooding-protection",
  // Disable popup blocking
  "--disable-popup-blocking",
  // Disable prompt on repost
  "--disable-prompt-on-repost",
  // Disable Domain Reliability Monitoring
  "--disable-domain-reliability",
  // Force color profile
  "--force-color-profile=srgb",
  // Metrics recording only
  "--metrics-recording-only",
  // Safebrowsing disabled (for automation)
  "--safebrowsing-disable-auto-update",
  // Enable automation mode but hide it
  "--enable-automation",
  // Password store basic
  "--password-store=basic",
  // Use mock keychain
  "--use-mock-keychain",
  // Use fake device for media stream
  "--use-fake-device-for-media-stream",
  // Use fake UI for media stream
  "--use-fake-ui-for-media-stream",
];

/**
 * UserAgent presets for popular browsers
 */
export const USER_AGENTS = {
  chrome: {
    windows:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    linux:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
  firefox: {
    windows:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
    linux: "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
  },
  safari: {
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  },
};

/**
 * Viewport presets for common device types
 */
export const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  laptop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 },
};

/**
 * Apply stealth configuration to browser args
 *
 * @param args Original browser args
 * @param options Stealth options
 * @returns Modified args with stealth flags
 */
export function applyStealthArgs(
  args: string[] = [],
  options: {
    userAgent?: string;
    viewport?: { width: number; height: number };
    locale?: string;
    timezone?: string;
  } = {}
): string[] {
  const stealthArgs = [...DEFAULT_STEALTH_ARGS];

  // Add user agent if provided
  if (options.userAgent) {
    stealthArgs.push(`--user-agent=${options.userAgent}`);
  }

  // Add locale if provided
  if (options.locale) {
    stealthArgs.push(`--lang=${options.locale}`);
  }

  // Add timezone if provided
  if (options.timezone) {
    stealthArgs.push(`--timezone=${options.timezone}`);
  }

  // Add window size if viewport provided
  if (options.viewport) {
    stealthArgs.push(`--window-size=${options.viewport.width},${options.viewport.height}`);
  }

  // Remove duplicate args (keep user's if they specified any)
  const userArgs = new Set(args);
  const filteredDefaults = stealthArgs.filter((arg) => {
    const key = arg.split("=")[0] ?? "";
    return !Array.from(userArgs).some((userArg) => userArg.startsWith(key));
  });

  return [...filteredDefaults, ...args];
}

/**
 * Remove automation flags from browser context
 *
 * This function removes the `navigator.webdriver` property and other
 * automation indicators from the page.
 *
 * @param page Playwright page instance
 */
export async function removeAutomationFlags(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Remove webdriver property
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    // Remove automation hints from chrome runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chrome = (window as unknown as Record<string, unknown>).chrome;
    if (chrome && typeof chrome === "object") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      const runtime = (chrome as Record<string, unknown>).runtime;
      if (runtime) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        (chrome as Record<string, unknown>).runtime = undefined;
      }
    }

    // Override permissions API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalQuery = (navigator.permissions as any).query.bind(navigator.permissions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator.permissions as any).query = (parameters: { name: string }) =>
      parameters.name === "notifications"
        ? Promise.resolve({
            state: Notification.permission,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any)
        : originalQuery(parameters);

    // Remove plugins length check indicator
    Object.defineProperty(navigator, "plugins", {
      get: () => [
        // Fake plugin entries to appear as normal browser
        {
          0: { type: "application/x-google-chrome-pdf" },
          description: "Portable Document Format",
          filename: "internal-pdf-viewer",
          length: 1,
          name: "Chrome PDF Plugin",
        },
        {
          0: { type: "application/pdf" },
          description: "Portable Document Format",
          filename: "internal-pdf-viewer2",
          length: 1,
          name: "Chrome PDF Viewer",
        },
      ],
    });

    // Add structuredClone if missing (for older browsers)
    if (typeof window.structuredClone === "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.structuredClone = (obj: any) => JSON.parse(JSON.stringify(obj));
    }
  });
}

/**
 * Apply runtime evasion patches to page
 *
 * These patches are executed in the browser context to hide automation traces.
 *
 * @param page Playwright page instance
 */
export async function applyStealthPatches(page: Page): Promise<void> {
  // Remove automation flags
  await removeAutomationFlags(page);

  // Add canvas noise for fingerprint randomization
  await page.addInitScript(() => {
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;

    // Slight noise to canvas to prevent fingerprinting
    HTMLCanvasElement.prototype.toDataURL = function (
      this: HTMLCanvasElement,
      type?: string,
      quality?: number
    ) {
      const context = this.getContext("2d");
      if (context) {
        const width = this.width;
        const height = this.height;
        if (width > 0 && height > 0) {
          const imageData = context.getImageData(0, 0, width, height);
          // Add imperceptible noise to first pixel
          if (imageData.data.length > 0) {
            const currentValue = imageData.data[0] ?? 0;
            imageData.data[0] = (currentValue + 1) % 256;
            context.putImageData(imageData, 0, 0);
          }
        }
      }
      return originalToDataURL.call(this, type, quality);
    };

    CanvasRenderingContext2D.prototype.getImageData = function (
      this: CanvasRenderingContext2D,
      sx: number,
      sy: number,
      sw: number,
      sh: number
    ) {
      const imageData = originalGetImageData.call(this, sx, sy, sw, sh);
      if (imageData.data.length > 0) {
        const currentValue = imageData.data[0] ?? 0;
        imageData.data[0] = (currentValue + 1) % 256;
      }
      return imageData;
    };
  });
}

/**
 * Detect if Patchright is available
 *
 * @returns True if patchright can be imported
 */
export async function isPatchrightAvailable(): Promise<boolean> {
  try {
    // @ts-ignore - patchright is optional dependency
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (import("patchright") as Promise<any>);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the browser driver module (patchright or playwright)
 *
 * @param preferPatchright Whether to prefer patchright over playwright
 * @returns The browser driver module
 */
export async function getBrowserDriver(
  preferPatchright = true
): Promise<typeof import("playwright")> {
  if (preferPatchright) {
    try {
      // @ts-ignore - patchright is optional dependency
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (await import("patchright")) as typeof import("playwright");
    } catch {
      console.log("Patchright not available, falling back to Playwright");
    }
  }
  return await import("playwright");
}

/**
 * Launch options for anti-detection browser
 */
export interface AntiDetectionLaunchOptions {
  /** Use patchright if available */
  usePatchright?: boolean;
  /** Enable stealth mode */
  stealth?: boolean;
  /** Run in headless mode */
  headless?: boolean;
  /** Custom user agent */
  userAgent?: string;
  /** Viewport size */
  viewport?: { width: number; height: number };
  /** Custom browser args */
  args?: string[];
  /** Browser locale */
  locale?: string;
  /** Timezone ID */
  timezone?: string;
  /** User data directory for persistent context */
  userDataDir?: string;
  /** CDP debugging port */
  cdpPort?: number;
  /** Proxy server URL */
  proxy?: { server: string; bypass?: string; username?: string; password?: string };
}

/**
 * Launch a browser with anti-detection configuration
 *
 * This function attempts to use Patchright if available and configured,
 * otherwise falls back to Playwright with manual stealth patches.
 *
 * @param options Launch options
 * @returns Browser context
 */
export async function launchBrowser(
  options: AntiDetectionLaunchOptions = {}
): Promise<BrowserContext> {
  const {
    usePatchright = true,
    stealth = true,
    headless = false,
    userAgent,
    viewport,
    args = [],
    locale = "en-US",
    timezone = "America/New_York",
    userDataDir,
    cdpPort,
    proxy,
  } = options;

  // Apply stealth args if enabled
  const launchArgs = stealth
    ? applyStealthArgs(args, { userAgent, viewport, locale, timezone })
    : args;

  // Add CDP port if specified
  if (cdpPort) {
    launchArgs.push(`--remote-debugging-port=${cdpPort}`);
  }

  // Get browser driver
  const driver = await getBrowserDriver(usePatchright);
  const { chromium } = driver;

  // Launch browser context
  let context: BrowserContext;

  if (userDataDir) {
    // Launch persistent context
    context = await chromium.launchPersistentContext(userDataDir, {
      headless,
      args: launchArgs,
      locale,
      timezoneId: timezone,
      viewport: viewport ?? { width: 1920, height: 1080 },
      proxy,
    });
  } else {
    // Launch temporary context
    const browser = await chromium.launch({
      headless,
      args: launchArgs,
    });

    context = await browser.newContext({
      locale,
      timezoneId: timezone,
      viewport: viewport ?? { width: 1920, height: 1080 },
      userAgent,
      proxy,
    });
  }

  // Apply manual stealth patches if stealth enabled and not using patchright
  if (stealth && !(await isPatchrightAvailable())) {
    const pages = context.pages();
    for (const page of pages) {
      await applyStealthPatches(page);
    }

    // Apply to new pages
    context.on("page", (page) => {
      applyStealthPatches(page).catch(console.error);
    });
  }

  return context;
}

/**
 * Configure a page for anti-detection
 *
 * This applies runtime patches to an existing page.
 *
 * @param page Page to configure
 */
export async function configurePageForAntiDetection(page: Page): Promise<void> {
  await applyStealthPatches(page);
}

/**
 * Get a random user agent from presets
 *
 * @param browser Browser type preference
 * @param platform Platform preference
 * @returns User agent string
 */
export function getRandomUserAgent(
  browser: "chrome" | "firefox" | "safari" = "chrome",
  platform?: "windows" | "mac" | "linux"
): string {
  const platforms = platform ? [platform] : (["windows", "mac", "linux"] as const);
  const randomPlatform = platforms[Math.floor(Math.random() * platforms.length)];

  if (browser === "safari") {
    return USER_AGENTS.safari.mac;
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!randomPlatform) {
    return USER_AGENTS.chrome.windows;
  }

  const agent = USER_AGENTS[browser][randomPlatform];
  return agent ?? USER_AGENTS.chrome.windows;
}
