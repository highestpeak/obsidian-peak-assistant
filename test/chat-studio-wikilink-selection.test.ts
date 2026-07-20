import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
	buildVaultReferenceSelection,
	mergeVaultReferenceDraft,
	normalizeVaultReferenceDisplayText,
	reconcileVaultReferencesWithText,
} from '@/ui/component/prompt-input/promptMenuSelection';
import { useComposerStore } from '@/ui/view/chat-view/store/composerStore';
import { draftKeyForConversation } from '@/core/types/chat-studio';

function testSelectionKeepsInlineTextAndExplicitRef(): void {
	const store = useComposerStore.getState();
	store.reset();
	store.setActiveKey(draftKeyForConversation('wikilink-contract'));
	useComposerStore.getState().updateDraft({ text: 'Compare [[des with today' });

	const before = useComposerStore.getState().getDraft().text;
	const from = before.indexOf('[[');
	const to = before.indexOf(' with');
	const selection = buildVaultReferenceSelection(before, from, to, 'Design/notes.md');

	const ref = {
		id: 'ref-1',
		kind: 'vault-file' as const,
		uri: 'Design/notes.md',
		title: 'notes.md',
	};
	// Model the real CodeMirror race: the current store text may still be stale
	// when the shelf ref is added. The atomic merge must prefer resolved editor
	// text and commit both representations together.
	const staleDraft = { ...useComposerStore.getState().getDraft(), text: '' };
	const merged = mergeVaultReferenceDraft(staleDraft, selection.text, ref);
	useComposerStore.getState().updateDraft(merged);

	const draft = useComposerStore.getState().getDraft();
	assert.ok(draft.text.includes('[[notes.md]]'), 'Composer shows only the readable filename inline');
	assert.ok(!draft.text.includes('Design/notes.md'), 'Composer does not expose the full Vault path inline');
	assert.strictEqual(draft.explicitRefs.length, 1, 'the same selection also appears in the context shelf');
	assert.strictEqual(draft.explicitRefs[0].uri, 'Design/notes.md', 'the shelf ref keeps the full Vault path');

	const textWithoutLink = draft.text.replace('[[notes.md]]', '');
	const refsAfterInlineDelete = reconcileVaultReferencesWithText(textWithoutLink, draft.explicitRefs);
	useComposerStore.getState().updateDraft({ text: textWithoutLink, explicitRefs: refsAfterInlineDelete });
	assert.strictEqual(
		useComposerStore.getState().getDraft().explicitRefs.length,
		0,
		'deleting the inline wikilink also removes its paired shelf ref',
	);
}

function testLegacyFullPathDraftMigratesToFilename(): void {
	const refs = [{ id: 'legacy', kind: 'vault-file', uri: 'Area/Topic/legacy.md', title: 'legacy.md' }];
	const normalized = normalizeVaultReferenceDisplayText('Read [[Area/Topic/legacy.md]] next', refs);
	assert.strictEqual(normalized, 'Read [[legacy.md]] next');
}

function testOnlyVaultRefsFollowInlineText(): void {
	const refs = [
		{ id: 'vault', kind: 'vault-file', uri: 'Area/note.md', title: 'note.md' },
		{ id: 'url', kind: 'url', uri: 'https://example.com', title: 'example.com' },
	];
	const reconciled = reconcileVaultReferencesWithText('No wikilink remains', refs);
	assert.deepStrictEqual(reconciled.map((ref) => ref.id), ['url']);
}

function testComposerEditorForwardsTextChanges(): void {
	const source = fs.readFileSync(
		path.resolve(process.cwd(), 'src/ui/view/chat-view/components/Composer.tsx'),
		'utf8',
	);
	const body = source.match(/<PromptInputBody[\s\S]*?\/>/)?.[0] ?? '';
	assert.ok(
		body.includes('onTextChange={onTextChange}'),
		'Composer must wire text changes to its nested PromptInputBody so inline deletion can prune the shelf ref',
	);
}

function testContextShelfShowsFilenameButKeepsPathTooltip(): void {
	const source = fs.readFileSync(
		path.resolve(process.cwd(), 'src/ui/view/chat-view/components/composer/ComposerContextShelf.tsx'),
		'utf8',
	);
	assert.ok(
		source.includes('vaultReferenceDisplayName(ref.uri)'),
		'the context shelf must use the same filename-only display rule as the editor',
	);
	assert.ok(source.includes('tooltip={ref.uri}'), 'the full Vault path remains available as a tooltip');
	assert.ok(!source.includes('data-full-path'), 'Vault refs must not expand into full-path shelf rows');
}

testSelectionKeepsInlineTextAndExplicitRef();
testLegacyFullPathDraftMigratesToFilename();
testOnlyVaultRefsFollowInlineText();
testComposerEditorForwardsTextChanges();
testContextShelfShowsFilenameButKeepsPathTooltip();
console.log('chat-studio-wikilink-selection: all guards passed');
