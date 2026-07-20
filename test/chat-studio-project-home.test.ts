// Chat Studio Track E — project home pure-logic guards.
// Spec: docs/superpowers/specs/2026-07-15-chat-studio-complete-implementation-spec.md §9, §9.1, §17.4
// Run with: npm run test -- test/chat-studio-project-home.test.ts

import assert from 'assert';
import {
	descriptionReducer,
	initialDescriptionState,
	isDescriptionBusy,
	isDescriptionDirty,
} from '@/ui/view/chat-view/components/project-home/descriptionState';
import {
	sortPlans,
	nextStatus,
	statusLabel,
} from '@/ui/view/chat-view/components/project-home/planHelpers';
import { mergeResourceRows } from '@/ui/view/chat-view/hooks/useProjectLoad';
import { PROJECT_PLAN_STATUSES, type ProjectPlanRef, type ChatArtifactReceipt } from '@/core/types/chat-studio';

// ---------------------------------------------------------------------------
// Description state machine (PROJ-02 / RUN-05) — AI never auto-saves
// ---------------------------------------------------------------------------

function testDescriptionStateInitial(): void {
	assert.deepStrictEqual(initialDescriptionState(undefined), { status: 'view', draft: '', saved: '' });
	assert.deepStrictEqual(initialDescriptionState('hello'), { status: 'view', draft: 'hello', saved: 'hello' });
	console.log('PASS: descriptionStateInitial');
}

function testDescriptionEditingFlow(): void {
	let s = initialDescriptionState('base');
	s = descriptionReducer(s, { type: 'start-edit' });
	assert.strictEqual(s.status, 'editing');
	assert.strictEqual(s.draft, 'base');
	assert.strictEqual(isDescriptionDirty(s), false);

	s = descriptionReducer(s, { type: 'change', value: 'base v2' });
	assert.strictEqual(s.draft, 'base v2');
	assert.strictEqual(isDescriptionDirty(s), true);

	// Cancel restores saved value, exits editing.
	const cancelled = descriptionReducer(s, { type: 'cancel' });
	assert.strictEqual(cancelled.status, 'view');
	assert.strictEqual(cancelled.draft, 'base');
	assert.strictEqual(cancelled.saved, 'base');
	console.log('PASS: descriptionEditingFlow');
}

function testDescriptionAiDraftDoesNotAutoSave(): void {
	let s = initialDescriptionState('old');
	s = descriptionReducer(s, { type: 'start-edit' });
	s = descriptionReducer(s, { type: 'ai-start' });
	assert.strictEqual(s.status, 'generating');
	assert.ok(isDescriptionBusy(s));

	s = descriptionReducer(s, { type: 'ai-done', value: 'AI draft' });
	// AI result replaces draft but NEVER saved — RUN-05.
	assert.strictEqual(s.status, 'editing');
	assert.strictEqual(s.draft, 'AI draft');
	assert.strictEqual(s.saved, 'old', 'saved must not change from AI');

	// User can still cancel and lose the AI draft entirely.
	const cancelled = descriptionReducer(s, { type: 'cancel' });
	assert.strictEqual(cancelled.saved, 'old');
	assert.strictEqual(cancelled.draft, 'old');
	console.log('PASS: descriptionAiDraftDoesNotAutoSave');
}

function testDescriptionSaveTransitions(): void {
	let s = initialDescriptionState('old');
	s = descriptionReducer(s, { type: 'start-edit' });
	s = descriptionReducer(s, { type: 'change', value: 'new' });
	s = descriptionReducer(s, { type: 'save-start' });
	assert.strictEqual(s.status, 'saving');

	s = descriptionReducer(s, { type: 'save-done', value: 'new' });
	assert.strictEqual(s.status, 'view');
	assert.strictEqual(s.saved, 'new');
	assert.strictEqual(s.draft, 'new');
	assert.strictEqual(isDescriptionDirty(s), false);
	console.log('PASS: descriptionSaveTransitions');
}

function testDescriptionErrorRecovery(): void {
	let s = initialDescriptionState('a');
	s = descriptionReducer(s, { type: 'start-edit' });
	s = descriptionReducer(s, { type: 'change', value: 'b' });
	s = descriptionReducer(s, { type: 'save-start' });
	s = descriptionReducer(s, { type: 'save-error', message: 'disk full' });
	assert.strictEqual(s.status, 'error');
	assert.strictEqual(s.errorMessage, 'disk full');
	// Retry: return to editing on next start-edit or by re-issuing save-start.
	const retry = descriptionReducer(s, { type: 'save-start' });
	assert.strictEqual(retry.status, 'saving');
	console.log('PASS: descriptionErrorRecovery');
}

function testDescriptionExternalSavedChangeRespectsEditing(): void {
	let s = initialDescriptionState('x');
	s = descriptionReducer(s, { type: 'start-edit' });
	s = descriptionReducer(s, { type: 'change', value: 'my edit' });
	// External change while editing: saved updates but draft stays.
	s = descriptionReducer(s, { type: 'saved-changed', value: 'x2' });
	assert.strictEqual(s.saved, 'x2');
	assert.strictEqual(s.draft, 'my edit');
	assert.strictEqual(s.status, 'editing');
	// If we cancel now, draft goes to the new saved value (that's fine).
	const cancelled = descriptionReducer(s, { type: 'cancel' });
	assert.strictEqual(cancelled.saved, 'x2');
	assert.strictEqual(cancelled.draft, 'x2');
	console.log('PASS: descriptionExternalSavedChangeRespectsEditing');
}

// ---------------------------------------------------------------------------
// Plan helpers (PROJ-04)
// ---------------------------------------------------------------------------

function mkPlan(over: Partial<ProjectPlanRef>): ProjectPlanRef {
	return {
		id: 'p',
		projectId: 'proj',
		title: 't',
		status: 'planned',
		source: { kind: 'conversation', conversationId: 'c1' },
		updatedAt: 0,
		...over,
	};
}

function testSortPlansBucketsThenRecency(): void {
	const plans: ProjectPlanRef[] = [
		mkPlan({ id: 'a', status: 'done', updatedAt: 100 }),
		mkPlan({ id: 'b', status: 'active', updatedAt: 10 }),
		mkPlan({ id: 'c', status: 'planned', updatedAt: 50 }),
		mkPlan({ id: 'd', status: 'archived', updatedAt: 200 }),
		mkPlan({ id: 'e', status: 'blocked', updatedAt: 30 }),
		mkPlan({ id: 'f', status: 'active', updatedAt: 20 }),
	];
	const sorted = sortPlans(plans).map(p => p.id);
	// active > planned > blocked > done > archived; within bucket newest first
	assert.deepStrictEqual(sorted, ['f', 'b', 'c', 'e', 'a', 'd']);
	console.log('PASS: sortPlansBucketsThenRecency');
}

function testNextStatusValidation(): void {
	assert.strictEqual(nextStatus('planned', 'active'), 'active');
	assert.strictEqual(nextStatus('planned', 'bogus'), 'planned');
	for (const s of PROJECT_PLAN_STATUSES) {
		assert.strictEqual(nextStatus('planned', s), s);
	}
	console.log('PASS: nextStatusValidation');
}

function testStatusLabelExhaustive(): void {
	const strings = {
		planStatusPlanned: 'P', planStatusActive: 'A',
		planStatusBlocked: 'B', planStatusDone: 'D', planStatusArchived: 'X',
	};
	assert.strictEqual(statusLabel('planned', strings), 'P');
	assert.strictEqual(statusLabel('active', strings), 'A');
	assert.strictEqual(statusLabel('blocked', strings), 'B');
	assert.strictEqual(statusLabel('done', strings), 'D');
	assert.strictEqual(statusLabel('archived', strings), 'X');
	console.log('PASS: statusLabelExhaustive');
}

// ---------------------------------------------------------------------------
// Resources projection — merge attachments + artifact receipts
// ---------------------------------------------------------------------------

function testMergeResourceRows(): void {
	const attachments = [
		{
			conversation: { meta: { id: 'c1', title: 'Chat A' } } as any,
			message: { id: 'm1', createdAtTimestamp: 100 } as any,
			resource: 'note.md',
			resourceLabel: 'note.md',
		},
	];
	const artifacts: ChatArtifactReceipt[] = [
		{
			artifactId: 'art-1', runId: 'r', messageId: 'm2', conversationId: 'c1',
			direction: 'generated', kind: 'document', title: 'Report.md',
			state: 'ready', availableActions: ['open'], createdAt: 200,
			vaultPath: 'Reports/Report.md',
		},
	];
	const rows = mergeResourceRows(attachments as any, artifacts);
	assert.strictEqual(rows.length, 2);
	// Sorted newest first — artifact (200) before attachment (100).
	assert.strictEqual(rows[0].kind, 'artifact');
	assert.strictEqual(rows[0].openTarget, 'Reports/Report.md');
	assert.strictEqual(rows[1].kind, 'attachment');
	console.log('PASS: mergeResourceRows');
}

// ---------------------------------------------------------------------------

function runAll(): void {
	testDescriptionStateInitial();
	testDescriptionEditingFlow();
	testDescriptionAiDraftDoesNotAutoSave();
	testDescriptionSaveTransitions();
	testDescriptionErrorRecovery();
	testDescriptionExternalSavedChangeRespectsEditing();
	testSortPlansBucketsThenRecency();
	testNextStatusValidation();
	testStatusLabelExhaustive();
	testMergeResourceRows();
	console.log('ALL PASS');
}

runAll();
