/**
 * Composer entry semantics (chat-studio §8.3 / COMP-03 / COMP-09).
 *
 * Structural guards for the trigger ownership contract that the Composer
 * now enforces after moving generation actions off the `+` menu:
 *
 *   `+`  → files / vault doc (reuses `[[`) / URL (ExplicitContextRef chip)
 *   `[[` → Vault picker only
 *   `/`  → workflows (Plan …) + generation actions (image/video/music)
 *   `@`  → shared explicit context chip
 *   starter → fills the editable draft only; never triggers submit
 *
 * These tests intentionally sit at the module level — they read the raw
 * source strings for `ComposerPlusMenu.tsx`, `Composer.tsx`,
 * `ChatStartState.tsx`, and `PromptInputBody.tsx` to keep runtime coupling
 * low. That means a purely visual refactor (e.g. class renames) will not
 * break them, but a semantic regression (say: reintroducing "Generate
 * image" as a `MenuRow` in the plus menu) will.
 *
 * Run with: npm run test -- test/composer-entry-semantics.test.ts
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function read(rel: string): string {
	return readFileSync(join(ROOT, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// R1 — `+` menu no longer hosts generation actions.
// ---------------------------------------------------------------------------

function testPlusMenuHasOnlyResourceEntries(): void {
	const src = read('src/ui/view/chat-view/components/composer/ComposerPlusMenu.tsx');
	// Media generation strings must NOT appear as MenuRow entries here.
	const banned = [
		'generateImageLabel',
		'generateImageDescription',
		'generateVideoLabel',
		'generateMusicLabel',
		'ImagePlus',
		'Video as VideoIcon',
		'Music as MusicIcon',
	];
	for (const needle of banned) {
		assert.ok(
			!src.includes(needle),
			`ComposerPlusMenu should not reference "${needle}" (generation entries moved to slash palette)`,
		);
	}
	// The three resource entries must remain.
	assert.match(src, /attachFilesLabel/, 'attach files entry preserved');
	assert.match(src, /attachVaultDocLabel/, 'attach vault doc entry preserved');
	assert.match(src, /attachLinkLabel/, 'attach link entry preserved');
	console.log('PASS: `+` menu owns only files / vault doc / link — no generation rows');
}

// ---------------------------------------------------------------------------
// R2 — `/` slash palette now owns workflows AND generation actions.
// ---------------------------------------------------------------------------

function testSlashPaletteHostsGenerationActions(): void {
	const src = read('src/ui/view/chat-view/components/Composer.tsx');
	// Every generation action id must appear in the slashItems array.
	for (const id of ['generate-image', 'generate-video', 'generate-music']) {
		assert.ok(
			src.includes(`'${id}'`) || src.includes(`"${id}"`),
			`slashItems must include "${id}" action`,
		);
	}
	// Plan workflow entry must remain.
	assert.match(src, /workflowPlanLabel/, 'workflow (plan) entry preserved');
	// The onMenuItemSelect handler must open the generation panel for the
	// three action values.
	// The generate-* handlers must land on `image` / `video` / `music` (order
	// as declared). Post-edit-image (2026-07-21) the payload switched from
	// a bare kind to `{ kind, mode }` so the slash palette can host BOTH
	// generate and edit for the same kind.
	assert.match(src, /generate-image[\s\S]{0,120}setGenerateOpen\([^)]*['"]image['"]/);
	assert.match(src, /generate-video[\s\S]{0,120}setGenerateOpen\([^)]*['"]video['"]/);
	assert.match(src, /generate-music[\s\S]{0,120}setGenerateOpen\([^)]*['"]music['"]/);
	// The Edit image entry must exist in the same palette group so users
	// discover it next to Generate image (§4 A1).
	assert.match(src, /['"]edit-image['"]/);
	// R2b (2026-07-21) — Generate document rides `artifact_create`; must be
	// present as its own slash entry so users can invoke it without hunting
	// for a runtime that doesn't exist.
	assert.match(src, /['"]generate-document['"]/);
	assert.match(src, /generateDocumentLabel/);
	// Generate document is workflow-fill (not media-generate) — its handler
	// must call `updateDraft({ text` (not `setGenerateOpen`) so the draft
	// is populated with a template and NOT auto-sent (COMP-09).
	assert.match(
		src,
		/item\.value === ['"]generate-document['"][\s\S]{0,600}updateDraft\(\s*\{[\s\S]{0,120}text:/,
		'generate-document handler must populate draft via updateDraft({ text: ... })',
	);
	// Guard against accidental auto-send: no `handleSubmit` inside the
	// generate-document handler window.
	const handlerMatch = src.match(/item\.value === ['"]generate-document['"][\s\S]{0,600}?return;/);
	assert.ok(handlerMatch, 'generate-document handler window must exist');
	assert.ok(!handlerMatch![0].includes('handleSubmit'),
		'generate-document handler must not auto-send');
	// Availability probe must NOT gate this row — artifact_create is always
	// registered by the D-Track producer service, so the slash item never
	// carries a `disabled:` clause tied to a media runtime.
	const itemBlock = src.match(/id:\s*['"]generate-document['"][\s\S]{0,400}?\},/)?.[0] ?? '';
	assert.ok(!/disabled:/.test(itemBlock),
		'generate-document slash item must never be disabled');
	// Availability probe must gate the disabled state — no fake-clickable
	// rows (§5.5.1). If `mediaReady` disappears the guard should refuse to
	// disable, and rows must never render clickable when unavailable.
	assert.match(src, /disabled:\s*!imageReady/);
	assert.match(src, /disabled:\s*!videoReady/);
	assert.match(src, /disabled:\s*!musicReady/);
	console.log('PASS: `/` slash palette owns workflows + generation actions with honest availability');
}

// ---------------------------------------------------------------------------
// R3 — `/` remains scoped to input start while the shared instruction
// capability assigns `@` to explicit context chips.
// ---------------------------------------------------------------------------

function testSlashTriggerScopedToStart(): void {
	const src = read('src/ui/component/prompt-input/promptTrigger.ts');
	const composer = read('src/ui/view/chat-view/components/Composer.tsx');
	assert.match(
		src,
		/docText\.startsWith\(['"]\/['"]\)/,
		'`/` trigger must only fire when the input starts with a slash',
	);
	assert.match(src, /trigger:\s*['"]@['"]/);
	assert.match(composer, /trigger === ['"]@['"][\s\S]{0,500}addExplicitRef/);
	console.log('PASS: `/` is start-anchored and `@` creates explicit context');
}

// ---------------------------------------------------------------------------
// R4 — starter buttons only fill the draft, never submit.
// ---------------------------------------------------------------------------

function testStartersNeverAutoSend(): void {
	const src = read('src/ui/view/chat-view/components/composer/ChatStartState.tsx');
	// `fill` writes to updateDraft — that's the only mutation.
	assert.match(src, /store\.updateDraft\(\{\s*text:\s*draft\s*\}/);
	// The onClick handler must call fill(starter.draft), never a submit hook.
	assert.match(src, /onClick=\{\(\)\s*=>\s*fill\(starter\.draft\)\}/);
	// No submit / handleSubmit / send call in this file — starters must not
	// pierce the compose→send layering.
	for (const banned of ['handleSubmit', 'useChatSubmit', 'useInputSubmit', 'sendMessage']) {
		assert.ok(
			!src.includes(banned),
			`ChatStartState must not call "${banned}" (COMP-09: starter only fills draft)`,
		);
	}
	console.log('PASS: starter buttons only fill the draft, never auto-send');
}

// ---------------------------------------------------------------------------
// R5 — starter shelf collapses (opacity/aria-hidden) once draft has content.
// This is COMP-09's "once the draft has content the row fades out" clause.
// ---------------------------------------------------------------------------

function testStartersHideWhenDraftPresent(): void {
	const src = read('src/ui/view/chat-view/components/composer/ChatStartState.tsx');
	assert.match(src, /data-has-draft=\{hasDraft/);
	assert.match(src, /aria-hidden=\{hasDraft\s*\?\s*true\s*:\s*undefined\}/);
	assert.match(src, /tabIndex=\{hasDraft\s*\?\s*-1\s*:\s*0\}/,
		'starter buttons must drop out of keyboard tab order when draft has content');
	console.log('PASS: starter shelf collapses (aria-hidden + tabIndex=-1) once draft has content');
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function run(): void {
	const tests: Array<[string, () => void]> = [
		['plus menu owns resources only', testPlusMenuHasOnlyResourceEntries],
		['slash palette hosts workflows + generation', testSlashPaletteHostsGenerationActions],
		['`/` trigger start-anchored, `@` explicit context', testSlashTriggerScopedToStart],
		['starter buttons never auto-send', testStartersNeverAutoSend],
		['starter shelf collapses on draft', testStartersHideWhenDraftPresent],
	];
	for (const [name, fn] of tests) {
		try {
			fn();
		} catch (err) {
			console.error(`FAIL: ${name}`);
			throw err;
		}
	}
	console.log(`\ncomposer-entry-semantics: all ${tests.length} guards passed`);
}

run();
