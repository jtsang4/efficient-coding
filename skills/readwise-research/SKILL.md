---
name: readwise-research
description: Build a topic-centered research memo from the user's Readwise Reader documents and Readwise highlights. Use this whenever the user asks what they have already read, saved, highlighted, or been reading about a topic, wants a reading brief or research memo from their own library, wants evidence and tensions synthesized across Reader and Readwise, or wants topic-based shortlist/later/archive or tag suggestions. Use it even when the user does not say "Readwise" explicitly and instead says things like "I've been reading a lot about X" or "help me organize what I've read on Y." Prefer this skill over inbox-style triage when the task is organized around a theme, argument, project, or decision rather than chronology. Default to analysis first and only modify Reader after explicit user confirmation.
compatibility: Requires the local `readwise` CLI.
---

# readwise-research

Turn the user's Readwise library into a research desk. Find the most relevant documents and highlights for a topic, synthesize them into a structured memo, and only then propose any cleanup or organization actions.

## Preflight

1. Use the local `readwise` CLI for all retrieval and write operations in this skill.
2. Use `--json` for any command whose output you will inspect programmatically.
3. If the CLI is missing, install it with `npm install -g @readwise/cli`.
4. If the CLI is present but unauthenticated, ask the user for a Readwise access token from `https://readwise.io/access_token`, then run `readwise login-with-token <token>`.

## Core Defaults

- Treat this as a research task first and an organizing task second.
- Default to read-only analysis. Never mutate Reader unless the user explicitly confirms the proposed actions.
- If the user is asking about what they have read, saved, highlighted, or been reading lately, assume the source of truth is their Readwise library and start there.
- Do not start with web search or generic outside knowledge when the task is about the user's own reading history.
- Use documents as the primary units of analysis and highlights as evidence.
- If the user gives a theme but not a precise question, turn it into a working research question and say that you did so.
- If the request is too broad, narrow the scope and explain how you narrowed it.
- If the user does not specify locations, search across `new`, `later`, `shortlist`, and `archive`. Include `feed` only if they explicitly ask for it.
- Prefer 3-6 deeply inspected documents over a long dump of shallow hits.

## Interpret the Request

Before searching, extract or infer:

- `topic`: the central theme, question, or project
- `scope`: what angle matters most, such as arguments, tactics, disagreements, definitions, or examples
- `locations`: optional Reader locations to include
- `time_window`: optional recency constraint
- `tags`: optional tag filter
- `action_mode`: whether the user wants analysis only, suggestions, or confirmed mutations

When the user asks vaguely, rewrite the request into a concrete working question such as:

- "What have you already read about AI agent evaluation, and what are the main recurring ideas and disagreements?"
- "What does your reading library suggest about startup pricing, and which pieces deserve to be shortlisted for later reuse?"
- "You've been reading a lot about evergreen notes. What themes, disagreements, and tag ideas show up in your own library?"

## Source-of-Truth Rule

For this skill, the user's Readwise/Reader library is the primary evidence base.

- If the request is about the user's own reading, highlights, saved articles, or recent reading, begin with Readwise retrieval.
- Do not replace missing library evidence with web search by default.
- Only use external sources when Readwise results are clearly weak or empty, and label that material as an optional supplement rather than part of the library-backed memo.
- If you do need outside context, first say that the library evidence was thin and explain why you are expanding beyond Readwise.

## Retrieval Decision Rules

- If the prompt sounds like "I've been reading a lot about X", interpret it as a request about the user's library even if Readwise is not named.
- If the prompt asks for tensions, disagreements, tradeoffs, or competing schools of thought, prioritize documents with highlights, notes, or multiple matching evidence points over isolated snippets.
- If the results are mostly tweets or small fragments, say that the evidence is fragmentary and point the user to the best full documents to read next.
- If the topic is broad, narrow by the user's real angle first, not by random keyword specificity.

## Retrieval Workflow

### 1. Search documents first

Start with `reader-search-documents` because it gives the best candidate document set.

CLI examples:

```bash
readwise reader-search-documents --query "ai agents evaluation" --limit 10 --json
readwise reader-search-documents --query "startup pricing" --location-in shortlist,archive --tags-in strategy --limit 10 --json
readwise reader-search-documents --query "evergreen notes" --published-date-gte 2025-01-01 --limit 10 --json
```

Use extra filters only when they materially improve precision:

- `--location-in` for explicit location constraints
- `--tags-in` or `--tags-search` when the user names project tags
- `--author-search` when the user cares about a person
- `--published-date-*` when the user asks for recent or older material

### 2. Search highlights in parallel

Run `readwise-search-highlights` on the same theme to surface supporting evidence, user notes, and memorable phrasing.

```bash
readwise readwise-search-highlights --vector-search-term "ai agents evaluation" --limit 15 --json
readwise readwise-search-highlights --vector-search-term "evergreen notes" --full-text-queries '[{"field_name":"document_title","search_term":"zettelkasten"}]' --limit 15 --json
```

Treat highlights as evidence, not as the final answer. They help you find:

- phrases worth citing
- documents with dense signal
- places where the user left highlight notes
- competing framings or repeated concepts

### 3. Reconcile and rank candidates

Merge both search streams into a single candidate set.

Rank documents higher when they:

- appear in both document search and highlight search
- have multiple matching highlight snippets
- include non-empty highlight notes or document notes
- clearly match the user's scope or tag constraints
- look central enough to explain a recurring theme, not just mention it once

Highlight search results may not include a Reader document ID. When that happens, reconcile them back to documents using title, author, tags, or URL before fetching full document details.

### 4. Fetch deeper context for the strongest candidates

For the top few candidates, fetch:

- full content via `reader-get-document-details`
- highlights via `reader-get-document-highlights`

CLI examples:

```bash
readwise reader-get-document-details --document-id <id> --json
readwise reader-get-document-highlights --document-id <id> --json
```

Do not fetch every match in full. Stop once you have enough evidence to write a grounded memo.

### 5. Narrow if the set is too broad

If the topic is too broad or returns too many weak matches:

- tighten the query to the user's actual angle
- prefer the locations they care about most
- focus on annotated documents over unannotated ones
- reduce to the strongest recurring subthemes

State the narrowing choice briefly in the memo so the user can see your reasoning.

### 6. Weak-results fallback

If Readwise retrieval returns little signal:

1. Say explicitly that the library evidence is thin.
2. Explain how you narrowed or broadened the search.
3. Offer the best next Readwise reading candidates anyway if any exist.
4. Only then add a clearly labeled optional external supplement if the user still needs broader context.

## Memo Structure

Always use this exact section structure and keep the level-2 headings verbatim:

```markdown
# Topic Memo: <topic>

## Research Question
<one short paragraph>

## Most Relevant Sources
- <Title> by <Author> (<location>): why it matters
- <Title> by <Author> (<location>): why it matters

## Key Ideas and Evidence
- <idea or claim>
  Evidence: <documents, highlights, or notes that support it>
- <idea or claim>
  Evidence: <documents, highlights, or notes that support it>

## Tensions / Disagreements / Gaps
- <where sources disagree, where the evidence is thin, or what still needs reading>

## What To Read Next
- <best documents to read or reread and why>

## Suggested Reader Actions
- <specific shortlist, later, archive, or tagging suggestion>
```

Additional memo rules:

- Always include every section, even if one section is thin.
- If there are no strong results, write that explicitly inside the relevant section instead of omitting the section.
- `Most Relevant Sources` may be bullets or a markdown table, but it must name the source title and author or source identity.
- `Suggested Reader Actions` must read like recommendations, not completed actions.

## Writing Rules

- Synthesize. Do not dump raw search results.
- Name sources explicitly so the user can act on them.
- Prefer paraphrase over long quotation. Use short snippets only when the wording itself matters.
- Surface disagreements, uncertainty, and missing evidence instead of forcing a neat consensus.
- If the results are weak, say so plainly and explain what broadened or narrowed search would help.
- Keep the memo skimmable and project-oriented.

## Suggested Reader Actions

End with concrete actions tied to the memo, for example:

- shortlist 2-3 high-value documents for reuse
- move low-signal or duplicate reads to archive
- add a project tag such as `agent-evals` or `pricing`
- mark a batch as seen when the user is clearly done scanning it

Frame them as proposals first. Example:

- "Shortlist these two because they contain reusable frameworks."
- "Archive these three because they only repeat ideas already covered elsewhere."
- "Add the tag `evergreen-notes` to this cluster so future searches are cleaner."

## Mutation Policy

Never call write actions until the user confirms.

Write actions include:

- `reader-add-tags-to-document`
- `reader-move-documents`
- `reader-bulk-edit-document-metadata`

When the user confirms:

1. Restate the exact actions you are about to take.
2. Batch document IDs into as few calls as practical.
3. Check the command result success flags.
4. Report what succeeded and what did not.

CLI examples:

```bash
readwise reader-add-tags-to-document --document-id <id> --tag-names "agent-evals,research"
readwise reader-move-documents --document-ids <id1>,<id2> --location shortlist
readwise reader-bulk-edit-document-metadata --documents '[{"document_id":"<id>","seen":true}]'
```

## When Not To Use This Skill

Do not use this skill when the job is primarily:

- a chronological inbox walkthrough
- a feed catch-up pass with minimal synthesis
- a quiz or memory drill
- a personal reading recap across time

Those are better handled by dedicated Readwise skills such as triage, feed catchup, quiz, or recap.

## Example Requests

- "Help me整理我在 Readwise 里关于 AI agents evaluation 的阅读材料，做一份 memo，并建议哪些值得 shortlist。"
- "我最近读了很多关于个人知识管理和 evergreen notes 的东西，帮我提炼核心分歧，再给我一个标签整理建议。"
- "围绕 startup pricing 找我读过的文章和 highlights，做一页 briefing；不要直接改库，先给我建议。"
- "我最近存了不少关于 B2B SaaS pricing 的东西，帮我从我的阅读里总结 recurring ideas 和 gaps。"
