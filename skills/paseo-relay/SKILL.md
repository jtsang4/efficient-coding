---
name: paseo-relay
description: Connect to other Paseo hosts through Relay using authorized pairing information; discover projects, workspaces and agents, inspect sessions and timelines, and perform explicitly requested remote operations. Use for cross-host Paseo access, including requests that call Relay “replay”.
---

# Paseo Relay

Use the local `paseo` CLI to operate the daemon on the selected host. Relay is the network connection. Start with observation; inspecting a session does not authorize sending it a prompt, resuming, stopping, reloading, restarting, archiving, or detaching it.

## 1. Establish the host and connection

Record the local host, the intended remote host, and the authorized operation. Discover the installed CLI with `command -v paseo`, `paseo --version`, and command-specific `--help`. A host's display label is neither its SSH address nor sufficient connection information.

Read [connection.md](references/connection.md) to obtain or reuse a pairing offer. The workable starting points are:

- An offer URL supplied privately by the user or stored in their explicitly authorized connection file.
- An already authorized connection to that daemon, through which Paseo can return its offer.
- Access to the target machine or its operator for first pairing. Relay must already be enabled, or enabling it must be authorized.

An offer contains the target `serverId`, Relay endpoint/TLS setting, and daemon public key. Use Paseo's parser and encrypted Relay transport. Keep connection materials outside the repository and out of command arguments, transcripts, and shared logs.

CLI 0.8.0 accepts an offer URL through `PASEO_HOST` or `--host`, although its help lists tcp/ssh. Prefer `PASEO_HOST` loaded from a private file. Verify the selected daemon's `serverId` and advertised hostname before choosing its resources. **Some bundled 0.8.0 builds ignore the remote target for `daemon status` and return local status.** If that command cannot prove the remote identity, use the small SDK identity check in [sdk.md](references/sdk.md). Do not substitute local status for a remote handshake.

Keep subsequent commands in that same target environment. Treat `(serverId, workspaceId)` and `(serverId, agentId)` as the identifiers. Use full IDs obtained from this host; CLI prefix/title matching can select an unintended session.

## 2. Discover and read with the CLI

After loading and verifying the target connection:

```bash
paseo project ls --json
paseo workspace ls --json
paseo ls --global --all --json
paseo inspect "$TARGET_AGENT_ID" --json
paseo logs "$TARGET_AGENT_ID" --tail 30
```

`--global` searches all directories on the **selected daemon**, not all hosts. `--all` includes archived agents. Match the project/workspace and the agent's `WorkspaceId`/`Cwd` before proceeding. All `--cwd`, workspace `--path`, worktree paths, and provider installations refer to the target machine; do not pass your local checkout path by habit.

Use `inspect` for status, configuration and parentage, and `logs` for a readable overview. In the verified 0.8.0 build, `logs --json` still emits formatted text; `--tail` bounds displayed output but can fetch more history internally. Neither is proof of a complete raw timeline.

For exact tool inputs/results, lifecycle counts, or complete history, read [sdk.md](references/sdk.md). Its optional reader saves raw canonical/projected pages, checks pagination and completeness, and prints only a small verification summary. Ordinary CLI operations do not require installing or running that reader.

## 3. Perform the authorized operation

Use [operations.md](references/operations.md) for native CLI workspace creation, agent launch, sending tasks, waiting, subscriptions and configuration. Resolve the target host's named profile before launch and copy its actual provider/model/mode/thinking/features. The CLI has no verified named-profile flag in 0.8.0; use profile data supplied by the user or the SDK profile read, then materialize it accurately.

Creation, prompts, workspace scripts, terminal input, configuration, and lifecycle changes are mutations. Perform only those covered by the user's request. A diagnostic request alone does not authorize a “test prompt.” Test reads against existing sessions; test mutation logic with local fixtures unless a disposable target was explicitly authorized.

Background execution and Detach are different operations. `run --background` and `send --no-wait` change waiting behavior. `agent detach` changes parentage. Check `labels["paseo.parent-agent-id"]` in an SDK snapshot or `ParentAgentId` in CLI inspect; the snapshot has no top-level `parentAgentId`.

## 4. Report evidence and limitations

Report the verified host identity, relevant workspace/agent IDs, operation and result, and client/daemon versions. For a history claim, include projection, page/entry counts, boundary and completeness flags. Label incomplete reads and separate a historical snapshot from live updates.

Missing pairing materials block that connection only. Finish local inspection and preparation, then state exactly which offer or authorized access is missing. Distinguish source inspection, fixture tests, same-host Relay tests, and actual cross-host execution. Prior successful sessions do not prove a new helper works remotely.

## References

- [Connection and first pairing](references/connection.md): private offer handling, saved host records, identity and protocol.
- [CLI operations and profiles](references/operations.md): actual commands, SDK mappings, ownership and waiting.
- [Optional SDK reads](references/sdk.md): installable dependencies, public API/internal bridge, raw timelines and verification.
- [Paseo documentation index](https://paseo.sh/llms.txt), [CLI reference](https://paseo.sh/docs/cli), [SDK](https://paseo.sh/docs/sdk).
