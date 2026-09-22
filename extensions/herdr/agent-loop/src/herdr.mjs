import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class HerdrError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "HerdrError";
    this.details = details;
  }
}

export class HerdrClient {
  constructor({ binary = process.env.HERDR_BIN_PATH || "herdr", env = process.env } = {}) {
    this.binary = binary;
    this.env = env;
  }

  async run(args, { timeout = 30_000, displayCommand, errorDetail = "message" } = {}) {
    try {
      const { stdout, stderr } = await execFileAsync(this.binary, args, {
        encoding: "utf8",
        env: this.env,
        maxBuffer: 10 * 1024 * 1024,
        timeout,
      });
      return { stdout, stderr };
    } catch (error) {
      const summary = herdrFailureSummary(error.stdout, {
        includeMessage: errorDetail === "message",
      });
      throw new HerdrError(`herdr ${displayCommand || args.join(" ")} failed${summary ? `: ${summary}` : ""}`, {
        code: error.code,
        signal: error.signal,
        stdout: error.stdout,
        stderr: error.stderr,
      });
    }
  }

  async json(args, options = {}) {
    const { stdout } = await this.run(args, options);
    try {
      return JSON.parse(stdout);
    } catch (error) {
      throw new HerdrError(`herdr ${options.displayCommand || args.join(" ")} returned invalid JSON`, {
        stdout,
        cause: error.message,
      });
    }
  }

  async openPluginPane(entrypoint, { placement, focus = true, env = {} } = {}) {
    const args = pluginPaneOpenArgs(entrypoint, {
      placement,
      focus,
      env,
      pluginId: process.env.HERDR_PLUGIN_ID || "efficient-coding.agent-loop",
    });
    return this.json(args);
  }

  async workspace(workspaceId) {
    return unwrap(await this.json(["workspace", "get", workspaceId]), "workspace");
  }

  async pane(paneId) {
    return unwrap(await this.json(["pane", "get", paneId]), "pane");
  }

  async createTab({ workspaceId, cwd, label, env = {} }) {
    const args = ["tab", "create", "--workspace", workspaceId, "--label", label, "--no-focus"];
    if (cwd) args.push("--cwd", cwd);
    for (const [key, value] of Object.entries(env)) {
      args.push("--env", `${key}=${value}`);
    }
    const response = await this.json(args);
    return {
      tab: response?.result?.tab ?? response?.tab,
      rootPane: response?.result?.root_pane ?? response?.root_pane,
      response,
    };
  }

  async startAgent({ name, kind, paneId, args = [] }) {
    const command = ["agent", "start", name, "--kind", kind, "--pane", paneId];
    if (args.length) command.push("--", ...args);
    const suffix = args.length ? ` -- <${args.length} redacted agent args>` : "";
    return unwrap(await this.json(command, {
      timeout: 300_000,
      displayCommand: `agent start ${name} --kind ${kind} --pane ${paneId}${suffix}`,
      errorDetail: "code",
    }), "agent");
  }

  async promptAgent(name, prompt) {
    return unwrap(await this.json(["agent", "prompt", name, prompt], {
      timeout: 30_000,
      displayCommand: `agent prompt ${name} <redacted prompt>`,
      errorDetail: "code",
    }), "agent");
  }

  async getAgent(name) {
    return unwrap(await this.json(["agent", "get", name]), "agent");
  }

  async readAgent(name, { lines = 120 } = {}) {
    const { stdout } = await this.run([
      "agent",
      "read",
      name,
      "--source",
      "recent-unwrapped",
      "--lines",
      String(lines),
    ]);
    return stdout;
  }

  async focusAgent(name) {
    return this.json(["agent", "focus", name]);
  }
}

export function unwrap(response, key) {
  if (response?.result?.[key] !== undefined) return response.result[key];
  if (response?.result !== undefined) return response.result;
  if (response?.[key] !== undefined) return response[key];
  return response;
}

export function pluginPaneOpenArgs(entrypoint, {
  placement,
  focus = true,
  env = {},
  pluginId = "efficient-coding.agent-loop",
} = {}) {
  const args = ["plugin", "pane", "open", "--plugin", pluginId, "--entrypoint", entrypoint];
  if (placement) args.push("--placement", placement);
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value !== null && value !== "") args.push("--env", `${key}=${value}`);
  }
  args.push(focus ? "--focus" : "--no-focus");
  return args;
}

export function herdrFailureSummary(stdout, { includeMessage = true } = {}) {
  if (typeof stdout !== "string" || !stdout.trim()) return "";
  try {
    const response = JSON.parse(stdout);
    const code = typeof response?.error?.code === "string" ? response.error.code.trim() : "";
    const message = typeof response?.error?.message === "string" ? response.error.message.trim() : "";
    if (!includeMessage) return code;
    if (code && message) return `${code}: ${message}`;
    return code || message;
  } catch {
    return "";
  }
}
