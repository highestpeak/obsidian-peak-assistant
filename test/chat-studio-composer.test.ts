// Chat Studio Track C — composer draft isolation + model filter guards.
// Spec: §8 (Composer), §8.5 (model selector), §12.0 (reset matrix).
// Run with: npm run test -- test/chat-studio-composer.test.ts

import assert from 'assert';
import {
	matchesCapabilityFilters,
	matchesContextFloor,
	matchesOutputFloor,
	matchesQuery,
	filterProfileModelItems,
	groupByProfile,
	emptyModelFilter,
	formatTokenFloor,
	type ProfileModelItem,
} from '@/ui/component/model-picker/modelPickerData';
import { useComposerStore, emptyComposerDraft } from '@/ui/view/chat-view/store/composerStore';
import { draftKeyForConversation, draftKeyForNew, draftKeyForProject } from '@/core/types/chat-studio';

// ---------------------------------------------------------------------------
// Model filters (COMP-05): AND semantics, unknown fails positive filters
// ---------------------------------------------------------------------------

const caps = (over: Record<string, unknown> = {}) => ({
	vision: false, pdfInput: false, tools: false, webSearch: false, ...over,
}) as any;

function testCapabilityFilters(): void {
	assert.ok(matchesCapabilityFilters(undefined, []), 'no filters passes unknown caps');
	assert.ok(!matchesCapabilityFilters(undefined, ['vision']), 'unknown caps fail positive filter');
	assert.ok(matchesCapabilityFilters(caps({ vision: true }), ['vision']));
	assert.ok(!matchesCapabilityFilters(caps({ vision: true }), ['vision', 'tools']), 'AND semantics');
	assert.ok(matchesCapabilityFilters(caps({ vision: true, tools: true }), ['vision', 'tools']));
	// imageGeneration undefined = unknown → fails
	assert.ok(!matchesCapabilityFilters(caps(), ['imageGeneration']));
	console.log('PASS: capabilityFilters');
}

function testContextAndOutputFloors(): void {
	// Context: limits.maxInputTokens > limits.maxTokens > caps.maxCtx; unknown fails
	assert.ok(matchesContextFloor(undefined, undefined, 0));
	assert.ok(!matchesContextFloor(undefined, undefined, 128_000), 'unknown fails floor');
	assert.ok(matchesContextFloor(undefined, { maxInputTokens: 200_000 }, 128_000));
	assert.ok(!matchesContextFloor(undefined, { maxInputTokens: 64_000 }, 128_000));
	assert.ok(matchesContextFloor(caps({ maxCtx: 1_000_000 }), undefined, 1_000_000));
	// Output floor
	assert.ok(matchesOutputFloor(undefined, 0));
	assert.ok(!matchesOutputFloor(undefined, 8_000), 'unknown output fails floor');
	assert.ok(matchesOutputFloor({ maxOutputTokens: 64_000 }, 64_000));
	assert.ok(!matchesOutputFloor({ maxOutputTokens: 8_000 }, 64_000));
	console.log('PASS: contextAndOutputFloors');
}

function testQueryGroupingAndFilterPipeline(): void {
	const items: ProfileModelItem[] = [
		{ profileId: 'p1', profileName: 'Work Claude', profileKind: 'anthropic', modelId: 'claude-a', capabilities: caps({ vision: true }), tokenLimits: { maxInputTokens: 200_000, maxOutputTokens: 64_000 } },
		{ profileId: 'p2', profileName: 'Personal Claude', profileKind: 'anthropic', modelId: 'claude-a', capabilities: caps({ vision: true }) },
		{ profileId: 'p3', profileName: 'OpenAI', profileKind: 'openai', modelId: 'gpt-z', capabilities: caps({ tools: true }) },
	];
	// Same provider, different profiles never merge
	const groups = groupByProfile(items);
	assert.strictEqual(groups.length, 3);
	// Query matches profile name, provider kind, and model id
	assert.ok(matchesQuery(items[0], 'work'));
	assert.ok(matchesQuery(items[2], 'openai'));
	assert.ok(matchesQuery(items[1], 'claude-a'));
	assert.ok(!matchesQuery(items[2], 'claude-a'));
	// Pipeline: vision AND ≥128K context → only p1 (p2 has unknown limits)
	const filtered = filterProfileModelItems(items, {
		...emptyModelFilter(),
		capabilities: ['vision'],
		contextFloor: 128_000,
	});
	assert.deepStrictEqual(filtered.map((i) => i.profileId), ['p1']);
	// Output floor with unknown values excludes p2/p3
	const outFiltered = filterProfileModelItems(items, { ...emptyModelFilter(), outputFloor: 64_000 });
	assert.deepStrictEqual(outFiltered.map((i) => i.profileId), ['p1']);
	assert.strictEqual(formatTokenFloor(128_000), '128K');
	assert.strictEqual(formatTokenFloor(1_000_000), '1M');
	console.log('PASS: queryGroupingAndFilterPipeline');
}

// ---------------------------------------------------------------------------
// Composer draft store (COMP-01 / DATA-04): key isolation, no leakage
// ---------------------------------------------------------------------------

function testDraftIsolation(): void {
	const store = useComposerStore.getState();
	store.reset();

	// Write into 'new'
	store.setActiveKey(draftKeyForNew());
	useComposerStore.getState().updateDraft({ text: 'hello', vaultSearch: true });
	// Switch to a conversation — new draft must not leak
	useComposerStore.getState().setActiveKey(draftKeyForConversation('c1'));
	const convDraft = useComposerStore.getState().getDraft();
	assert.strictEqual(convDraft.text, '');
	assert.strictEqual(convDraft.vaultSearch, false);
	// Original 'new' draft preserved
	const newDraft = useComposerStore.getState().getDraft(draftKeyForNew());
	assert.strictEqual(newDraft.text, 'hello');
	assert.strictEqual(newDraft.vaultSearch, true);
	// Project key independent from conversation key
	useComposerStore.getState().updateDraft({ text: 'proj' }, draftKeyForProject('p1'));
	assert.strictEqual(useComposerStore.getState().getDraft(draftKeyForConversation('c1')).text, '');
	console.log('PASS: draftIsolation');
}

function testReplyAnchorAndRefs(): void {
	const store = useComposerStore.getState();
	store.reset();
	store.setActiveKey(draftKeyForConversation('c2'));
	useComposerStore.getState().setReplyAnchor({ messageId: 'm1', preview: 'the answer…' });
	assert.deepStrictEqual(useComposerStore.getState().getDraft().replyAnchor, { messageId: 'm1', preview: 'the answer…' });

	useComposerStore.getState().addExplicitRef({ id: 'r1', kind: 'vault-file', uri: 'Notes/A.md', title: 'A' });
	useComposerStore.getState().addExplicitRef({ id: 'r2', kind: 'vault-file', uri: 'Notes/A.md', title: 'A dup' }); // dedup by kind+uri
	assert.strictEqual(useComposerStore.getState().getDraft().explicitRefs.length, 1);
	useComposerStore.getState().removeExplicitRef('r1');
	assert.strictEqual(useComposerStore.getState().getDraft().explicitRefs.length, 0);
	console.log('PASS: replyAnchorAndRefs');
}

function testFillAndClearSemantics(): void {
	const store = useComposerStore.getState();
	store.reset();
	store.setActiveKey(draftKeyForNew());
	useComposerStore.getState().fillDraftText('Starter draft');
	assert.strictEqual(useComposerStore.getState().getDraft().text, 'Starter draft');
	useComposerStore.getState().fillDraftText('appended');
	assert.strictEqual(useComposerStore.getState().getDraft().text, 'Starter draft\nappended');

	// Success-clear keeps switches (§12.0): content fields reset, switches stay
	useComposerStore.getState().updateDraft({ vaultSearch: true, workflowId: 'plan' });
	useComposerStore.getState().updateDraft({
		text: '', explicitRefs: [], replyAnchor: null, workflowId: null, revisionOfMessageId: null,
	});
	const cleared = useComposerStore.getState().getDraft();
	assert.strictEqual(cleared.text, '');
	assert.strictEqual(cleared.workflowId, null);
	assert.strictEqual(cleared.vaultSearch, true, 'switches survive success-clear');

	// migrateDraftKey moves state and removes the source key
	useComposerStore.getState().updateDraft({ text: 'moving' }, draftKeyForNew());
	useComposerStore.getState().migrateDraftKey(draftKeyForNew(), draftKeyForConversation('c3'));
	assert.strictEqual(useComposerStore.getState().getDraft(draftKeyForConversation('c3')).text, 'moving');
	assert.strictEqual(useComposerStore.getState().getDraft(draftKeyForNew()).text, '', 'source key emptied');

	assert.deepStrictEqual(emptyComposerDraft().explicitRefs, []);
	console.log('PASS: fillAndClearSemantics');
}

function run(): void {
	testCapabilityFilters();
	testContextAndOutputFloors();
	testQueryGroupingAndFilterPipeline();
	testDraftIsolation();
	testReplyAnchorAndRefs();
	testFillAndClearSemantics();
	console.log('chat-studio-composer: all guards passed');
}

run();
