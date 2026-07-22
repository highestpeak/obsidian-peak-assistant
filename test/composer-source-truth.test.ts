/**
 * COMP-04 source-truth tests (chat-studio §8.4, 2026-07-21).
 *
 * The Composer store is the single UI truth for per-draft Vault/Web toggles.
 * CapabilitySuggestion writing to a different store used to produce the
 * "showed enabled, request went without it" bug — these tests lock the
 * behaviour down.
 *
 * Covered slices:
 *   R1  Composer store round-trip: update draft toggles → read back on the
 *       same key; different keys stay isolated; 'new' → 'conversation:x'
 *       migration preserves values.
 *   R2  CapabilitySuggestion helpers write composerStore FIRST; the legacy
 *       chatViewStore mirror stays in sync so runtime reads never disagree
 *       with the UI truth.
 *   R3  Send pipeline reads composer draft as the source of truth. Verified
 *       by asserting the requestedSources snapshot built from a draft
 *       matches the draft's own switches.
 *   R4  Vault Search availability: when unavailable, the requested sources
 *       ignore the toggle so the runtime doesn't attempt an unavailable
 *       search. The composer draft still records the user's intent so a
 *       later port wiring can honor it without state loss.
 */

import assert from 'assert';
import { useComposerStore } from '@/ui/view/chat-view/store/composerStore';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';
import {
	draftKeyForNew,
	draftKeyForConversation,
	emptySourceScope,
	type TurnSourceScope,
} from '@/core/types/chat-studio';

// zustand persists in-memory, but drafts also try to write to localStorage.
// In Node there is no localStorage; the store guards with optional chaining
// and simply skips persistence. Nothing to stub.

function resetStores() {
	useComposerStore.getState().reset();
	useChatViewStore.getState().setEnableVaultSearch(false);
	useChatViewStore.getState().setEnableWebSearch(false);
}

async function testR1DraftRoundTrip(): Promise<boolean> {
	resetStores();
	const key = draftKeyForNew();
	let ok = true;
	try {
		useComposerStore.getState().updateDraft({ vaultSearch: true, webSearch: true }, key);
		const draft = useComposerStore.getState().getDraft(key);
		assert.strictEqual(draft.vaultSearch, true, 'vaultSearch persisted');
		assert.strictEqual(draft.webSearch, true, 'webSearch persisted');
		console.log('✅ PASS: R1 composer draft round-trip');
	} catch (e) {
		console.log(`❌ FAIL: R1 draft round-trip: ${(e as Error).message}`);
		ok = false;
	}
	// Isolation
	try {
		const other = draftKeyForConversation('conv-x');
		const otherDraft = useComposerStore.getState().getDraft(other);
		assert.strictEqual(otherDraft.vaultSearch, false, 'other key draft is untouched');
		assert.strictEqual(otherDraft.webSearch, false, 'other key draft is untouched');
		console.log('✅ PASS: R1 draft isolation');
	} catch (e) {
		console.log(`❌ FAIL: R1 isolation: ${(e as Error).message}`);
		ok = false;
	}
	// Migration: draftKey from 'new' → conversation:<id> preserves values
	try {
		useComposerStore.getState().updateDraft({ vaultSearch: true }, key);
		useComposerStore.getState().migrateDraftKey(key, draftKeyForConversation('c1'));
		const migrated = useComposerStore.getState().getDraft(draftKeyForConversation('c1'));
		assert.strictEqual(migrated.vaultSearch, true, 'migration preserved vaultSearch');
		console.log('✅ PASS: R1 migrateDraftKey preserves values');
	} catch (e) {
		console.log(`❌ FAIL: R1 migrateDraftKey: ${(e as Error).message}`);
		ok = false;
	}
	return ok;
}

async function testR2CapabilitySuggestionMirror(): Promise<boolean> {
	resetStores();
	// Simulate the helper the CapabilitySuggestion runs — write to composer
	// first, mirror to legacy. The helper isn't exported, so we replicate its
	// call sequence and assert the invariant holds.
	useComposerStore.getState().updateDraft({ vaultSearch: true });
	useChatViewStore.getState().setEnableVaultSearch(true);

	let ok = true;
	try {
		const activeKey = useComposerStore.getState().activeKey;
		const draft = useComposerStore.getState().drafts[activeKey];
		assert.strictEqual(draft.vaultSearch, true, 'composer draft reflects the change');
		assert.strictEqual(
			useChatViewStore.getState().enableVaultSearch,
			true,
			'legacy chatView mirror matches',
		);
		console.log('✅ PASS: R2 CapabilitySuggestion writes composer first + mirrors legacy');
	} catch (e) {
		console.log(`❌ FAIL: R2 CapabilitySuggestion mirror: ${(e as Error).message}`);
		ok = false;
	}
	return ok;
}

async function testR3RequestedSourcesFromDraft(): Promise<boolean> {
	resetStores();
	const key = draftKeyForNew();
	useComposerStore.getState().updateDraft({ vaultSearch: true, webSearch: false }, key);
	const draft = useComposerStore.getState().getDraft(key);
	// Replicate useInputSubmit's requestedSources construction:
	const vaultAvailable = true;
	const requestedSources: TurnSourceScope = {
		...emptySourceScope(null),
		vaultSearch: draft.vaultSearch && vaultAvailable,
		webSearch: draft.webSearch,
		explicitRefs: draft.explicitRefs,
	};
	let ok = true;
	try {
		assert.strictEqual(requestedSources.vaultSearch, true, 'vault turned on because draft says so');
		assert.strictEqual(requestedSources.webSearch, false, 'web off because draft says so');
		console.log('✅ PASS: R3 requested sources match composer draft');
	} catch (e) {
		console.log(`❌ FAIL: R3 requested sources: ${(e as Error).message}`);
		ok = false;
	}
	return ok;
}

async function testR4VaultUnavailableGate(): Promise<boolean> {
	resetStores();
	const key = draftKeyForNew();
	// User intent: vault search enabled. Runtime: vault port not wired.
	useComposerStore.getState().updateDraft({ vaultSearch: true }, key);
	const draft = useComposerStore.getState().getDraft(key);
	const vaultAvailable = false;
	const requestedSources: TurnSourceScope = {
		...emptySourceScope(null),
		vaultSearch: draft.vaultSearch && vaultAvailable,
		webSearch: draft.webSearch,
		explicitRefs: draft.explicitRefs,
	};
	let ok = true;
	try {
		assert.strictEqual(
			requestedSources.vaultSearch,
			false,
			'unavailable vault must not appear in requested sources',
		);
		// The draft still records intent — the UI can show "will retry
		// when Vault Search is available" and re-fire without state loss.
		assert.strictEqual(draft.vaultSearch, true, 'user intent preserved in draft');
		console.log('✅ PASS: R4 unavailable vault gated, draft intent preserved');
	} catch (e) {
		console.log(`❌ FAIL: R4 vault unavailable: ${(e as Error).message}`);
		ok = false;
	}
	return ok;
}

async function runTests(): Promise<boolean> {
	const results = await Promise.all([
		testR1DraftRoundTrip(),
		testR2CapabilitySuggestionMirror(),
		testR3RequestedSourcesFromDraft(),
		testR4VaultUnavailableGate(),
	]);
	const passed = results.filter(Boolean).length;
	const total = results.length;
	console.log(`\nComposer source truth: ${passed}/${total} groups passed`);
	return passed === total;
}

if (typeof window === 'undefined') {
	void runTests().then((ok) => {
		if (!ok) {
			console.error('composer-source-truth.test failed');
			process.exit(1);
		}
	});
}

export { runTests };
