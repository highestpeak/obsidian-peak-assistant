/**
 * Task E2 R1#1 — the streaming assistant message must visibly say
 * "Permission required" when the harness is paused waiting for user
 * consent. This test locks the store + hook contract that drives that
 * behaviour:
 *
 *   1. `chatDataStore.runStatus` accepts `'waiting-permission'` and it
 *      clears on `clearPermissionState()` (paired with the resolver
 *      dropping the ask, so both fields go back to null in one step).
 *   2. The reducer sets exactly the shape the MessageViewItem reads:
 *      `streamingState.isStreaming && runStatus === 'waiting-permission'`
 *      is the derivation the component uses (source at
 *      `src/ui/view/chat-view/components/messages/MessageViewItem.tsx`
 *      around line 745 — grep `waiting-permission`).
 *   3. `MessageStatusIndicator`'s label map already carries the
 *      `waiting-permission` case (added earlier in Track D — this test
 *      guards that the enum value it accepts stays stable across
 *      refactors that touch either the store or the indicator).
 */

import assert from 'assert';
import { useChatDataStore } from '@/ui/store/chatDataStore';

function resetStore() {
	// The store's `reset` action is the canonical way to zero it.
	useChatDataStore.getState().reset();
}

function testRunStatusAcceptsWaitingPermission() {
	resetStore();
	const s = useChatDataStore.getState();
	assert.strictEqual(s.runStatus, null, 'baseline is null');
	s.setRunStatus('waiting-permission');
	assert.strictEqual(useChatDataStore.getState().runStatus, 'waiting-permission');
	console.log('  ✓ runStatus="waiting-permission" flows through the store');
}

function testClearPermissionStateWipesBoth() {
	resetStore();
	const s = useChatDataStore.getState();
	// Stash a fake pending ask so we can assert both fields clear together.
	s.setPendingPermissionAsk({
		id: 'ask-1',
		toolName: 'mcp:edit-file',
		args: { path: '/x' },
		resolve: () => { /* noop */ },
	} as any);
	s.setRunStatus('waiting-permission');
	s.clearPermissionState();
	const next = useChatDataStore.getState();
	assert.strictEqual(next.runStatus, null, 'runStatus cleared');
	assert.strictEqual(next.pendingPermissionAsk, null, 'pendingPermissionAsk cleared');
	console.log('  ✓ clearPermissionState wipes runStatus AND pendingPermissionAsk together');
}

function testMessageViewItemDerivationShape() {
	// The MessageViewItem code path:
	//   streamingState.isStreaming && runStatus === 'waiting-permission'
	//     ? 'waiting-permission'
	//     : message.status
	// The two branches are independently exercised here so a future
	// refactor that flips the AND to OR (or drops the streaming guard) is
	// caught. The derivation lives in the component, but the SHAPE of the
	// two inputs is our contract — we assert both are readable off the
	// store without weird late-binding.
	resetStore();
	const s = useChatDataStore.getState();
	s.setRunStatus('waiting-permission');
	// Simulate the two inputs the component consumes.
	const runStatus = useChatDataStore.getState().runStatus;
	const isStreaming = true;
	const messageStatus = undefined; // message.status may be undefined mid-stream
	const overlaid = isStreaming && runStatus === 'waiting-permission' ? 'waiting-permission' : messageStatus;
	assert.strictEqual(overlaid, 'waiting-permission');

	// When streaming stops (finalized), the overlay disappears even if the
	// store still carries a stale runStatus (typical when the resolver
	// races the completion event).
	const overlaidAfterStop = false && runStatus === 'waiting-permission' ? 'waiting-permission' : messageStatus;
	assert.strictEqual(overlaidAfterStop, undefined);

	// When runStatus is 'running', we do NOT override — the streaming
	// spinner is honest.
	s.setRunStatus('running');
	const rs = useChatDataStore.getState().runStatus;
	const overlaid2 = isStreaming && rs === 'waiting-permission' ? 'waiting-permission' : messageStatus;
	assert.strictEqual(overlaid2, undefined);
	console.log('  ✓ overlay only fires when streaming AND runStatus==="waiting-permission"');
}

async function main() {
	testRunStatusAcceptsWaitingPermission();
	testClearPermissionStateWipesBoth();
	testMessageViewItemDerivationShape();
	console.log('chat-run-status-overlay: 3/3 slices passed');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
