# Architecture Modernization Wave 1 — Implementation Plan

> **For agentic workers:** Follow tasks in order. Each task is a self-contained checkbox unit. Run tests after every code-touching task. Skip commits — the current branch (`codex/peak-modernization-refactor`) already carries substantial WIP; final commit strategy will be decided when Wave 1 is verified as green.

**Goal:** Land the three parallel foundations from `docs/superpowers/specs/2026-07-02-architecture-modernization-completion-plan.md` §Wave 1 — Contract Seeds (T1), Boundary Baseline (T0), ToolDef Envelope (T5). This plan covers T1 + T0 in this session; T5 is scheduled but deferred out of this session because it touches service-side routing code (`MCPToolAdapter`, `agents/harness/tool/*`) and needs its own design pass.

**Architecture:** All Wave 1 additions are **pure new files** or **additive type lifts**. No behavior change. No runtime wiring. The one existing file we touch is `src/service/run-envelope/types.ts`, which we minimally reduce to re-exporting `ArtifactRef` / `ArtifactRefInput` from `src/core/types/artifact.ts` so the VaultLint adopter and the run-envelope shape-guard test keep working.

**Tech Stack:** TypeScript, esbuild, `npm run test` (Node + esbuild compile), `@/*` path alias → `src/*`.

**Source spec:** `docs/superpowers/specs/2026-07-02-architecture-modernization-completion-plan.md`

---

## Task 0: Baseline

**Files:** none (verification only)

- [ ] **Step 1: Record uncommitted-file surface**

Run: `git status --short | wc -l`
Expected: the number is stable across the session (only files this plan touches should appear as new after Wave 1).

- [ ] **Step 2: Baseline test suite**

Run: `npm run test`
Expected: all tests pass. If baseline is red, stop and report which tests fail before touching code.

- [ ] **Step 3: Baseline build**

Run: `npm run build`
Expected: build succeeds; `main.js` regenerated.

No commit at this step.

---

## Task 1: Lift ArtifactRef into `core/types/artifact.ts`

**Files:**
- Create: `src/core/types/artifact.ts`
- Modify: `src/service/run-envelope/types.ts` (re-export `ArtifactRef` + `ArtifactRefInput` from core, drop local definition)

**Rationale:** The RunEnvelope core already ships `ArtifactRef` in `service/run-envelope/types.ts`. T1 Contract Seeds requires it to be usable by non-run-envelope callers (Copilot artifact adapter, AI Analysis, Chat message storage, T4 pilot capability). Lifting it to `core/types/` matches the naming/placement of `chat.ts`, `ambient.ts`, `usage.ts`. The lift is byte-for-byte — same fields, same JSDoc, no additions this task.

- [ ] **Step 1: Create `src/core/types/artifact.ts`**

Copy the `ArtifactRef` interface and `ArtifactRefInput` type from `src/service/run-envelope/types.ts` verbatim (fields: `artifactId`, `runId`, `kind`, `title?`, `uri?`, `contentType?`, `createdAt`; `ArtifactRefInput = Omit<ArtifactRef, 'artifactId' | 'runId' | 'createdAt'>`). Preserve JSDoc. No imports needed.

Add a top-of-file comment:
```
// Cross-capability artifact reference. Lifted from
// service/run-envelope/types.ts in T1 Contract Seeds so that non-
// run-envelope callers (Copilot artifact adapter, AI Analysis, future
// T4 pilot capability) can reference the same type without importing
// from service/. See spec 2026-07-02-architecture-modernization-completion-plan.
```

- [ ] **Step 2: Convert `src/service/run-envelope/types.ts` to re-exporter**

Replace the local `export interface ArtifactRef { ... }` and `export type ArtifactRefInput = ...` blocks with:
```ts
export type { ArtifactRef, ArtifactRefInput } from '@/core/types/artifact';
```

Keep everything else in `run-envelope/types.ts` intact (RunSession, RunStatus, RunTrigger, RunEvent, RunClock, RunIdFactory, StartRunInput, FinalRunStatus).

**Note:** the shape-guard test `test/run-envelope-core.test.ts` scans this file's source text for the `ArtifactRef` interface. Verify whether it will accept the re-export. If it hard-scans for `interface ArtifactRef`, adjust the test in the same task to accept the re-export form — the intent (shape lock) is preserved because `core/types/artifact.ts` becomes the source of truth.

- [ ] **Step 3: Verify no consumer breaks**

Run: `grep -rE "from ['\"]@/service/run-envelope" src/ test/`
Expected: existing consumers import `ArtifactRef` from `@/service/run-envelope` — that still works via re-export. If any consumer imports the type via the *file path* `@/service/run-envelope/types` directly, it also works.

Run: `npm run test`
Expected: all tests pass.

Run: `npm run build`
Expected: build succeeds.

---

## Task 2: Add `CapabilityManifest` type in `core/types/capability.ts`

**Files:**
- Create: `src/core/types/capability.ts`

**Rationale:** Locks the shape of a "capability contract" as defined in `01-architecture.html` §capability-contract and handbook §8. This is a pure type file — no registry wiring, no runtime code, no import from `service/`.

- [ ] **Step 1: Draft the type**

Create `src/core/types/capability.ts` with:

```ts
// Capability contract seed — T1 in the architecture modernization plan.
//
// A CapabilityManifest describes ONE product capability (e.g. "review the
// current document", "vault search") as data. It does not run anything by
// itself; a CapabilityRunner (T4) will read manifests, pick a backend, and
// dispatch. Until then, this type + fixtures serve as the design lock.
//
// Vocabulary note:
//   - `id` (this file) is the *contract* identifier, e.g. 'doc.review.current'
//     or 'vault.search'. Stable, machine-readable, referenced by RunSession
//     .capabilityId and by SkillManifest.
//   - `CapabilityName` from src/service/capabilities/SurfaceCapability.ts is
//     the *user-facing* label ('Conversation', 'Research', ...). The two
//     namespaces stay separate: one is code, one is UI copy.
//
// See docs/superpowers/specs/2026-07-02-architecture-modernization-completion-plan.md
// §Wave 1.B for the design rationale and the surface-binding examples.

import type { SurfaceId } from '@/service/capabilities/SurfaceCapability';

export type PermissionKind = 'read' | 'acceptEdits' | 'bypassPermissions';
export type CostTier = 'fast' | 'deep' | 'premium';

/**
 * Backend that will physically execute the run. Handbook §8 lists three;
 * new entries here are a breaking change and require handbook edit.
 */
export type BackendKind = 'hermes-harness' | 'claude-sdk' | 'provider-direct';

/**
 * Policy for picking a backend. `preferred` is tried first; `fallback` is
 * used when the preferred backend is unavailable (e.g. no API key). Empty
 * fallback means the run fails-loud instead of silently downgrading.
 */
export interface BackendPolicy {
	readonly preferred: BackendKind;
	readonly fallback: readonly BackendKind[];
}

/**
 * Reference to a Skill by its stable id. The compiled skill (T6) resolves
 * this at run-time and enforces the allowed-tools quarantine.
 */
export type SkillRef = string;

/**
 * Minimal input/output shape descriptor. Kept as JSON-shaped structural
 * hint rather than a Zod schema so this file has zero runtime imports.
 * When T4 runner lands, it will decide whether to also carry a runtime
 * schema alongside; the two co-exist without shape drift.
 */
export interface CapabilityContractShape {
	readonly kind: 'object' | 'string' | 'array' | 'custom';
	readonly description: string;
	readonly fields?: Readonly<Record<string, string>>;
}

/**
 * Full capability contract. Every field is required — partial manifests
 * are a design smell (see spec §Cross-Cutting Rules "No Dual System").
 */
export interface CapabilityManifest {
	readonly id: string;
	readonly title: string;
	readonly description: string;

	readonly inputContract: CapabilityContractShape;
	readonly outputContract: CapabilityContractShape;

	readonly permissionKind: PermissionKind;
	readonly costTier: CostTier;
	readonly backendPolicy: BackendPolicy;

	readonly skillRef: SkillRef;
	readonly surfaceBinding: readonly SurfaceId[];
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep 'src/core/types/capability.ts' | head -20`
Expected: no output (no errors involving this file).

Run: `npm run build`
Expected: build succeeds. The new file will not be bundled (no importer yet), but tsc must accept it.

---

## Task 3: Author `doc.review.current` fixture

**Files:**
- Create: `test/fixtures/capabilities/doc-review-current.fixture.ts`

**Rationale:** Concrete example of a fully populated `CapabilityManifest`. Serves as a design anchor for T4 pilot capability (Wave 3.B) and as a test fixture for the shape-guard in Task 4.

- [ ] **Step 1: Write the fixture**

Create `test/fixtures/capabilities/doc-review-current.fixture.ts`:

```ts
import type { CapabilityManifest } from '@/core/types/capability';

// Fixture for the T4/T9 pilot capability. Not wired to any runtime yet.
// See docs/superpowers/specs/2026-07-02-architecture-modernization-completion-plan.md
// §Wave 3.B.
export const DOC_REVIEW_CURRENT_FIXTURE: CapabilityManifest = {
	id: 'doc.review.current',
	title: 'Review current document',
	description:
		'Runs a scoped review pass over the currently open document, producing findings and suggested edits as an artifact for the Copilot review panel.',

	inputContract: {
		kind: 'object',
		description: 'The active file path plus optional user focus prompt.',
		fields: {
			activeFilePath: 'string (absolute path within the vault)',
			focusPrompt: 'string | undefined (user-provided emphasis)',
		},
	},
	outputContract: {
		kind: 'object',
		description:
			'A ReviewArtifact reference + summary, delivered as an ArtifactRef event on the RunEnvelope.',
		fields: {
			artifactId: 'string',
			summary: 'string (short human-readable overview)',
			findingCount: 'number',
		},
	},

	permissionKind: 'read',
	costTier: 'deep',
	backendPolicy: {
		preferred: 'claude-sdk',
		fallback: ['hermes-harness', 'provider-direct'],
	},

	skillRef: 'doc-review.v1',
	surfaceBinding: ['copilot'],
};
```

- [ ] **Step 2: Verify fixture compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E '(doc-review-current|capability.ts)' | head`
Expected: no output.

---

## Task 4: Shape-guard test locking the fixture + type

**Files:**
- Create: `test/capability-manifest-shape.test.ts`

**Rationale:** Prevents a future PR from silently removing a `CapabilityManifest` field (or making it optional). The test source-scans both files.

- [ ] **Step 1: Write the guard test**

Follow the pattern of `test/run-envelope-core.test.ts` — read the source files as text and assert the presence of specific tokens. Example structure:

```ts
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const typeSource = readFileSync(
	resolve(__dirname, '../src/core/types/capability.ts'),
	'utf8',
);
const fixtureSource = readFileSync(
	resolve(__dirname, 'fixtures/capabilities/doc-review-current.fixture.ts'),
	'utf8',
);

// Shape lock: every field named in the CapabilityManifest interface MUST
// be present. Losing a field silently is a design regression (spec §Cross-Cutting Rules).
const requiredFields = [
	'id',
	'title',
	'description',
	'inputContract',
	'outputContract',
	'permissionKind',
	'costTier',
	'backendPolicy',
	'skillRef',
	'surfaceBinding',
] as const;

for (const field of requiredFields) {
	assert.match(
		typeSource,
		new RegExp(`readonly ${field}\\b`),
		`CapabilityManifest field '${field}' missing from type source`,
	);
	assert.match(
		fixtureSource,
		new RegExp(`\\b${field}:`),
		`Fixture field '${field}' missing`,
	);
}

// The manifest must not import from service/* — that would invert the layering.
assert.doesNotMatch(
	typeSource,
	/from ['"]@\/service\//,
	'core/types/capability.ts must not import from service/*',
);

// Exception: SurfaceId is a type-only import from service/capabilities/SurfaceCapability
// because SurfaceId is a user-vocabulary set that lives with the UI-facing readiness
// contract, and we intentionally reuse the same closed set. This is validated to be a
// TYPE-only import (no runtime bindings).
assert.match(
	typeSource,
	/import type \{ SurfaceId \} from ['"]@\/service\/capabilities\/SurfaceCapability['"]/,
	'SurfaceId must be a type-only import',
);

console.log('capability-manifest-shape.test.ts: passed');
```

The exact runner harness varies by repo (`run-test.js` compiles `*.test.ts` with esbuild and runs via Node). Match the style of `test/run-envelope-core.test.ts`.

- [ ] **Step 2: Run the guard**

Run: `npm run test -- test/capability-manifest-shape.test.ts`
Expected: passes on first run.

Also run the run-envelope shape guard, since Task 1 modified `service/run-envelope/types.ts`:
Run: `npm run test -- test/run-envelope-core.test.ts`
Expected: passes. If it fails because it hard-scans for `interface ArtifactRef` inside that file, adjust the run-envelope guard to instead assert that the file re-exports `ArtifactRef` from `@/core/types/artifact` (design intent unchanged — the shape lock now lives in the core file).

---

## Task 5: Full-suite verification for T1

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: same pass count as baseline (Task 0 Step 2) plus one new test passing (`capability-manifest-shape.test.ts`).

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: succeeds. `main.js` byte-size will be effectively unchanged because the new type file is not imported by any runtime code yet.

- [ ] **Step 3: Git status sanity**

Run: `git status --short`
Expected: exactly these NEW / MODIFIED files touched by Wave 1 T1:
- `A src/core/types/artifact.ts`
- `A src/core/types/capability.ts`
- `M src/service/run-envelope/types.ts`
- `A test/fixtures/capabilities/doc-review-current.fixture.ts`
- `A test/capability-manifest-shape.test.ts`
- possibly `M test/run-envelope-core.test.ts` (if the re-export tweak was needed)

Do NOT commit in this session (branch already carries substantial unstaged work).

---

## Task 6 (parallel worktree): T0 Boundary Baseline

Owner: dispatched subagent (isolation: worktree). See separate task in the task list.

**Scope reminder:** consolidate existing `*-source-guard.test.ts` into `test/boundary/`, add no-new-violation gate for `service/` importing `obsidian` / `AppContext.getInstance` / `useXxxStore`. Baseline snapshot of current violations is expected and committed to a JSON allowlist.

**Merge policy:** subagent lands its own commits in its worktree. Do not attempt to merge in this session — Wave 1 verification happens per-worktree first.

---

## Task 7 (deferred): T5 ToolDef Envelope

Not executed in this session. Requires:
- A dedicated design pass (subagent-driven-development pattern would fit).
- Careful sequencing with `service/mcp/MCPToolAdapter.ts` and `service/agents/harness/tool/*` — both live paths, non-trivial risk if the sequencing gets wrong.
- Wave 1 T1 + T0 landed first so the type contracts and boundary tests are the safety net.

Track as follow-up in Wave 1 retrospective.

---

## Definition of Done (Wave 1 T1)

1. All Task 5 verification steps pass.
2. `src/core/types/capability.ts` and `src/core/types/artifact.ts` exist and compile.
3. `doc-review-current.fixture.ts` is a valid `CapabilityManifest`.
4. `capability-manifest-shape.test.ts` runs green.
5. `run-envelope-core.test.ts` still runs green.
6. No behavior changes; `main.js` diff is trivial (type-only additions).
7. The follow-up worktree for T0 either lands or is explicitly deferred with a note.
