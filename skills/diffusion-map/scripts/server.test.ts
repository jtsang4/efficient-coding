import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Lens } from "./lib/model";

const lens: Lens = {
  pillar: "core",
  kinds: [{ id: "concept", label: "概念" }],
  statuses: [
    { id: "open", label: "待展开", tone: "open" },
    { id: "done", label: "已掌握", tone: "settled" },
  ],
  relations: [{ id: "rel", label: "关联" }],
};

let home: string;
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "dm-srv-"));
});
afterAll(() => rmSync(home, { recursive: true, force: true }));

const dm = (args: string[], stdin?: string) =>
  Bun.spawnSync([process.execPath, join(import.meta.dir, "dm.ts"), ...args], {
    env: { ...process.env, DIFFUSION_HOME: home, CLAUDE_CODE_SESSION_ID: "", CODEX_THREAD_ID: "" },
    stdin: stdin ? Buffer.from(stdin) : undefined,
  });

describe("runtime has no third-party dependencies", () => {
  test("scripts import only node:/bun builtins and relative files", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) files.push(p);
      }
    };
    walk(import.meta.dir);
    for (const file of files) {
      const specs = [...readFileSync(file, "utf8").matchAll(/^import[^"']*["']([^"']+)["']/gm)].map((m) => m[1]!);
      for (const spec of specs) expect(spec.startsWith("node:") || spec.startsWith(".") || spec === "bun:test", `${file}: ${spec}`).toBe(true);
    }
  });
});

describe("cli + viewer end to end", () => {
  test("new, apply, show, undo, export", () => {
    expect(dm(["new", "测试", "--slug", "t", "--lens", JSON.stringify(lens)]).stdout.toString()).toContain("created map: t");
    const ops = JSON.stringify([{ op: "add", id: "a", title: "甲", kind: "concept" }, { op: "add", title: "乙", kind: "concept", parent: "a", status: "done" }]);
    const applied = dm(["apply", "-m", "t"], ops);
    expect(applied.exitCode).toBe(0);
    expect(applied.stdout.toString()).toContain("no agent session detected");
    expect(dm(["show", "-m", "t"]).stdout.toString()).toContain("- 乙 [n2] concept · done");
    const bad = dm(["update", "-m", "t", "nope", "--status", "done"]);
    expect(bad.exitCode).toBe(1);
    expect(bad.stderr.toString()).toContain("unknown node: nope");
    dm(["add", "-m", "t", "丙", "--kind", "concept"]);
    expect(dm(["undo", "-m", "t"]).stdout.toString()).toContain("reverted");
    expect(dm(["export", "-m", "t"]).stdout.toString()).toContain("## 甲");
  });

  test("delete previews, then removes the whole map", () => {
    dm(["new", "临时", "--slug", "tmp", "--lens", JSON.stringify(lens)]);
    expect(dm(["maps"]).stdout.toString()).toMatch(/tmp\t临时\t0 nodes\t\d+(\.\d)? (B|KB)/);
    expect(dm(["delete", "-m", "tmp"]).stdout.toString()).toContain("would delete 临时 (tmp)");
    expect(existsSync(join(home, "maps", "tmp"))).toBe(true);
    expect(dm(["delete", "-m", "tmp", "--yes"]).stdout.toString()).toContain("deleted 临时 (tmp)");
    expect(existsSync(join(home, "maps", "tmp"))).toBe(false);
    expect(dm(["delete", "-m", "tmp", "--yes"]).exitCode).toBe(1);
  });

  test("serve answers the api and static files, then exits when idle", async () => {
    const out = dm(["serve", "--port", "4870", "--idle", "2s"]).stdout.toString();
    const url = out.match(/http:\/\/127\.0\.0\.1:(\d+)/)!;
    const base = url[0];
    expect((await fetch(`${base}/`)).headers.get("content-type")).toContain("text/html");
    expect((await fetch(`${base}/js/main.js`)).headers.get("content-type")).toContain("javascript");
    expect((await fetch(`${base}/../package.json`)).status).toBe(404);
    const map = await (await fetch(`${base}/api/maps/t`)).json();
    expect(map.nodes.map((n: { title: string }) => n.title).sort()).toEqual(["乙", "甲"]);
    expect(map.batches.length).toBeGreaterThan(0);
    expect(dm(["serve"]).stdout.toString()).toContain("viewer running");

    // Deleting a map from the viewer: only requests carrying the app's own header are accepted.
    dm(["new", "待删", "--slug", "gone", "--lens", JSON.stringify(lens)]);
    const del = (headers: Record<string, string>) => fetch(`${base}/api/maps/gone`, { method: "DELETE", headers });
    expect((await del({})).status).toBe(403);
    expect((await del({ "x-diffusion-map": "yes" })).status).toBe(403);
    const ok = await del({ "x-diffusion-map": "delete" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).deleted).toMatchObject({ slug: "gone", title: "待删", nodes: 0 });
    expect((await fetch(`${base}/api/maps/gone`)).status).toBe(404);
    expect((await fetch(`${base}/api/maps/t`, { method: "POST" })).status).toBe(405);
    const info = join(home, "server.json");
    expect(existsSync(info)).toBe(true);
    await Bun.sleep(3500);
    expect(existsSync(info)).toBe(false);
    expect(await fetch(`${base}/api/health`).then(() => "up", () => "down")).toBe("down");
  }, 15_000);
});
