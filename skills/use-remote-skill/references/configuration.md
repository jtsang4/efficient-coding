# Remote skill catalog

## Locations and schema

Global defaults live at `~/.config/use-remote-skill/config.yaml`. Project declarations live at `<project-root>/.agents/remote-skills.yaml`. A missing file is an empty catalog; reading it should not create it. These files are interpreted by the agent using this skill, not automatically by the `skills` CLI.

Use YAML with the following structure. This example is illustrative, not a built-in source to load or add automatically:

```yaml
version: 1
skills:
  design-review:
    description: 检查网页设计、可访问性和交互一致性
    when:
      - 用户要求审查网页 UI
      - 用户要求检查可访问性
    source: vercel-labs/agent-skills
    skill: web-design-guidelines
    full_depth: false
    enabled: true
```

| Field | Rule |
| --- | --- |
| `version` | Required integer `1`. Report unsupported versions. |
| `skills` | Required mapping of unique aliases to declarations; `{}` is valid. |
| Alias | Lowercase letters, digits, and hyphens; start with a letter or digit. Aliases are case-sensitive. |
| `source` | Required nonempty string for a complete declaration. A user-supplied repository shorthand, Git URL, or supported download URL; preserve refs and subpaths. Store an unambiguous skill selector separately. |
| `skill` | Optional nonempty string. Omit if the source uniquely identifies one skill. Explicit YAML `null` clears an inherited selector. |
| `description` | Optional nonempty string describing its purpose. |
| `when` | Optional list of nonempty natural-language conditions, interpreted as alternatives. Missing or `[]` means alias/direct use only; no automatic task matching. Use `description` to clarify these conditions. |
| `full_depth` | Optional boolean, default `false`; maps to `--full-depth` when true. |
| `enabled` | Optional boolean, default `true`. False excludes the alias from both matching and alias-based loading. |

At least one meaningful `when` condition should accompany a new declaration intended for task matching. Derive it from the user's stated purpose; do not invent broad triggers for an unfamiliar source. No `runner`, arbitrary shell command, or free-form `options` field: executable choice is automatic, and configuration uses typed fields. Keep `--agent` an explicit invocation-only choice.

Validate YAML using an available safe parser where possible, reject duplicate keys, and check field types (in particular, quoted `"false"` is not a boolean). Unknown fields should be reported, not silently ignored or discarded. An invalid catalog blocks catalog-based resolution until corrected, but does not block a completely independent direct-source invocation. Do not install a parser just to read or edit a small catalog without need.

## Resolution and overrides

1. Read global entries.
2. Overlay project entries with the same alias **field by field**. Omitted fields inherit; lists replace rather than append. A project-only entry must be complete. Apply defaults after merging.
3. Apply explicit invocation fields to the selected entry without writing them back. When an override changes `source`, clear the inherited `skill` unless the overriding layer also supplies a selector. This prevents sending an old repository's skill name to a new source.

Project entries may contain only an override, such as:

```yaml
version: 1
skills:
  design-review:
    enabled: false
```

This disables a global alias in this project. Accept a disabled placeholder without `source` even if the global declaration is currently absent. A disabled alias should not load until the user explicitly asks to re-enable it, including for this invocation only. An explicit direct source independent of the alias is still allowed.

To retain a source but remove its inherited selector:

```yaml
version: 1
skills:
  design-review:
    skill: null
```

The merged declaration must still satisfy the schema. Do not infer a selector when the source exposes several skills and the user's intent is ambiguous.

When showing configuration, identify each entry's origin and overrides, disabled status, effective source/selector, and matching conditions. Never describe a successful global edit as effective for this project if a project override still masks it.

## Editing operations

- **Create/add:** write only the requested scope, creating the parent directory as needed. New files contain `version: 1` and a `skills` mapping. Do not populate unrelated sample entries.
- **Update:** change only requested fields. If changing source, handle selector reset according to the merge rules. To clear a project override's selector persistently, write `skill: null`.
- **Disable globally:** set `enabled: false` in the global entry. Existing project overrides can still enable it; report this if relevant.
- **Disable for this project:** write a project `enabled: false` override; leave the global declaration intact.
- **Remove:** delete the alias from the requested file. Removing a project override can expose the global entry again; tell the user. If the intent is “do not use here,” use a disabled project override instead.
- **Restore inheritance:** remove the requested project field or entry, then report the resulting global value.

Read and validate before writing; preserve unrelated settings. After writing, parse again and validate both the changed document and the effective merged entries. Re-check for intervening changes before replacing a whole file. If an existing file is malformed, explain the exact issue; make an unambiguous requested repair or ask when intent is unclear.

## Optional automatic task matching

Merely adding `when` conditions does not cause the host agent to discover them. When the user requests automatic matching, add a short rule to the relevant project or agent-specific global `AGENTS.md`, preserving existing instructions:

> Before starting a task, use `use-remote-skill` to check the declared global and project remote-skill catalogs. Load a clearly matching enabled skill for the task; when none matches, continue normally. Use only declared or explicitly supplied sources, without searching skill marketplaces.

Use the host's actual instruction-file location for global integration rather than inventing a universal global `AGENTS.md` path. This integration requires `use-remote-skill` itself to be available to that agent. It delegates matching to the entrypoint; it does not install each catalog entry or guarantee automatic invocation on every host.
