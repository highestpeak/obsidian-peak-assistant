/**
 * Track B guards (chat-unified-mode 2026-07-05): the single-Chat execution
 * strategy contract. `service-conversation.streamChat` reads the strategy
 * once per turn — the picker is gone, so a fresh conversation must not
 * require any UI mode selection to get sensible tool routing.
 *
 * Contract we lock down:
 *   1. Default fresh conversation → strategy is "default", no plan prompt,
 *      buildChatTools decides whether to attach tools (web toggle here).
 *   2. `/plan ` slash-prefix (planIntent=true) → strategy is "plan",
 *      tools disabled, plan system prompt requested.
 *   3. Restored old conversation with `conversationType.kind === 'plan'` →
 *      same as (2) so legacy plan threads keep planning UX after reload.
 *   4. Restored old conversation with `conversationType.kind === 'agent'` →
 *      still default: the legacy "Agent mode" no longer gates tool access.
 *   5. Model with `webSearch: true` capability → buildChatTools skips its
 *      own web_search tool (native web search wins). Sanity that the
 *      strategy is a thin pass-through over buildChatTools.
 *   6. `service-conversation.ts` must go through `resolveChatExecutionStrategy`
 *      and no longer read `chatMode` from the runtime port.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { resolveChatExecutionStrategy } from '../src/service/chat/execution-strategy';
import type { ModelCapabilities } from '../src/core/providers/types';

const CAPS_NO_NATIVE: ModelCapabilities = {
	vision: false,
	pdfInput: false,
	tools: true,
	webSearch: false,
};
const CAPS_NATIVE_WEB: ModelCapabilities = {
	vision: false,
	pdfInput: false,
	tools: true,
	webSearch: true,
};

const APP_STUB = {} as unknown as never;

// Test 1: default (no plan intent, no legacy plan, web toggle off) → no tools, no plan prompt
{
	const strategy = resolveChatExecutionStrategy({
		planIntent: false,
		legacyConversationTypeKind: null,
		toolDeps: { app: APP_STUB, pluginId: 'peak', enableWebSearch: false },
		modelCapabilities: CAPS_NO_NATIVE,
	});
	assert.strictEqual(strategy.mode, 'default');
	assert.strictEqual(strategy.usePlanSystemPrompt, false);
	assert.strictEqual(strategy.tools.length, 0, 'no web toggle → no tools attached');
	assert.strictEqual(strategy.maxSteps, 1, 'no tools → single-step turn');
	console.log('PASS: default fresh conversation → default strategy, no tools, no plan prompt');
}

// Test 2: `/plan ` intent → plan strategy, tools cleared, plan prompt requested
{
	const strategy = resolveChatExecutionStrategy({
		planIntent: true,
		legacyConversationTypeKind: 'agent',
		toolDeps: { app: APP_STUB, pluginId: 'peak', enableWebSearch: true }, // web on
		modelCapabilities: CAPS_NO_NATIVE,
	});
	assert.strictEqual(strategy.mode, 'plan');
	assert.strictEqual(strategy.usePlanSystemPrompt, true, 'plan intent must prepend planning system prompt');
	assert.strictEqual(strategy.tools.length, 0, 'plan intent must disable tools even when web toggle is on');
	assert.strictEqual(strategy.maxSteps, 1);
	console.log('PASS: /plan intent → plan strategy overrides legacy kind and web toggle');
}

// Test 3: legacy conversationType.kind === 'plan' → plan strategy (restore compat)
{
	const strategy = resolveChatExecutionStrategy({
		planIntent: false,
		legacyConversationTypeKind: 'plan',
		toolDeps: { app: APP_STUB, pluginId: 'peak', enableWebSearch: true },
		modelCapabilities: CAPS_NO_NATIVE,
	});
	assert.strictEqual(strategy.mode, 'plan');
	assert.strictEqual(strategy.usePlanSystemPrompt, true);
	assert.strictEqual(strategy.tools.length, 0);
	console.log('PASS: restored legacy plan conversation → plan strategy honored');
}

// Test 4: legacy conversationType.kind === 'agent' does NOT force tools
{
	const strategy = resolveChatExecutionStrategy({
		planIntent: false,
		legacyConversationTypeKind: 'agent',
		toolDeps: { app: APP_STUB, pluginId: 'peak', enableWebSearch: false },
		modelCapabilities: CAPS_NO_NATIVE,
	});
	assert.strictEqual(strategy.mode, 'default', 'legacy agent kind must not switch mode');
	assert.strictEqual(strategy.usePlanSystemPrompt, false);
	// With webSearch toggle off, no tool is attached — legacy Agent no longer
	// gates tool routing. Users must enable tools via the toggle, not a mode.
	assert.strictEqual(strategy.tools.length, 0, 'legacy agent kind must not add tools when toggle off');
	console.log('PASS: legacy agent kind does not force tool injection');
}

// Test 5: with `enableWebSearch=true` but no active Web Search profile,
// nothing is injected — irrespective of catalog `webSearch` flag (B1 §5.2 R2).
{
	const strategy = resolveChatExecutionStrategy({
		planIntent: false,
		legacyConversationTypeKind: null,
		toolDeps: { app: APP_STUB, pluginId: 'peak', enableWebSearch: true },
		modelCapabilities: CAPS_NATIVE_WEB,
	});
	assert.strictEqual(strategy.mode, 'default');
	// No ProfileRegistry seeded → no active Web Search profile → no fallback.
	// (Catalog `webSearch:true` is no longer used as a suppression signal.)
	assert.strictEqual(strategy.tools.length, 0, 'missing Web Search profile → no tool injected');
	console.log('PASS: absent Web Search profile → no fallback (B1 rule)');
}

// Test 6: service-conversation.ts wire-in guard
{
	const src = fs.readFileSync(path.resolve(process.cwd(), 'src/service/chat/service-conversation.ts'), 'utf8');
	assert.ok(
		src.includes('resolveChatExecutionStrategy'),
		'service-conversation.ts must delegate to resolveChatExecutionStrategy',
	);
	assert.ok(
		!/self\.chatState\.getChatMode\(\)/.test(src),
		'service-conversation.ts must not read runtime chatMode any more (chat-unified-mode)',
	);
	assert.ok(
		!src.includes("effectiveMode === 'agent'"),
		'service-conversation.ts must not branch on legacy Agent mode any more',
	);
	console.log('PASS: service-conversation.ts wired through strategy helper');
}

console.log('\nAll chat-execution-strategy tests passed!');
