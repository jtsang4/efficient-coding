---
name: merge-and-rebase
description: Ship a finished feature branch end to end - commit and push, open a pull/merge request against the trunk branch, merge it without squashing, then rebase the feature branch onto the updated trunk. Use when the user says work on this branch is done and asks to submit, raise a PR/MR, merge it, land it, or sync the branch back onto main.
---

# Merge and Rebase

The user has finished a change on a feature branch. Carry it through four stages: commit and push, open a request against trunk, merge it, then rebase the feature branch onto the new trunk. Stop and ask whenever the repository state contradicts what the user described.

## Before Starting

Establish the ground truth from the repository itself, not from assumptions:

- The current branch, and confirmation that it is not the trunk branch. If the user is standing on trunk, stop and ask what they intended.
- The trunk branch name as this repository actually uses it — `main`, `master`, `develop`, or something else. Read it from the remote's default branch or the repo's own conventions rather than guessing.
- The hosting platform and remote, so you know whether the target is a GitHub pull request, a GitLab merge request, or another forge's equivalent.
- Whether the working tree has uncommitted changes, and whether they are all part of the feature the user means to ship.

Report anything surprising — unrelated modified files, a detached HEAD, an unexpected upstream, an already-open request for this branch — before acting on it.

## Stage 1: Commit and Push

Review the actual diff before writing anything. Understand what changed and why.

Stage the changes that belong to this feature. Leave unrelated edits, stray debug output, local scratch files, and secrets out of the commit; call them out to the user instead of silently including or discarding them.

Write the commit message in the style this repository already uses — check recent history for whether it follows Conventional Commits, a ticket-prefix convention, or plain prose, and match it. Describe why the change exists, not a file-by-file inventory. Do not add promotional trailers or co-author lines that the repo does not already use.

Push the branch to the remote, setting upstream if it has none. If the push is rejected because the remote branch moved, inspect the divergence and ask before overwriting anything.

If the branch is already committed and pushed with nothing outstanding, say so and move on rather than manufacturing an empty commit.

## Stage 2: Open the Request

Create a pull request or merge request from the feature branch into the trunk branch.

Write a title and description that let a reviewer understand the change without reading every commit: what problem it solves, the approach taken, and anything a reviewer should look at closely. Fill in the repository's PR/MR template if one exists. Link the related issue or ticket when the branch name, commits, or the user's instructions make it identifiable.

**Do not squash.** This is the default for this workflow and it applies at every point squashing can be configured:

- If the request-creation step exposes a squash option, set it off.
- If the platform's form has a "squash commits when merge request is accepted" checkbox — as GitLab does — uncheck it after creating the request.
- If the merge step later offers a strategy choice, choose the ordinary merge commit, not squash.

Override this only when the user explicitly asks for a squash on this particular change, or when the target repository enforces squash-only merges at the platform level. In the enforced case, tell the user that the platform is forcing it rather than silently complying.

If a request for this branch already exists, reuse it and update its description if it is stale, instead of opening a duplicate.

## Stage 3: Merge It

Merge the request into trunk using whatever capability the environment actually provides, in this order of preference:

1. **A repository CLI or platform tool already available on the host** — a forge CLI, an API client, or a configured integration. This is the most reliable path; use it when it exists and is authenticated.
2. **A skill or connector in the current environment** that manages this platform's requests.
3. **A browser automation tool**, driving the request's web page directly — open the request, verify the squash setting is off, pick the merge-commit strategy, and click merge.

Do not invent a tool that is not present. If none of the three paths is available, stop and hand the user the request URL with an explicit note that the merge needs to happen manually.

Before merging, check the gates the platform reports: required approvals, status checks, and conflicts with trunk. If checks are still running, say so and ask whether to wait or proceed. If the request is blocked by review requirements or a failing check, do not attempt to bypass it — report the blocker and stop. If trunk has conflicting changes, resolve them on the feature branch and push before merging, and describe the resolution to the user.

After merging, confirm the merge actually landed rather than assuming the command succeeded.

## Stage 4: Rebase onto the New Trunk

Bring the feature branch onto the merged trunk so continued work starts from current code:

1. Fetch the remote so the local view of trunk includes the merge.
2. From the feature branch, rebase onto the updated trunk.
3. Resolve conflicts if any appear, explaining each resolution. If the rebase is going badly, abort it and tell the user rather than forcing through a resolution you are unsure about.

Because the branch's commits are already in trunk after the merge, this usually leaves the feature branch sitting cleanly on top of trunk with nothing extra. That is the expected outcome, not an error.

The rebase rewrites local history, so the branch will diverge from its remote copy. Do not force-push automatically. Mention the divergence and, if the user wants the remote updated, force-push with a lease so a concurrent push cannot be clobbered.

If the branch was deleted on the remote as part of the merge, point that out and confirm whether the user wants to keep working on it locally, delete it, or start a fresh branch from trunk.

## Reporting

Close with what actually happened at each stage: the commit that was pushed, the request URL, the merge strategy used, and the branch's final state relative to trunk. If any stage was skipped, blocked, or done differently than described here, say which one and why.
