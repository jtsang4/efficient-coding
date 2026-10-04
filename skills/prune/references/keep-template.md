# Keep Template

Save as `docs/prune/keep.md`. This is a state document: update entries in place, and delete entries whose code no longer exists. Every entry needs a reason; an entry without one gets re-examined on the next run.

```markdown
# Prune Keep List

Code that prune passes must not delete or refactor. Maintained by the prune skill; edit freely.

## Inventory Assets

Do not delete unused members or refactor internals.

| Path | What it is | How it is updated | Confirmed |
| --- | --- | --- | --- |
| e.g. `src/components/ui/` | shadcn/ui components | `shadcn add` / upstream copy | YYYY-MM-DD by user |
| e.g. `gen/api/` | OpenAPI client | regenerate from `openapi.yaml` | YYYY-MM-DD by user |

## External Contracts

Consumers live outside this repository.

| Path or symbol | Consumer | Confirmed |
| --- | --- | --- |

## Intentional Complexity

Looks prunable but is deliberate.

| Path or symbol | Why it stays | Confirmed |
| --- | --- | --- |
| e.g. `retry()` in `src/net/client.ts` | upstream API drops ~1% of requests | YYYY-MM-DD by user |
```
