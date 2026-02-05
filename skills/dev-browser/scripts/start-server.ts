import { serve } from "@/index.js";
import { execSync, exec } from "child_process";
import { mkdirSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const tmpDir = join(__dirname, "..", "tmp");
const profileDir = join(__dirname, "..", "profiles");

// FlareSolverr configuration
const FLARESOLVERR_PORT = parseInt(process.env.FLARESOLVERR_PORT ?? "8191", 10);
const FLARESOLVERR_CONTAINER_NAME = "dev-browser-flaresolverr";
const NO_FLARESOLVERR = process.env.NO_FLARESOLVERR === "true";

// Create tmp and profile directories if they don't exist
console.log("Creating tmp directory...");
mkdirSync(tmpDir, { recursive: true });
console.log("Creating profiles directory...");
mkdirSync(profileDir, { recursive: true });

// Install Playwright browsers if not already installed
console.log("Checking Playwright browser installation...");

function findPackageManager(): { name: string; command: string } | null {
  const managers = [
    { name: "bun", command: "bunx playwright install chromium" },
    { name: "pnpm", command: "pnpm exec playwright install chromium" },
    { name: "npm", command: "npx playwright install chromium" },
  ];

  for (const manager of managers) {
    try {
      execSync(`which ${manager.name}`, { stdio: "ignore" });
      return manager;
    } catch {
      // Package manager not found, try next
    }
  }
  return null;
}

function isChromiumInstalled(): boolean {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const playwrightCacheDir = join(homeDir, ".cache", "ms-playwright");

  if (!existsSync(playwrightCacheDir)) {
    return false;
  }

  // Check for chromium directories (e.g., chromium-1148, chromium_headless_shell-1148)
  try {
    const entries = readdirSync(playwrightCacheDir);
    return entries.some((entry) => entry.startsWith("chromium"));
  } catch {
    return false;
  }
}

try {
  if (!isChromiumInstalled()) {
    console.log("Playwright Chromium not found. Installing (this may take a minute)...");

    const pm = findPackageManager();
    if (!pm) {
      throw new Error("No package manager found (tried bun, pnpm, npm)");
    }

    console.log(`Using ${pm.name} to install Playwright...`);
    execSync(pm.command, { stdio: "inherit" });
    console.log("Chromium installed successfully.");
  } else {
    console.log("Playwright Chromium already installed.");
  }
} catch (error) {
  console.error("Failed to install Playwright browsers:", error);
  console.log("You may need to run: npx playwright install chromium");
}

// Check if server is already running
console.log("Checking for existing servers...");
try {
  const res = await fetch("http://localhost:9222", {
    signal: AbortSignal.timeout(1000),
  });
  if (res.ok) {
    console.log("Server already running on port 9222");
    process.exit(0);
  }
} catch {
  // Server not running, continue to start
}

// Clean up stale CDP port if HTTP server isn't running (crash recovery)
// This handles the case where Node crashed but Chrome is still running on 9223
try {
  const pid = execSync("lsof -ti:9223", { encoding: "utf-8" }).trim();
  if (pid) {
    console.log(`Cleaning up stale Chrome process on CDP port 9223 (PID: ${pid})`);
    execSync(`kill -9 ${pid}`);
  }
} catch {
  // No process on CDP port, which is expected
}

// Function to stop FlareSolverr Docker container
async function stopFlareSolverr(): Promise<void> {
  if (NO_FLARESOLVERR) {
    return;
  }

  try {
    // Check if FlareSolverr container exists
    const { stdout } = await execAsync(
      `docker ps -a --filter "name=${FLARESOLVERR_CONTAINER_NAME}" --format "{{.Names}}"`
    );

    if (stdout.trim() === FLARESOLVERR_CONTAINER_NAME) {
      console.log("\nStopping FlareSolverr container...");
      try {
        await execAsync(`docker stop ${FLARESOLVERR_CONTAINER_NAME}`);
        console.log("✓ FlareSolverr stopped");
      } catch {
        // Container might already be stopped
      }
    }
  } catch {
    // Docker might not be available, ignore
  }
}

console.log("Starting dev browser server...");
const headless = process.env.HEADLESS === "true";
const stealth = process.env.STEALTH === "true";
const driver = (process.env.DRIVER as "playwright" | "patchright" | "auto") ?? "auto";

const server = await serve({
  port: 9222,
  headless,
  profileDir,
  driver,
  antiDetection: stealth
    ? {
        stealth: true,
      }
    : undefined,
});

console.log(`Dev browser server started`);
console.log(`  WebSocket: ${server.wsEndpoint}`);
console.log(`  Tmp directory: ${tmpDir}`);
console.log(`  Profile directory: ${profileDir}`);
if (server.usingPatchright) {
  console.log(`  Driver: Patchright (stealth-enabled)`);
} else {
  console.log(`  Driver: Standard Playwright`);
}
if (stealth) {
  console.log(`  ✓ Stealth mode: enabled`);
}
if (!NO_FLARESOLVERR) {
  console.log(`  ✓ FlareSolverr: http://localhost:${FLARESOLVERR_PORT}`);
}
console.log(`\nReady`);
console.log(`\nPress Ctrl+C to stop`);

// Handle graceful shutdown
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`\n${signal} received. Shutting down gracefully...`);

  // Stop FlareSolverr first
  await stopFlareSolverr();

  // Stop the server
  try {
    await server.stop();
  } catch {
    // Server might already be stopped
  }

  console.log("Shutdown complete.");
  process.exit(0);
}

// Register signal handlers
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGHUP", () => gracefulShutdown("SIGHUP"));

// Handle uncaught errors
process.on("uncaughtException", async (err) => {
  console.error("Uncaught exception:", err);
  await gracefulShutdown("ERROR");
});

process.on("unhandledRejection", async (err) => {
  console.error("Unhandled rejection:", err);
  await gracefulShutdown("ERROR");
});

// Keep the process running
await new Promise(() => {});
