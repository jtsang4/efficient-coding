# CLI operations and profiles

All commands below run in the verified target's `PASEO_HOST` environment. Discover IDs there and pass full IDs. Arguments are values obtained from that host or the user's task; placeholders are not suggested model IDs or paths.

## Observe

```bash
paseo project ls --json
paseo workspace ls --json
paseo ls --global --all --json
paseo inspect "$TARGET_AGENT_ID" --json
paseo logs "$TARGET_AGENT_ID" --tail 30
paseo provider ls --json
paseo provider models "$TARGET_PROVIDER" --json
```

Use provider diagnostics only for the requested problem: diagnostics can include internal environment paths. Inspect returns the overview; a small log tail is a readable sample, not complete evidence. For raw history, use [sdk.md](sdk.md).

## Create a project/workspace or agent when requested

```bash
paseo project create "$TARGET_PROJECT_PATH" --json
paseo workspace create --isolation local --path "$TARGET_PROJECT_PATH" --json
paseo workspace create --isolation worktree --project "$TARGET_PROJECT_ID" \
  --mode branch-off --new-branch "$NEW_BRANCH" --base "$BASE_REF" --json
paseo run --workspace "$TARGET_WORKSPACE_ID" \
  --provider "$TARGET_PROVIDER_MODEL" --mode "$TARGET_MODE_ID" \
  --thinking "$TARGET_THINKING_ID" --title "$TASK_TITLE" --background "$TASK_PROMPT"
```

Create only the resources needed; these are independent examples. A worktree can run configured setup hooks and create files. Use explicit target paths for `--path`/`--cwd`; remote commands must not inherit the CLI machine's working directory. `--workspace` reuses the selected existing workspace. Omit optional settings absent from the profile rather than passing empty strings. Use SDK creation for private long prompts or feature settings the CLI cannot express; `run --prompt-file` is not present in the tested CLI.

Do not inherit the local `PASEO_AGENT_ID` into remote creation. With a verified target parent ID it creates a child; workspace placement does not detach that child. Check actual parentage after creation.

## Materialize a profile from the target host

Read all applicable profile notes. Select the exact profile requested by the user; do not select a same-named profile from your own host. The verified 0.8.0 CLI has provider discovery but no profile-list/profile-launch flag. If full profile data is not already available, `node scripts/read.mjs profiles` retrieves only `config.agentProfiles` for output via the public `api.config.get()` API. The RPC returns config in memory; never dump that full object.

| Profile field | CLI | Public SDK `config` | Paseo agent-scoped MCP |
| --- | --- | --- | --- |
| `provider` + `model` | `--provider provider/model` | `provider: "provider/model"` | `provider: "provider/model"` |
| `modeId` | `--mode` on run; `agent mode` on existing agent | `modeId` | `settings.modeId` |
| `thinkingOptionId` | `--thinking` | `thinkingOptionId` | `settings.thinkingOptionId` |
| `featureValues` | No verified general feature flag | `featureValues` | `settings.features` |

The SDK does **not** use the MCP `settings` wrapper. If the profile lacks a model, discover supported models on the target before composing the public SDK's `provider/model` value. If profiles are absent or no profile fits, report that and use target provider/model/mode/feature discovery. Do not silently drop profile features just to keep a CLI-only launch. The helper's `profileConfig(profile)` preserves present fields and requires an explicit model.

## Send, wait and observe live updates

```bash
# Sending is a mutation. The UTF-8 prompt file is on the CLI machine.
paseo send "$TARGET_AGENT_ID" --prompt-file "$LOCAL_PROMPT_FILE" --no-wait

# Waiting and log following observe; a timeout is not a request to stop the agent.
paseo wait "$TARGET_AGENT_ID" --timeout 60 --json
paseo logs "$TARGET_AGENT_ID" --follow
```

Bound `--follow` with the tool runner's timeout and terminate only the local reader when done. `wait --timeout` uses seconds. SDK `agent.waitForFinish(ms)` uses milliseconds and can return `idle`, `permission`, `error`, or `timeout`; examine the status instead of treating every return as success. For long tasks use a subscription with a bounded observation period instead of repeatedly listing agents. Closing the client leaves the agent running.

## Change configuration or ownership when requested

```bash
paseo agent mode "$TARGET_AGENT_ID" "$TARGET_MODE_ID"
paseo agent update "$TARGET_AGENT_ID" --thinking "$TARGET_THINKING_ID"
paseo agent update "$TARGET_AGENT_ID" --name "$NEW_NAME"
paseo workspace rename "$TARGET_WORKSPACE_ID" "$NEW_NAME"
paseo agent detach "$TARGET_AGENT_ID"
paseo inspect "$TARGET_AGENT_ID" --json
```

`agent update --model` and arbitrary feature flags are not supported in the verified CLI. See the SDK mappings below when those settings are authorized. Do not treat `reload` as a read: it restarts the provider process. Stop/reload/restart/archive/delete/config patches all require authorization for their actual effects.

`--background` changes whether `run` waits. Historical `--detach` aliases for background execution do not change ownership. `agent detach` or SDK `agent.detach()` explicitly removes parentage without moving the workspace. Verify that SDK `snapshot.labels["paseo.parent-agent-id"]` is absent, or CLI `ParentAgentId` is null. Do not use the nonexistent top-level snapshot `parentAgentId` as evidence.

## SDK mappings for operations the CLI cannot express

Use the installed `@getpaseo/client` declarations as the source of signatures. The public API supports `projects.list()`, `workspaces.list()/ref()/create()`, `agents.list()/ref()/create()`, `agent.refresh()/send()/waitForFinish()/detach()`, `agent.timeline.refetch()/subscribe()`, provider discovery, and `config.get()/patch()`.

Within the verified `withRelay` callback from [sdk.md](sdk.md), an **authorized** launch in an existing target workspace is:

```js
const { config } = await api.config.get();
const matches = (config.agentProfiles ?? []).filter(p => p.name === requestedProfile);
if (matches.length !== 1) throw new Error('Profile must resolve uniquely');
const launchConfig = profileConfig(matches[0]);
const workspace = api.workspaces.ref(targetWorkspaceId);
if (!(await workspace.refresh())) throw new Error('Workspace not found');
const agent = await workspace.agents.create({
  config: launchConfig,
  title: taskTitle,
  prompt: taskPrompt,
  // Add parent: targetParentId only for explicitly requested remote parentage.
});
// Save { host: host.serverId, workspaceId: workspace.id, agentId: agent.id }.
// Creation resolves before the task finishes. Wait only as requested:
const result = await agent.waitForFinish(60000);
```

Omit caller-selected `agentId` and `idempotencyKey` unless the daemon advertises and supports that capability. A newer checkout using those options against a running 0.8.0 daemon can be rejected with “Update the host to use caller-selected creation IDs.” Let the daemon assign the ID. A timed-out creation/send has an uncertain outcome: inspect/list the target to reconcile it before retrying, since a retry can duplicate work. Do not upgrade/restart the daemon as an automatic workaround.

For existing-agent settings, the published internal driver exposes `setAgentMode(id, modeId)`, `setAgentModel(id, modelId)`, `setAgentThinkingOption(id, thinkingId)`, and `setAgentFeature(id, featureId, value)`. These are **internal, version-bound** APIs, not methods on the public handle. Discover supported values on the target first. `applyAgentConfig` additionally requires the advertised `agentConfigApply` feature; do not assume it from a version string. Low-level `updateAgent(id, { name, labels })` does not accept the MCP settings wrapper. Daemon-wide `api.config.patch()` is a separate configuration mutation, not a way to configure an individual session.

Always use a bounded `try/finally` connection lifecycle, release subscriptions, and report mutation outcomes without repeating private prompts. Read-only examples and fixture tests are the default validation path.
