// Visual review harness: builds synthetic fixtures, starts a private viewer, captures every
// scenario the rubric asks about, and measures the hard gates (frame rate, label overlap, axe).
// Usage: bun evals/visual/capture.ts [--only name,name]   (uses the installed Google Chrome)
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const dir = import.meta.dir;
const out = join(dir, "out");
const home = join(out, "home");
mkdirSync(out, { recursive: true });

const only = process.argv.includes("--only") ? new Set(process.argv[process.argv.indexOf("--only") + 1]!.split(",")) : null;
const PORT = 4811;
const env = {
  ...process.env,
  DIFFUSION_HOME: join(home, "diffusion"),
  CLAUDE_CONFIG_DIR: join(home, "claude"),
  CODEX_HOME: join(home, "codex"),
};

await new Promise<void>((resolve, reject) => {
  const p = spawn(process.execPath, [join(dir, "fixtures.ts"), home], { env, stdio: "inherit" });
  p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`fixtures exited ${code}`))));
});

const server = spawn(process.execPath, [join(dir, "../../scripts/server.ts"), "--port", String(PORT), "--idle-ms", "600000"], { env, stdio: "ignore" });
const base = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {}
  await Bun.sleep(100);
}

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
const report: Record<string, unknown> = {};
const axeSource = readFileSync(join(dir, "../../node_modules/axe-core/axe.min.js"), "utf8");

async function open(name: string, opts: { width?: number; height?: number; dark?: boolean; reduced?: boolean } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: opts.width ?? 1440, height: opts.height ?? 900 },
    deviceScaleFactor: 2,
    colorScheme: opts.dark ? "dark" : "light",
    reducedMotion: opts.reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => ((report[`${name}:errors`] ??= []) as string[]).push(String(e)));
  page.on("console", (m) => m.type() === "error" && ((report[`${name}:console`] ??= []) as string[]).push(m.text()));
  return page;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(out, `${name}.png`) });
}

async function settle(page: Page, ms = 1800) {
  await page.waitForFunction(() => (window as any).__dmReady && document.fonts.status === "loaded");
  await page.waitForTimeout(ms);
}

async function axe(page: Page, name: string) {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    // @ts-expect-error injected
    const r = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
    return r.violations.map((v: any) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target }));
  });
  report[`${name}:axe`] = result;
}

async function labels(page: Page, name: string) {
  report[`${name}:labels`] = await page.evaluate(() => (window as any).__dm?.debugLabels());
}

const scenarios: Record<string, () => Promise<void>> = {
  async "home-light"() {
    const p = await open("home-light");
    await p.goto(base);
    await settle(p, 2200);
    await shot(p, "home-light");
    await axe(p, "home-light");
  },
  async "home-dark"() {
    const p = await open("home-dark", { dark: true });
    await p.goto(base);
    await settle(p, 2200);
    await shot(p, "home-dark");
  },
  async "map-light"() {
    const p = await open("map-light");
    await p.goto(`${base}/#/map/rust-ownership`);
    await settle(p);
    await p.getByRole("button", { name: "Legend" }).click();
    await p.waitForTimeout(1500);
    await shot(p, "map-light");
    await labels(p, "map-light");
    await axe(p, "map-light");
  },
  async "map-dark"() {
    const p = await open("map-dark", { dark: true });
    await p.goto(`${base}/#/map/rust-ownership`);
    await settle(p);
    await shot(p, "map-dark");
  },
  async "map-hover"() {
    const p = await open("map-hover");
    await p.goto(`${base}/#/map/rust-ownership`);
    await settle(p);
    const pos = await p.evaluate(() => (window as any).__dm?.screenPosition("refcell"));
    if (pos) await p.mouse.move(pos[0], pos[1]);
    await p.waitForTimeout(500);
    await shot(p, "map-hover");
  },
  async "node-panel"() {
    const p = await open("node-panel");
    await p.goto(`${base}/#/map/rust-ownership/node/refcell`);
    await settle(p);
    await shot(p, "node-panel");
    await axe(p, "node-panel");
  },
  async "conversation"() {
    const p = await open("conversation");
    await p.goto(`${base}/#/map/rust-ownership/node/mutexguard-raii`);
    await settle(p, 1200);
    await p.getByText("Read all 2 conversations in order").click();
    await p.waitForTimeout(1600);
    await shot(p, "conversation");
    await axe(p, "conversation");
  },
  async "conversation-dark"() {
    const p = await open("conversation-dark", { dark: true });
    await p.goto(`${base}/#/map/rust-ownership/node/borrowing`);
    await settle(p, 1200);
    await p.locator(".session").first().click();
    await p.waitForTimeout(1600);
    await shot(p, "conversation-dark");
  },
  async "ideation"() {
    const p = await open("ideation");
    await p.goto(`${base}/#/map/local-first-notes`);
    await settle(p);
    await shot(p, "ideation");
    await labels(p, "ideation");
  },
  async "ideation-panel-dark"() {
    const p = await open("ideation-panel-dark", { dark: true });
    await p.goto(`${base}/#/map/local-first-notes/node/crdt`);
    await settle(p);
    await shot(p, "ideation-panel-dark");
  },
  async "pillars-only"() {
    const p = await open("pillars-only");
    await p.goto(`${base}/#/map/pick-a-framework`);
    await settle(p);
    await shot(p, "pillars-only");
  },
  async "empty"() {
    const p = await open("empty");
    await p.goto(`${base}/#/map/quantum-intro`);
    await settle(p);
    await shot(p, "empty");
  },
  async "large"() {
    const p = await open("large");
    await p.goto(`${base}/#/map/distributed-systems`);
    await settle(p, 2500);
    await shot(p, "large");
    await labels(p, "large");
    const perf = await p.evaluate(async () => {
      const canvas = document.querySelector("canvas.map-canvas")!;
      const dm = (window as any).__dm;
      const frames: number[] = [];
      const draws: number[] = [];
      let last = performance.now();
      const start = last;
      await new Promise<void>((resolve) => {
        const tick = (t: number) => {
          frames.push(t - last);
          last = t;
          draws.push(dm.lastDrawMs);
          canvas.dispatchEvent(new WheelEvent("wheel", { deltaX: 3, deltaY: 1.5, bubbles: true, cancelable: true }));
          if (t - start < 3000) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      frames.shift();
      const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
      const sorted = [...draws].sort((a, b) => a - b);
      return { fps: 1000 / avg, avgDrawMs: draws.reduce((a, b) => a + b, 0) / draws.length, p95DrawMs: sorted[Math.floor(sorted.length * 0.95)] };
    });
    report["large:perf"] = perf;
    await p.locator("canvas.map-canvas").focus();
    await p.keyboard.press("f");
    await p.waitForTimeout(900);
    for (let i = 0; i < 4; i++) await p.keyboard.press("+");
    await p.waitForTimeout(800);
    await shot(p, "large-zoomed");
  },
  async "tablet"() {
    const p = await open("tablet", { width: 1024, height: 768 });
    await p.goto(`${base}/#/map/rust-ownership/node/borrowing`);
    await settle(p);
    await shot(p, "tablet");
  },
  async "mobile"() {
    const p = await open("mobile", { width: 390, height: 844 });
    await p.goto(`${base}/#/map/rust-ownership`);
    await settle(p);
    await shot(p, "mobile");
    await p.goto(`${base}/#/map/rust-ownership/node/lifetimes`);
    await p.waitForTimeout(1400);
    await shot(p, "mobile-panel");
  },
  async "mobile-home"() {
    const p = await open("mobile-home", { width: 390, height: 844 });
    await p.goto(base);
    await settle(p, 2000);
    await shot(p, "mobile-home");
  },
  async "replay"() {
    const p = await open("replay");
    await p.goto(`${base}/#/map/rust-ownership`);
    await settle(p);
    await p.locator(".track").focus();
    await p.keyboard.press("Home");
    for (let i = 0; i < 4; i++) await p.keyboard.press("ArrowRight");
    await p.waitForTimeout(1500);
    await shot(p, "replay");
  },
  async "growth"() {
    const p = await open("growth");
    await p.goto(`${base}/#/map/pick-a-framework`);
    await settle(p);
    const dm = join(dir, "../../scripts/dm.ts");
    const ops = JSON.stringify([
      { op: "add", title: "React 19", kind: "candidate", parent: "团队熟悉度", status: "weighing" },
      { op: "add", title: "Svelte 5", kind: "candidate", parent: "渲染性能" },
      { op: "add", title: "社区插件数量", kind: "evidence", parent: "生态成熟度", status: "clear" },
      { op: "link", from: "react-19", to: "社区插件数量", relation: "supports" },
    ]);
    const proc = spawn(process.execPath, [dm, "apply", "-m", "pick-a-framework", "--agent", "claude-code", "--session", "9a8b7c6d-1e2f-4a3b-8c9d-0e1f2a3b4c5d"], { env, stdio: ["pipe", "ignore", "inherit"] });
    proc.stdin.end(ops);
    await new Promise((r) => proc.on("exit", r));
    for (const ms of [250, 450, 700, 1600]) {
      await p.waitForTimeout(ms === 250 ? 250 : ms - [250, 450, 700, 1600][[250, 450, 700, 1600].indexOf(ms) - 1]!);
      await shot(p, `growth-${ms}`);
    }
  },
  async "reduced-motion"() {
    const p = await open("reduced-motion", { reduced: true });
    await p.goto(`${base}/#/map/local-first-notes/node/three-way`);
    await settle(p, 600);
    await shot(p, "reduced-motion");
  },
  async "language"() {
    const p = await open("language");
    await p.goto(`${base}/#/map/rust-ownership`);
    await settle(p);
    const before = await p.evaluate(() => ({ lang: document.documentElement.lang, back: document.querySelector(".back-link")?.textContent }));
    await p.getByRole("button", { name: "Language" }).click();
    await p.waitForTimeout(300);
    await shot(p, "lang-menu");
    await p.getByRole("menuitemradio", { name: "中文" }).click();
    await p.waitForTimeout(600);
    const after = await p.evaluate(() => ({ lang: document.documentElement.lang, back: document.querySelector(".back-link")?.textContent, stored: localStorage.getItem("dm-lang") }));
    await p.reload();
    await settle(p, 800);
    const reloaded = await p.evaluate(() => document.querySelector(".back-link")?.textContent);
    report["language"] = { before, after, reloaded };
  },
  async "keyboard"() {
    const p = await open("keyboard");
    await p.goto(`${base}/#/map/rust-ownership`);
    await settle(p);
    await p.locator("canvas.map-canvas").focus();
    await p.keyboard.press("ArrowDown");
    await p.keyboard.press("ArrowRight");
    await p.keyboard.press("ArrowDown");
    await p.waitForTimeout(900);
    report["keyboard:hash"] = await p.evaluate(() => location.hash);
    await shot(p, "keyboard");
    await p.keyboard.press("Escape");
    report["keyboard:afterEsc"] = await p.evaluate(() => location.hash);
  },
  // Last: it deletes a fixture map.
  async "delete"() {
    const viewer = await open("delete-viewer");
    await viewer.goto(`${base}/#/map/quantum-intro`);
    await settle(viewer, 800);
    const p = await open("delete");
    await p.goto(base);
    await settle(p, 1500);
    const before = await p.locator("article.map-card").count();
    await p.locator("article.map-card", { hasText: "量子计算入门" }).hover();
    await p.getByRole("button", { name: "Delete “量子计算入门”" }).click();
    await p.waitForTimeout(500);
    await shot(p, "delete-dialog");
    await axe(p, "delete-dialog");
    await p.getByRole("button", { name: "Delete map" }).click();
    await p.waitForTimeout(800);
    const after = await p.locator("article.map-card").count();
    await viewer.waitForTimeout(800);
    report["delete"] = { before, after, viewerSays: await viewer.locator(".loading.gone p").textContent().catch(() => null) };
    await shot(viewer, "delete-viewer");
  },
};

for (const [name, run] of Object.entries(scenarios)) {
  if (only && !only.has(name)) continue;
  try {
    await run();
    console.log(`✓ ${name}`);
  } catch (err) {
    report[`${name}:failed`] = String(err);
    console.log(`✗ ${name}: ${err}`);
  }
}

writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.kill();
process.exit(0);
