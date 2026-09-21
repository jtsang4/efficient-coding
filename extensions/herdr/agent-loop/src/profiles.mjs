import { readFile } from "node:fs/promises";
import path from "node:path";

const ROLES = new Set(["orchestrator", "implementer", "verifier"]);

export function emptyProfileConfig() {
  return { defaults: {}, profiles: {} };
}

export async function loadProfileConfig(configDir = process.env.HERDR_PLUGIN_CONFIG_DIR) {
  if (!configDir) return emptyProfileConfig();
  const filename = path.join(configDir, "profiles.json");
  let content;
  try {
    content = await readFile(filename, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return emptyProfileConfig();
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filename}: ${error.message}`);
  }
  return validateProfileConfig(parsed, filename);
}

export function validateProfileConfig(value, source = "profiles.json") {
  if (!isRecord(value)) throw new Error(`${source} must contain a JSON object`);
  const profiles = value.profiles ?? {};
  const defaults = value.defaults ?? {};
  if (!isRecord(profiles)) throw new Error(`${source}: profiles must be an object`);
  if (!isRecord(defaults)) throw new Error(`${source}: defaults must be an object`);

  const normalized = emptyProfileConfig();
  for (const [name, profile] of Object.entries(profiles)) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name)) {
      throw new Error(`${source}: invalid profile name ${JSON.stringify(name)}`);
    }
    if (!isRecord(profile)) throw new Error(`${source}: profile ${name} must be an object`);
    if (typeof profile.kind !== "string" || !profile.kind.trim()) {
      throw new Error(`${source}: profile ${name} requires a non-empty kind`);
    }
    normalized.profiles[name] = {
      kind: profile.kind.trim(),
      args: validateArgv(profile.args ?? [], `${source}: profile ${name} args`),
    };
  }

  for (const [role, profileName] of Object.entries(defaults)) {
    if (!ROLES.has(role)) throw new Error(`${source}: unknown default role ${role}`);
    if (typeof profileName !== "string" || !normalized.profiles[profileName]) {
      throw new Error(`${source}: default ${role} references unknown profile ${JSON.stringify(profileName)}`);
    }
    if (hasDangerousPermissionBypass(normalized.profiles[profileName].args)) {
      throw new Error(`${source}: dangerous permission bypass args require explicit profile selection and cannot be a default`);
    }
    normalized.defaults[role] = profileName;
  }
  return normalized;
}

export function resolveLaunch({
  role,
  profileName,
  kind,
  args,
  profileConfig = emptyProfileConfig(),
  fallbackKind = "codex",
} = {}) {
  if (!ROLES.has(role)) throw new Error(`Unknown Agent role: ${role}`);
  const explicitKind = typeof kind === "string" && kind.trim() ? kind.trim() : null;
  const requestedProfile = typeof profileName === "string" && profileName.trim()
    ? profileName.trim()
    : null;
  // An explicit kind intentionally opts out of the role's default profile so
  // arguments for one executable are never accidentally sent to another.
  const selectedProfile = requestedProfile || (!explicitKind ? profileConfig.defaults?.[role] : null);
  const profile = selectedProfile ? profileConfig.profiles?.[selectedProfile] : null;
  if (selectedProfile && !profile) throw new Error(`Unknown Agent profile: ${selectedProfile}`);
  if (requestedProfile && explicitKind) {
    throw new Error("Use either an Agent profile or an explicit kind, not both");
  }
  const hasExplicitArgs = args !== undefined;
  const explicitArgs = validateArgv(args ?? [], `${role} launch args`);
  return {
    profile: selectedProfile || null,
    kind: explicitKind || profile?.kind || fallbackKind,
    args: hasExplicitArgs ? explicitArgs : [...(profile?.args || [])],
  };
}

export function parseArgvJson(value, label = "launch args") {
  if (value === undefined || value === null || value === "") return [];
  let parsed;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch (error) {
    throw new Error(`${label} must be a JSON array of strings: ${error.message}`);
  }
  return validateArgv(parsed, label);
}

export function summarizeProfileConfig(config) {
  return {
    defaults: { ...(config.defaults || {}) },
    profiles: Object.fromEntries(Object.entries(config.profiles || {}).map(([name, profile]) => [name, {
      kind: profile.kind,
      arg_count: profile.args?.length || 0,
    }])),
  };
}

export function validateArgv(value, label = "launch args") {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.includes("\0"))) {
    throw new Error(`${label} must be an array of strings without NUL bytes`);
  }
  return [...value];
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasDangerousPermissionBypass(args) {
  return args.some((value, index) => (
    value === "--dangerously-skip-permissions"
    || value === "--dangerously-bypass-approvals-and-sandbox"
    || value === "--permission-mode=bypassPermissions"
    || (value === "--permission-mode" && args[index + 1] === "bypassPermissions")
  ));
}
