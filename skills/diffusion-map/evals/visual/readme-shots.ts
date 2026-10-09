// Screenshots for the repository README, in English and Chinese, from synthetic demo maps.
// Usage: bun evals/visual/readme-shots.ts   → <repo>/docs/images/diffusion-map/{en,zh}-*.jpg
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const dir = import.meta.dir;
const outDir = join(dir, "../../../../docs/images/diffusion-map");
mkdirSync(outDir, { recursive: true });

type Shot = { name: string; hash: string; dark?: boolean; then?: (p: import("playwright").Page) => Promise<void> };

const LANGS: { lang: "en" | "zh"; fixtures: string; drop: string[]; shots: Shot[] }[] = [
  {
    lang: "en",
    fixtures: "fixtures-en.ts",
    drop: [],
    shots: [
      { name: "map", hash: "#/map/rust-ownership" },
      { name: "conversation", hash: "#/map/rust-ownership/node/mutexguard", then: (p) => p.getByText("Read all 2 conversations in order").click() },
      { name: "ideation-dark", hash: "#/map/local-first-notes/node/crdt", dark: true },
      { name: "home", hash: "#/" },
    ],
  },
  {
    lang: "zh",
    fixtures: "fixtures.ts",
    drop: ["distributed-systems", "quantum-intro"], // stress-test and empty maps are not for the README
    shots: [
      { name: "map", hash: "#/map/rust-ownership" },
      { name: "conversation", hash: "#/map/rust-ownership/node/mutexguard-raii", then: (p) => p.getByText("按时间顺序阅读全部 2 段对话").click() },
      { name: "ideation-dark", hash: "#/map/local-first-notes/node/crdt", dark: true },
      { name: "home", hash: "#/" },
    ],
  },
];

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
let port = 4831;
for (const { lang, fixtures, drop, shots } of LANGS) {
  const home = join(dir, "out", `readme-${lang}`);
  const env = { ...process.env, DIFFUSION_HOME: join(home, "diffusion"), CLAUDE_CONFIG_DIR: join(home, "claude"), CODEX_HOME: join(home, "codex") };
  await new Promise<void>((resolve, reject) =>
    spawn(process.execPath, [join(dir, fixtures), home], { env, stdio: "ignore" }).on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`${fixtures} exited ${c}`)))),
  );
  for (const slug of drop) rmSync(join(home, "diffusion", "maps", slug), { recursive: true, force: true });
  const server = spawn(process.execPath, [join(dir, "../../scripts/server.ts"), "--port", String(++port), "--idle-ms", "600000"], { env, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100 && !(await fetch(`${base}/api/health`).then((r) => r.ok, () => false)); i++) await Bun.sleep(100);

  for (const shot of shots) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: shot.dark ? "dark" : "light" });
    await ctx.addInitScript((l) => localStorage.setItem("dm-lang", l), lang);
    const page = await ctx.newPage();
    await page.goto(base + "/" + shot.hash);
    await page.waitForFunction(() => (window as any).__dmReady && document.fonts.status === "loaded");
    await page.waitForTimeout(1800);
    if (shot.then) {
      await shot.then(page);
      await page.waitForTimeout(1600);
    }
    await page.screenshot({ path: join(outDir, `${lang}-${shot.name}.jpg`), type: "jpeg", quality: 80 });
    await ctx.close();
    console.log(`✓ ${lang}-${shot.name}`);
  }
  server.kill();
}
await browser.close();
