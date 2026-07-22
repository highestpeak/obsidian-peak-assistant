/**
 * Assistant Builder lifecycle — service layer (chat-studio §8.6 / COMP-07 /
 * RUN-04).
 *
 * Covers the persistence + list contract that the AssistantBuilderModal and
 * ComposerAssistantSelector depend on. The runtime plumbing (resolver,
 * AssistantSlot, tool policy, model precedence) is covered by
 * `test/assistant-runtime.test.ts`; this file only exercises the CRUD /
 * archive / duplicate paths and their round-trip semantics.
 *
 * Run with: npm run test -- test/assistant-builder-lifecycle.test.ts
 */

import assert from 'assert';
import { AssistantService } from '@/service/chat/service-assistant';
import { EphemeralAssistantRegistry } from '@/service/chat/assistant/EphemeralAssistantRegistry';
import { resolveAssistantForConversation } from '@/service/chat/assistant/assistantResolver';
import type { ChatAssistantDefinition } from '@/core/types/chat-studio';
import type { ChatConversation } from '@/service/chat/types';

// ---------------------------------------------------------------------------
// In-memory ChatStorageService stub — only implements what AssistantService
// touches. Keeps definitions in a map, honours the `archived` filter on list,
// and simulates a soft-fail path so `AssistantService.get` can degrade to null
// without throwing.
// ---------------------------------------------------------------------------

function makeStorage() {
	const rows = new Map<string, ChatAssistantDefinition>();
	return {
		async listAssistants(includeArchived: boolean = false): Promise<ChatAssistantDefinition[]> {
			const all = Array.from(rows.values());
			return includeArchived ? all : all.filter((a) => !a.archived);
		},
		async readAssistant(id: string): Promise<ChatAssistantDefinition | null> {
			return rows.get(id) ?? null;
		},
		async saveAssistant(def: ChatAssistantDefinition): Promise<void> {
			rows.set(def.id, def);
		},
		async deleteAssistant(id: string): Promise<void> {
			rows.delete(id);
		},
		_size(): number { return rows.size; },
	} as any;
}

function makeService() {
	const storage = makeStorage();
	return { service: new AssistantService(storage as any), storage };
}

// ---------------------------------------------------------------------------
// R1 — create / read / list round-trip.
// ---------------------------------------------------------------------------

async function testCreateAndList(): Promise<void> {
	const { service } = makeService();
	const created = await service.create({
		name: 'Research analyst',
		summary: 'Digs into vault-scoped literature',
		instructions: 'Cite sources when possible.',
	});
	assert.strictEqual(typeof created.id, 'string');
	assert.strictEqual(created.name, 'Research analyst');
	assert.deepStrictEqual(created.toolPolicy, { allow: [], deny: [], approval: 'writes' });
	assert.deepStrictEqual(created.knowledgeRefs, []);
	assert.strictEqual(created.archived, undefined);

	const list = await service.list();
	assert.strictEqual(list.length, 1);
	assert.strictEqual(list[0].id, created.id);

	const fetched = await service.get(created.id);
	assert.ok(fetched);
	assert.strictEqual(fetched!.instructions, 'Cite sources when possible.');
	console.log('PASS: create + list + get round-trip');
}

// ---------------------------------------------------------------------------
// R2 — update preserves id + createdAt, bumps updatedAt, and only replaces
// fields we sent.
// ---------------------------------------------------------------------------

async function testUpdatePreservesIdentity(): Promise<void> {
	const { service } = makeService();
	const created = await service.create({ name: 'A' });
	const t0 = created.updatedAt;
	// Force at least a 1ms gap so updatedAt advances even on fast runners.
	await new Promise((r) => setTimeout(r, 2));
	const updated = await service.update({
		...created,
		name: 'A prime',
		summary: 'renamed',
		toolPolicy: { allow: ['mcp_x_write'], deny: ['mcp_x_delete'], approval: 'never' },
	});
	assert.strictEqual(updated.id, created.id, 'id preserved');
	assert.strictEqual(updated.createdAt, created.createdAt, 'createdAt preserved');
	assert.ok(updated.updatedAt > t0, 'updatedAt bumped');
	assert.deepStrictEqual(updated.toolPolicy, {
		allow: ['mcp_x_write'],
		deny: ['mcp_x_delete'],
		approval: 'never',
	});
	console.log('PASS: update preserves identity + advances updatedAt');
}

// ---------------------------------------------------------------------------
// R3 — duplicate produces an independent copy with a fresh id and " (copy)"
// name suffix; edits on the original never leak to the copy.
// ---------------------------------------------------------------------------

async function testDuplicateProducesIndependentCopy(): Promise<void> {
	const { service } = makeService();
	const src = await service.create({
		name: 'Editor',
		instructions: 'Rewrite dense prose.',
		toolPolicy: { allow: ['vault_search'], deny: [], approval: 'writes' },
	});
	const copy = await service.duplicate(src.id);
	assert.ok(copy);
	assert.notStrictEqual(copy!.id, src.id, 'copy has fresh id');
	assert.strictEqual(copy!.name, 'Editor (copy)');
	assert.deepStrictEqual(copy!.toolPolicy, src.toolPolicy, 'toolPolicy carried through');

	// Mutate the original — copy stays put.
	await service.update({ ...src, name: 'Editor v2' });
	const refetchedCopy = await service.get(copy!.id);
	assert.strictEqual(refetchedCopy!.name, 'Editor (copy)');

	const list = await service.list();
	assert.strictEqual(list.length, 2);
	console.log('PASS: duplicate is independent from source');
}

// ---------------------------------------------------------------------------
// R4 — archive / restore / list-filter.
// ---------------------------------------------------------------------------

async function testArchiveRestoreListFilter(): Promise<void> {
	const { service } = makeService();
	const a = await service.create({ name: 'A' });
	const b = await service.create({ name: 'B' });

	// Archive `a` — default list drops it, includeArchived list keeps it.
	await service.setArchived(a.id, true);
	const defaultList = await service.list();
	assert.deepStrictEqual(defaultList.map((x) => x.id), [b.id], 'default list hides archived');
	const fullList = await service.list(true);
	assert.strictEqual(fullList.length, 2);
	const archivedInList = fullList.find((x) => x.id === a.id);
	assert.ok(archivedInList?.archived, 'archived flag surfaces in full list');

	// Restore.
	await service.setArchived(a.id, false);
	const restored = await service.list();
	assert.strictEqual(restored.length, 2, 'restore brings the row back into default list');

	// setArchived on a missing id is a no-op, not a throw.
	await service.setArchived('nope', true);
	console.log('PASS: archive hides from default list, restore returns it, missing id no-ops');
}

// ---------------------------------------------------------------------------
// R5 — delete + get fallback: a deleted assistant returns null (Default),
// AssistantResolver guarantees the conversation still runs.
// ---------------------------------------------------------------------------

async function testDeleteAndSafeGet(): Promise<void> {
	const { service } = makeService();
	const a = await service.create({ name: 'A' });
	await service.delete(a.id);
	assert.strictEqual(await service.get(a.id), null, 'deleted id → null (safe Default fallback)');
	assert.deepStrictEqual(await service.list(), []);
	// Default id is a sentinel — get() must return null without consulting storage.
	assert.strictEqual(await service.get('default'), null);
	assert.strictEqual(await service.get(undefined), null);
	console.log('PASS: delete + get sentinel + undefined id all return null');
}

// ---------------------------------------------------------------------------
// R6 — knowledgeRefs + preferredModel round-trip through storage untouched.
// The runtime consumers (`AssistantSlot`, `resolveEffectiveModel`) read
// straight off `ChatAssistantDefinition`, so if the fields survive save+read
// they will reach the runtime — assistant-runtime.test.ts already verifies
// the consumer side.
// ---------------------------------------------------------------------------

async function testAdvancedFieldsRoundTrip(): Promise<void> {
	const { service } = makeService();
	const created = await service.create({
		name: 'Deep Reader',
		knowledgeRefs: [
			{ id: 'r1', kind: 'vault-file', uri: 'Notes/House rules.md', title: 'House rules' },
			{ id: 'r2', kind: 'url', uri: 'https://example.com/spec', title: 'Spec' },
		],
		preferredModel: { profileId: 'work-claude', modelId: 'claude-3-5-sonnet' },
		toolPolicy: { allow: ['vault_search'], deny: ['mcp_x_delete'], approval: 'always' },
	});
	const fetched = await service.get(created.id);
	assert.ok(fetched);
	assert.strictEqual(fetched!.knowledgeRefs.length, 2);
	assert.strictEqual(fetched!.knowledgeRefs[0].uri, 'Notes/House rules.md');
	assert.deepStrictEqual(fetched!.preferredModel, {
		profileId: 'work-claude',
		modelId: 'claude-3-5-sonnet',
	});
	assert.deepStrictEqual(fetched!.toolPolicy, {
		allow: ['vault_search'],
		deny: ['mcp_x_delete'],
		approval: 'always',
	});
	console.log('PASS: advanced fields (knowledgeRefs / preferredModel / toolPolicy) round-trip');
}

// ---------------------------------------------------------------------------
// R-EPH — ephemeral assistant preview: try-before-save.
//
// Contract: the Assistant Builder can bind an unsaved draft to a conversation
// so it takes effect on the next turn without writing to disk. Cleared on
// explicit exit or on Save-through-preview; a new registry instance (plugin
// reload) MUST NOT surface residual overrides.
// ---------------------------------------------------------------------------

async function testEphemeralOverridesResolver(): Promise<void> {
	const { service } = makeService();
	const persisted = await service.create({ name: 'Persisted', instructions: 'Speak in bullet points.' });
	// Bind the persisted assistant on the conversation.
	const conv = { meta: { id: 'conv-eph-1', assistantId: persisted.id } } as unknown as ChatConversation;

	const registry = new EphemeralAssistantRegistry();
	// No ephemeral yet → resolver falls back to the persisted assistant.
	assert.strictEqual(registry.get('conv-eph-1'), null);
	const baseline = await resolveAssistantForConversation(service, conv);
	assert.strictEqual(baseline?.definition.id, persisted.id, 'baseline resolves persisted');

	// Set an ephemeral draft — a caller mimicking service-conversation must
	// prefer this snapshot over the durable resolver output.
	const draft: ChatAssistantDefinition = {
		id: 'preview-x',
		name: 'Draft',
		summary: '',
		instructions: 'Answer in Chinese only.',
		knowledgeRefs: [],
		toolPolicy: { allow: [], deny: [], approval: 'writes' },
		createdAt: 0,
		updatedAt: 0,
	};
	registry.set('conv-eph-1', draft);
	assert.strictEqual(registry.get('conv-eph-1'), draft, 'ephemeral wins when present');

	// Clear the override → resolver falls back to the persisted assistant.
	registry.set('conv-eph-1', null);
	assert.strictEqual(registry.get('conv-eph-1'), null, 'clear removes ephemeral');
	const restored = await resolveAssistantForConversation(service, conv);
	assert.strictEqual(restored?.definition.id, persisted.id, 'persisted assistant restored');

	console.log('PASS: ephemeral overrides resolver, clear falls back to durable binding');
}

async function testEphemeralDoesNotSurviveReload(): Promise<void> {
	const first = new EphemeralAssistantRegistry();
	first.set('conv-eph-2', {
		id: 'preview-y',
		name: 'Draft',
		summary: '',
		instructions: '',
		knowledgeRefs: [],
		toolPolicy: { allow: [], deny: [], approval: 'writes' },
		createdAt: 0,
		updatedAt: 0,
	});
	assert.strictEqual(first.size(), 1);

	// A fresh registry (plugin reload / new ConversationService instance) must
	// not surface any residual override.
	const second = new EphemeralAssistantRegistry();
	assert.strictEqual(second.get('conv-eph-2'), null);
	assert.strictEqual(second.size(), 0);
	console.log('PASS: ephemeral registry is per-instance (reload wipes)');
}

// ---------------------------------------------------------------------------
// R7 — name defaulting: empty-input create still produces a usable row.
// ---------------------------------------------------------------------------

async function testCreateHandlesEmptyName(): Promise<void> {
	const { service } = makeService();
	const created = await service.create({ name: '   ' });
	assert.strictEqual(created.name, 'Assistant', 'empty/whitespace name falls back to "Assistant"');
	console.log('PASS: create handles empty/whitespace name');
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const tests: Array<[string, () => Promise<void>]> = [
		['create + list + get', testCreateAndList],
		['update preserves identity', testUpdatePreservesIdentity],
		['duplicate is independent', testDuplicateProducesIndependentCopy],
		['archive / restore / list filter', testArchiveRestoreListFilter],
		['delete + safe fallback get', testDeleteAndSafeGet],
		['advanced fields round-trip', testAdvancedFieldsRoundTrip],
		['ephemeral overrides resolver', testEphemeralOverridesResolver],
		['ephemeral does not survive reload', testEphemeralDoesNotSurviveReload],
		['create defaults blank name', testCreateHandlesEmptyName],
	];
	for (const [name, fn] of tests) {
		try {
			await fn();
		} catch (err) {
			console.error(`FAIL: ${name}`);
			throw err;
		}
	}
	console.log(`\nassistant-builder-lifecycle: all ${tests.length} guards passed`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
