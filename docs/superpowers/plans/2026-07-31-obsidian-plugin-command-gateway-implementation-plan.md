# Obsidian Plugin Command Gateway implementation plan

Status: implementation complete; real-host interaction not verified
Design: [2026-07-31-obsidian-plugin-command-gateway-implementation-design.md](../specs/2026-07-31-obsidian-plugin-command-gateway-implementation-design.md)

## Execution DAG

```text
C0 contracts + fixtures
 ├─> C1 app CommandPort
 ├─> C3 curator schema/prompt
 └─> settings persistence
       |
       v
C2 gateway runtime + ToolDef + RunEnvelope + audit
       |
       v
C4 review surface ──> C5 compile/quarantine
       \                 /
        \               /
         v             v
          C6 Chat/Harness production wiring + golden scenario
                         |
                         v
                build, full tests, real-app QA
```

## Task checklist

### C0 — contracts and configurable defaults

- [x] Add core command descriptor, policy, curator, observation, compiled skill, and audit types.
- [x] Add narrow CommandPort, gateway UI/tool provider, and audit ports.
- [x] Add `templates/config/plugin-command-gateway.json`.
- [x] Register config and prompt IDs.
- [x] Add settings defaults and defensive persisted-data normalization.

### C1 — discovery

- [x] Implement app-owned Obsidian command registry adapter.
- [x] Filter to enabled third-party plugins and exclude Peak/core commands.
- [x] Derive stable source hashes.
- [x] Implement check-only preflight and workspace/vault snapshots, including editor-only commands.
- [x] Add safe/edit/destructive/unavailable/source-change fixtures.

### C2 — runtime and execution

- [x] Implement deterministic rule classifier from template config.
- [x] Compile the current approved command catalog.
- [x] Build the single `obsidian_command_execute` ToolDef.
- [x] Re-check allow, source hash, reviewed-draft hash, risk, and preflight on every call.
- [x] Run invocation through `runCapability`.
- [x] Record side-effect observation and explicit no-change output.
- [x] Implement rotated DataStore JSONL audit adapter.

### C3 — AI curator

- [x] Add Zod response schema.
- [x] Add externalized curator prompt.
- [x] Batch descriptors with configurable limits.
- [x] Parse, filter, and persist findings without touching reviews.
- [x] Test malformed and invented command IDs.

### C4 — review surface

- [x] Bind runtime through AppRuntimeRegistry and ServiceContext.
- [x] Add External plugin commands section to Settings → Tools.
- [x] Group by plugin with scan and explicit AI analyze actions.
- [x] Show evidence, availability, purpose, risk, and source/draft-change state.
- [x] Implement allow, block, and human risk/purpose edits.
- [x] Show recent run receipts and no-observable-change states.

### C5 — skill compile and quarantine

- [x] Produce immutable strict `CompiledCommandSkill`.
- [x] Include only current, human-approved, non-blocked command IDs.
- [x] Enforce the generic tool whitelist plus per-command source and curator-draft hashes.
- [x] Test stale source, stale draft, missing, unknown, and destructive candidates.

### C6 — production wiring and golden scenario

- [x] Inject the runtime into Chat plus document-review, vault-review, and
  manual-action Copilot Harness tool assembly.
- [x] Add command availability without weakening existing MCP/media/vault behavior.
- [x] Extend Copilot readiness with approved external command status.
- [x] Add scripted Harness scenario covering tool call, permission, execution, observation, and receipt.
- [x] Add a real-host acceptance checklist for Calendar/Periodic Notes, Tasks, or QuickAdd.

## Real-host acceptance checklist

This checklist remains `INTERACTION NOT VERIFIED` in the isolated worktree
because no Obsidian CDP listener was available and the branch was intentionally
not installed into the owner's main plugin directory.

1. Open Settings → Tools → External plugin commands in real Obsidian.
2. Scan and confirm enabled community-plugin commands are grouped by plugin;
   Peak, core, and disabled-plugin commands must be absent.
3. Run Analyze with AI and confirm every row remains off until an explicit
   human Allow action.
4. Approve one read command (for example Calendar navigation) and one direct
   edit command (for example Periodic Notes); confirm modal-only QuickAdd
   commands remain blocked from automatic execution.
5. Ask Chat/Copilot to perform each intent; confirm the generic tool is visible,
   edit policy reaches PermissionGuard, and denied calls do not execute.
6. Confirm the approved command changes the expected active file, leaf, modal,
   or vault path and that Settings shows the same observation summary.
7. Re-run AI analysis with a materially changed draft or update the source
   plugin; confirm the approval becomes stale and the old tool call fails.
8. Inspect `<DataStore>/command-gateway/runs.jsonl` for command ID, source and
   curator hashes, compiled Skill ID, policy, RunEnvelope events, and observed
   effects.

## Verification result

- Focused Command Gateway suites: 6/6 passed.
- Affected Chat/Copilot/Harness/registry/RunEnvelope regression set: 22/22 passed.
- Production build: passed.
- Full suite: 390 passed / 4 unrelated pre-existing failures (Composer and
  Streamdown source guards; no failed file overlaps this task's implementation).
- `tsc --noEmit`: repository baseline remains red with 392 TypeScript errors
  across 866 output lines. No diagnostic points into a newly added gateway
  module. The only diagnostics in edited host files remain on pre-existing,
  unchanged lines at `main.ts:1088-1089`, `PluginSettingsLoader.ts:110`, and
  `TemplateRegistry.ts:296`.
- Real Obsidian: `INTERACTION NOT VERIFIED` (no CDP listener; branch not merged
  or copied into the owner's active plugin).

## Verification

1. Run new focused command-gateway suites.
2. Run affected settings, Harness permission, tool availability, Skill, and architecture-boundary suites.
3. Run `npm run build`.
4. Run `npm run test` and separate task failures from pre-existing failures.
5. Discover the live Obsidian CDP listener.
6. If available, reload only this plugin and verify Settings → Tools plus one approved command.
7. If unavailable, report `INTERACTION NOT VERIFIED`.
8. Review `git diff --check`, `git status`, and task-only diff.
9. Commit task-owned files only; do not push or merge.
