// Structural + behavioural regression: the TTS + cover commands must run
// through MediaGenerationService (task-c1 §R5), not the old bespoke
// MediaRingService construction. AppContext-touching code can't be
// exercised directly in this test env, so we assert:
//   1. The command IDs are registered in main.ts (guards against
//      accidental deregistration during future refactors).
//   2. PeakCommandActions imports the new service, not the old ring.
//   3. The invocation shapes we intend (kind=tts route=fal presetId=default
//      / kind=image route=fal presetId=cover-hd) are the ones present in
//      source, so future edits that "helpfully" simplify the wiring will
//      break this test loudly.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
	return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

async function testCommandIdsRegisteredInMain() {
	const main = read('main.ts');
	assert.ok(
		main.includes("id: 'peak-media-tts-active-note'"),
		'peak-media-tts-active-note must be registered in main.ts',
	);
	assert.ok(
		main.includes("id: 'peak-media-cover-active-note'"),
		'peak-media-cover-active-note must be registered in main.ts',
	);
	console.log('  ✓ media command IDs still registered in main.ts');
}

async function testCommandsUseNewMediaGenerationService() {
	const actions = read('src/app/commands/PeakCommandActions.ts');
	// D1 §R1: the concrete MediaGenerationService is now composed once at
	// boot (main.ts + src/app/media/composeMediaGenerationService.ts) and
	// bound onto ConversationService; commands look it up via
	// `manager.conv.getMediaGenerationService()`. The composer helper is
	// the single import surface for command-mode fallback.
	assert.ok(
		actions.includes('getMediaGenerationService'),
		'PeakCommandActions must consult the app-wired MediaGenerationService via ConversationService',
	);
	assert.ok(
		actions.includes("'@/app/media/composeMediaGenerationService'"),
		'PeakCommandActions must fall back to composeMediaGenerationService when the runtime is not yet bound',
	);
	// The old bespoke ring builder must be gone; a second ring writer would
	// re-introduce the "two media writers" bug the brief explicitly forbids.
	assert.ok(
		!actions.includes('new MediaRingService('),
		'PeakCommandActions must not construct MediaRingService directly anymore',
	);
	// Verify main.ts wires the service at boot (D1 §R1 + §R5).
	const main = read('main.ts');
	assert.ok(
		main.includes('composeMediaGenerationService'),
		'main.ts must compose MediaGenerationService at boot',
	);
	assert.ok(
		main.includes('setMediaGenerationService'),
		'main.ts must bind MediaGenerationService onto ConversationService for Chat tool wiring',
	);
	assert.ok(
		main.includes('failAllUnfinished'),
		'main.ts must call failAllUnfinished at boot (C1 concern 3 / D1 §R5)',
	);
	console.log('  ✓ commands migrated to MediaGenerationService (single writer path, wired at boot)');
}

async function testCommandInvocationShape() {
	const actions = read('src/app/commands/PeakCommandActions.ts');
	// TTS invocation
	assert.ok(actions.match(/kind:\s*'tts'/), 'TTS command must pass kind:tts');
	assert.ok(actions.match(/presetId:\s*'default'/), 'TTS command must reference presetId default');
	// Cover image invocation — cover-hd preset (16:9)
	assert.ok(actions.match(/presetId:\s*'cover-hd'/), 'Cover command must use cover-hd preset');
	assert.ok(actions.match(/route:\s*'fal'/), 'commands must specify route:fal');
	console.log('  ✓ command request shapes match config presets');
}

async function testFalKeyNoticeCopyPreserved() {
	const actions = read('src/app/commands/PeakCommandActions.ts');
	assert.ok(
		actions.includes('fal.ai API key not configured'),
		'fal-key-missing notice text preserved for user familiarity',
	);
	console.log('  ✓ fal key notice copy preserved (behaviour compat)');
}

async function main() {
	await testCommandIdsRegisteredInMain();
	await testCommandsUseNewMediaGenerationService();
	await testCommandInvocationShape();
	await testFalKeyNoticeCopyPreserved();
	console.log('media-commands-migration: ok');
}

main().catch((err) => { console.error(err); process.exit(1); });
