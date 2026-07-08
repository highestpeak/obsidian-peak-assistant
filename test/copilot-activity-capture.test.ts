/**
 * Track A guards (chat-unified-mode 2026-07-05): Copilot manual action
 * completion feeds Recent Activity via CopilotActionCompletedEvent →
 * SessionContextService.EVENT_TO_OP mapping.
 *
 * We test at the surface that stays stable:
 *   1. The event class shape produces a legible summary.
 *   2. SessionContextService's source file registers COPILOT_ACTION_COMPLETED
 *      → 'copilot_action' — the mapping is what makes the event feed the
 *      activity index at all.
 *   3. CopilotAutoRunContent dispatches the event exactly once when a
 *      review reaches a terminal status (grep-level guard so this test does
 *      not need React + Obsidian).
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
	CopilotActionCompletedEvent,
	ViewEventType,
} from '../src/core/eventBus';

const ROOT = process.cwd();
const CTX_SVC_PATH = path.resolve(ROOT, 'src/service/context/SessionContextService.ts');
const AUTO_RUN_PATH = path.resolve(ROOT, 'src/ui/view/copilot/CopilotAutoRunContent.tsx');

// 1. Event ships useful metadata + a self-generated fallback summary
{
	const explicit = new CopilotActionCompletedEvent({
		actionId: 'copilot-review:document:review',
		actionLabel: 'Document Review · Review',
		outcome: 'completed',
		summary: 'Document Review · Review on notes/a.md — 3 insights, 1 change block',
		path: 'notes/a.md',
	});
	assert.strictEqual(explicit.type, ViewEventType.COPILOT_ACTION_COMPLETED);
	assert.strictEqual(explicit.outcome, 'completed');
	assert.strictEqual(explicit.actionId, 'copilot-review:document:review');
	assert.ok(explicit.summary.includes('notes/a.md'));

	const fallback = new CopilotActionCompletedEvent({
		actionId: 'copilot-review:vault:review',
		actionLabel: 'Vault Review · Review',
		outcome: 'cancelled',
	});
	// Cancelled outcome should surface in fallback summary so the model can
	// tell finished-successfully from cancelled-early.
	assert.ok(fallback.summary.includes('cancelled'), `fallback summary should include outcome, got "${fallback.summary}"`);
	console.log('PASS: CopilotActionCompletedEvent shape + fallback summary');
}

// 2. SessionContextService registers the new event → 'copilot_action'
{
	const src = fs.readFileSync(CTX_SVC_PATH, 'utf8');
	assert.ok(
		src.includes('COPILOT_ACTION_COMPLETED]'),
		'SessionContextService.EVENT_TO_OP must include ViewEventType.COPILOT_ACTION_COMPLETED',
	);
	// Match the mapping line specifically so a rename of copilot_action string
	// would break this guard.
	const mapLine = src.split('\n').find((line) => line.includes('COPILOT_ACTION_COMPLETED]:'));
	assert.ok(
		mapLine && /'copilot_action'/.test(mapLine),
		`Mapping must resolve to 'copilot_action', found: ${mapLine ?? '<missing>'}`,
	);
	console.log('PASS: EVENT_TO_OP maps COPILOT_ACTION_COMPLETED → copilot_action');
}

// 3. CopilotAutoRunContent dispatches the event exactly once at terminal status
{
	const src = fs.readFileSync(AUTO_RUN_PATH, 'utf8');
	assert.ok(
		src.includes('CopilotActionCompletedEvent'),
		'CopilotAutoRunContent must import CopilotActionCompletedEvent',
	);
	assert.ok(
		/activityDispatchedRef/.test(src),
		'CopilotAutoRunContent must guard against dispatching more than once per session',
	);
	assert.ok(
		/eventBus\.dispatch\(new CopilotActionCompletedEvent/.test(src),
		'CopilotAutoRunContent must dispatch through eventBus, not a UI-local channel',
	);
	console.log('PASS: CopilotAutoRunContent wires dispatch through eventBus with de-dup guard');
}

console.log('\nAll copilot-activity-capture tests passed!');
