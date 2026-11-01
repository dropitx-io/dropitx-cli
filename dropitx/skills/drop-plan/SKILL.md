---
name: drop-plan
description: "Share a plan, phase file, or brainstorm/report doc (markdown or HTML) as a public dropitx.site link. Use whenever the user wants to share, distribute, or send a plan/report/design doc to a teammate, get a shareable link for one, or asks to 'drop' a doc -- e.g. 'share this plan with the team', 'get me a link for this report', 'can you send this doc over', 'drop this plan'. Wraps the dropitx CLI's upload command; auto-detects the newest plan/report artifact in the current repo when no path is given."
user-invocable: true
when_to_use: "Invoke right after a plan.md, phase file, or brainstorm/plan report (md or html) has been finalized and the user wants a shareable link instead of a local file, or any time the user's phrasing matches sharing/distributing such a doc."
argument-hint: "[file path]"
metadata:
  author: dropitx
  version: "1.0.0"
---

# drop-plan

Turn a local plan/report doc into a shareable dropitx.site link, using the
`dropitx` CLI (`dropitx upload`) that ships with this skill's parent package.

## Workflow

1. **Check the `dropitx` CLI is available.**
   ```bash
   command -v dropitx
   ```
   If missing, install it automatically:
   ```bash
   pip install dropitx
   ```
   Re-check `command -v dropitx` after installing. If it's still missing,
   stop and report the installation failure to the user — do not proceed.

2. **Check an API key is configured.**
   ```bash
   dropitx config show
   ```
   If no API key is set, **stop here**. Print the exact instruction:
   ```
   dropitx config set-key <your-api-key>
   ```
   Get the key from the DropItX dashboard. Never fabricate, guess, or skip
   this step — API keys are secrets and must come from the user.

3. **Resolve the file to share.**
   - If the user (or the invoking agent) gave an explicit file path, use it
     directly.
   - Otherwise, run the bundled detection script from the repo root:
     ```bash
     python3 <path-to-this-skill>/scripts/find_latest_plan.py
     ```
     This finds the newest plan/report artifact under `plans/*/plan.md`,
     `plans/*/phase-*.md`, `plans/reports/*.md`/`.html`, or `docs/plans/*.md`,
     preferring `plan.md` over its own phase files and `.html` over a sibling
     `.md` twin. If it exits non-zero (no artifacts found), ask the user for
     an explicit path instead of guessing.

4. **Upload it.**
   ```bash
   dropitx upload <resolved-file> --expires 30d
   ```
   No password by default — plans/reports are meant to be reachable by
   whoever has the link.

5. **Report the result.** Print the returned URL prominently. That's the
   deliverable — nothing else to do.

## Notes

- This skill does not modify the shared file, the plan/report itself, or any
  other project state — it only uploads and reports a URL.
- If `dropitx upload` itself fails (network error, server error), surface the
  CLI's error message directly; do not retry silently or fabricate a URL.
