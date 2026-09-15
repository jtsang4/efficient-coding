# Connection and first pairing

## Native CLI setup

Paseo Desktop includes a CLI; use the installed `paseo` on `PATH`. A standalone client can be installed as `@getpaseo/cli` through npm. Check the version and help of the executable actually used; installing a client is separate from starting or upgrading a daemon. Do not upgrade or restart the user's daemon to resolve a feature mismatch during observation.

The target must have a running daemon, an enabled Relay connection, and outbound access to its configured relay. The client also needs access to that relay. Provider credentials, repositories, and workspace paths live on the daemon machine. An offer is connection authority; possession is not a grant to perform unrelated mutations.

## Obtain an offer

Choose the path that matches existing access:

1. **User-provided material:** accept a private single-line offer file, a protected `paseo daemon pair --json` result, or a secret-manager-injected `PASEO_HOST`. Do not ask the user to paste an offer into a shared conversation.
2. **Already connected Paseo client:** select the exact host in Settings → that host → Pair a device and copy its existing pairing link to a private file. This reuses the authorized connection. If available in the installed build, `paseo daemon pair --json` against an explicit, already authorized endpoint can obtain the same material. Verify that the build honors the remote target before using its pairing command.
3. **Target-machine access:** its operator can run the following on the target, in a trusted terminal. `PASEO_HOME` identifies the intended daemon instance there, not a remote address.

   ```bash
   # On the target machine; PRIVATE_DIR is an existing private directory outside a repo.
   umask 077
   paseo daemon pair --json > "$PRIVATE_DIR/pairing.json"
   ```

   Only after authorization to enable Relay: `paseo daemon pair --relay --json`. This can change configuration. In tested 0.8.0, plain `pair --json` reports `RELAY_DISABLED` when disabled. Older documentation describes an interactive prompt; inspect the installed command instead of assuming either behavior. An offline-generated offer does not make a stopped daemon reachable.

4. **Authorized exported connection record:** Paseo app source stores host records under `@paseo:daemon-registry`. This is app storage, not a guaranteed CLI config file or a public export command. Storage location/backend varies by platform. Use an explicitly supplied/exported record; do not search arbitrary app databases or assume the CLI automatically imports app hosts.

   A record has `serverId`, `label`, `connections`, and `preferredConnectionId`. Select the exact `serverId`, then a `type: "relay"` connection. Map `relayEndpoint` → `relay.endpoint`, preserve `useTls`, and copy `daemonPublicKeyB64`. Validate a version-2 offer with `ConnectionOfferSchema`. If several Relay connections remain and no preferred/specified connection resolves them, ask which connection to use. The optional reader accepts a single record or registry array and can normalize it to a protected URL file (`offer --out` in [sdk.md](sdk.md)).

Without one of these paths, a label or `serverId` cannot recover the public key or establish a pairing. Obtain the offer from the operator or an existing authorized client; do not invent an SSH hostname.

## Load the connection without echoing it

Use a subshell or a dedicated tool execution environment. `PASEO_OFFER_FILE` below points to a user-owned file with mode `0600`, outside the checkout. Entering its path does not reveal the offer. Keep shell tracing off and do not print the environment.

```bash
(
  set +x
  # Local instance and local agent identity must not leak into a remote operation.
  unset PASEO_HOME PASEO_AGENT_ID PASEO_HOST
  IFS= read -r PASEO_HOST < "$PASEO_OFFER_FILE" || [ -n "$PASEO_HOST" ] || exit 1
  [ -n "$PASEO_HOST" ] || exit 1
  export PASEO_HOST
  paseo project ls --json
  paseo workspace ls --json
  paseo ls --global --all --json
)
```

This example expects a single-line URL. For a `pair --json` file, replace the `read` line with `PASEO_HOST=$(jq -er '.url | select(type == "string" and length > 0)' "$PASEO_OFFER_FILE") || exit 1`. This assigns the value without printing it; do not use `eval`, echo it, or paste it into `--host` arguments. Use an execution timeout around CLI calls (typically 30 seconds for discovery; longer for history). Within that same subshell, run only commands authorized for the verified target.

Direct TCP/SSH connections may require `PASEO_PASSWORD`, injected privately with the same care. The offer-based CLI path performs encrypted Relay authentication; a direct-daemon password is not a substitute for an offer. Do not put passwords in command arguments or commit `.env` files. Prefer process-scoped secrets; environment values can still be visible to sufficiently privileged local processes.

When intentionally creating a child of a **remote** agent, set `PASEO_AGENT_ID` only to an authorized parent ID verified on that remote host. Otherwise leave it unset and provide an explicit workspace/path. Do not alter the parent shell's local context.

## Prove which daemon answered

Use local `paseo daemon status --json` to identify the CLI machine's daemon. For a remote identity, use target-aware status only when its behavior has been verified. A safe diagnostic is to point just `daemon status` at an unreachable loopback port: if it still succeeds with local status, it cannot prove a remote connection. Do not use this probe with mutation commands.

The bundled 0.8.0 tested during development returns local status for both `PASEO_HOST` and global `--host`; a later inspected source checkout has target-aware status. A version string alone cannot distinguish those builds. Use the optional `identity` reader when necessary: it compares the parsed offer's `serverId` to authenticated `server_info`, checks an expected hostname when provided, and closes before returning. A user-facing host label may differ from the advertised OS hostname; resolve that distinction instead of accepting an unexpected identity.

After verification, pin the same offer for all commands and retain host context with every resource ID. A connection failure is not permission to fall back to the local daemon or another host.

## Protocol and implementation evidence

The offer fragment is `#offer=` followed by base64url JSON with:

```text
v: 2
serverId: target daemon identifier
daemonPublicKeyB64: daemon public key
relay: { endpoint, useTls? }
```

Use `parseConnectionOfferFromUrl` from `@getpaseo/protocol/connection-offer`. Use `buildRelayWebSocketUrl` with the offered endpoint, `serverId`, `role: "client"`, and the offered/default TLS policy. Configure `e2ee: { enabled: true, daemonPublicKeyB64 }` on Paseo's client. The encrypted handshake precedes daemon RPC. A raw WebSocket to a relay URL with JSON RPC text is not this connection.

Public sources: [connectivity](https://paseo.sh/docs/connectivity), [security](https://paseo.sh/docs/security), [protocol parser](https://github.com/getpaseo/paseo/blob/main/packages/protocol/src/connection-offer.ts), [CLI connection implementation](https://github.com/getpaseo/paseo/blob/main/packages/cli/src/utils/client.ts), [host record schema](https://github.com/getpaseo/paseo/blob/main/packages/app/src/types/host-connection.ts). Source links track upstream; recheck installed declarations and command behavior before assuming new capabilities.
