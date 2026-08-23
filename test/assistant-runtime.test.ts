/**
 * Task B2 — Assistant runtime tests (plan §5.3).
 *
 * Covered slices:
 *   R1  Resolver: valid id → definition; missing binding → null; deleted id
 *       and storage failure throw without substituting Default.
 *   R2  AssistantSlot: renders a system message from instructions when a
 *       ResolvedAssistant is on SlotBuildContext; renders nothing without one
 *       and nothing when instructions are empty. Compression drops the
 *       framing header but keeps the instructions text.
 *   R3  knowledgeRefs → attachments merge: vault-file kind is added if the
 *       file exists in the vault; missing files are skipped; url kind passes
 *       through; folder/upload/reply kinds are dropped; SourceReceipt records
 *       every ref that made it into the attachment pipe.
 *   R4  toolPolicy: deny filter removes ToolDefs; allow rules bypass the ask
 *       path silently in the harness; deny wins over allow when both
 *       reference the same tool (defense in depth, PermissionGuard §3.7);
 *       untouched tools keep the ask default.
 *   R5  Model precedence: conversation.fixed > assistant.preferred > Auto;
 *       assistant.preferred whose profile is missing/disabled falls back to
 *       Auto and marks the drop; effective model surfaces on the receipt.
 *   R6  Builder safety: AI draft output can only set name/summary/instructions
 *       (and approval via UI select) — the draft schema does NOT expose
 *       toolPolicy.allow/deny, so a malicious draft cannot widen tool
 *       permissions.
 */

import assert from 'assert';
import { z } from 'zod';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import type { LanguageModel } from 'ai';

import {
	buildAssistantPermissionRules,
	filterToolsByAssistantPolicy,
	resolveAssistantForConversation,
	resolveAssistantPermissionMode,
	resolveEffectiveModel,
} from '@/service/chat/assistant/assistantResolver';
import { AssistantSlot } from '@/service/chat/context/slots/AssistantSlot';
import { PermissionGuard } from '@/service/agents/harness/permission/PermissionGuard';
import { harnessStreamChatWithModel } from '@/service/chat/harnessChatRunner';
import { SourceReceiptCollector } from '@/service/chat/tools/sourceReceiptCollector';
import { ok } from '@/service/agents/harness/tool/types';
import type { ToolDef } from '@/service/agents/harness/tool/types';
import { mergeAssistantKnowledgeRefsForTest } from '@/service/chat/assistant/assistantResolverTestSurface';

import type {
	AssistantToolPolicy,
	ChatAssistantDefinition,
	ExplicitContextRef,
} from '@/core/types/chat-studio';
import { defaultToolPolicy } from '@/core/types/chat-studio';
import type { ChatConversation } from '@/service/chat/types';
import type { Profile } from '@/core/profiles/types';
import type { LLMRequestMessage, LLMStreamEvent } from '@/core/providers/types';

// ─── Test infra ────────────────────────────────────────────────────────────────

function makeConversation(overrides: Partial<ChatConversation['meta']> = {}): ChatConversation {
	return {
		meta: {
			id: 'c1',
			title: 't',
			createdAtTimestamp: 0,
			updatedAtTimestamp: 0,
			activeModel: '',
			activeProvider: '',
			...overrides,
		},
		messages: [],
	} as unknown as ChatConversation;
}

function makeAssistant(overrides: Partial<ChatAssistantDefinition> = {}): ChatAssistantDefinition {
	return {
		id: 'asst-1',
		name: 'Persona A',
		summary: '',
		instructions: 'Speak concisely.',
		knowledgeRefs: [],
		toolPolicy: defaultToolPolicy(),
		createdAt: 0,
		updatedAt: 0,
		...overrides,
	};
}

function stubAssistantService(map: Record<string, ChatAssistantDefinition | Error | null>) {
	return {
		get: async (id?: string) => {
			if (!id) return null;
			const v = map[id];
			if (v instanceof Error) throw v;
			return v ?? null;
		},
	} as any;
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
	return {
		id: 'p1',
		name: 'p1',
		kind: 'openai',
		enabled: true,
		createdAt: 0,
		baseUrl: 'https://example.com',
		apiKey: null,
		primaryModel: 'm-primary',
		fastModel: 'm-fast',
		customHeaders: {},
		embeddingEndpoint: null,
		embeddingApiKey: null,
		embeddingModel: null,
		icon: null,
		description: null,
		...overrides,
	};
}

interface FakeRegistryOpts {
	profiles?: Profile[];
	activeChat?: { profile: Profile; modelId: string } | null;
}
function fakeProfileRegistry(opts: FakeRegistryOpts = {}) {
	const profiles = opts.profiles ?? [];
	return {
		getProfileById: (id: string) => profiles.find((p) => p.id === id) ?? null,
		getActiveChatConfig: () => opts.activeChat ?? null,
		getAllProfiles: () => [...profiles],
	} as any;
}

// ─── R1 resolver ──────────────────────────────────────────────────────────────

async function testResolverValidId(): Promise<void> {
	const assistant = makeAssistant();
	const svc = stubAssistantService({ [assistant.id]: assistant });
	const conv = makeConversation({ assistantId: assistant.id });
	const resolved = await resolveAssistantForConversation(svc, conv);
	assert.ok(resolved, 'valid id must resolve');
	assert.strictEqual(resolved!.definition.id, assistant.id);
	assert.deepStrictEqual(resolved!.toolPolicy, assistant.toolPolicy);
	console.log('PASS: resolver — valid id');
}

async function testResolverMissingId(): Promise<void> {
	const svc = stubAssistantService({});
	const conv = makeConversation({ assistantId: undefined });
	const resolved = await resolveAssistantForConversation(svc, conv);
	assert.strictEqual(resolved, null, 'no assistantId → null');
	console.log('PASS: resolver — missing id');
}

async function testResolverDeletedId(): Promise<void> {
	const svc = stubAssistantService({ 'gone': null });
	const conv = makeConversation({ assistantId: 'gone' });
	await assert.rejects(() => resolveAssistantForConversation(svc, conv), /assistant fallback is disabled/i);
	console.log('PASS: resolver — deleted id fails loudly');
}

async function testResolverStorageFailure(): Promise<void> {
	const svc = stubAssistantService({ 'boom': new Error('storage offline') });
	const conv = makeConversation({ assistantId: 'boom' });
	await assert.rejects(() => resolveAssistantForConversation(svc, conv), /storage offline/);
	console.log('PASS: resolver — storage failure propagates');
}

// ─── R2 AssistantSlot ─────────────────────────────────────────────────────────

async function testAssistantSlotRenders(): Promise<void> {
	const slot = new AssistantSlot();
	const assistant = makeAssistant({ instructions: 'Answer in one sentence.', name: 'Terse' });
	const built = await slot.build({
		app: {} as any,
		sessionContext: {} as any,
		resolvedAssistant: {
			definition: assistant,
			knowledgeRefs: [],
			toolPolicy: assistant.toolPolicy,
		},
	} as any);
	assert.ok(built.data, 'slot builds content when resolvedAssistant is present');
	const rendered = slot.render(built);
	assert.strictEqual(rendered.length, 1);
	assert.strictEqual(rendered[0].role, 'system');
	const text = (rendered[0].content[0] as any).text as string;
	assert.match(text, /Terse/);
	assert.match(text, /Answer in one sentence\./);
	console.log('PASS: AssistantSlot renders instructions as a system message');
}

async function testAssistantSlotEmpty(): Promise<void> {
	const slot = new AssistantSlot();
	const noAssistant = await slot.build({ app: {} as any, sessionContext: {} as any } as any);
	assert.strictEqual(noAssistant.data, null);
	assert.strictEqual(slot.render(noAssistant).length, 0);

	const emptyInstructions = await slot.build({
		app: {} as any,
		sessionContext: {} as any,
		resolvedAssistant: {
			definition: makeAssistant({ instructions: '   ' }),
			knowledgeRefs: [],
			toolPolicy: defaultToolPolicy(),
		},
	} as any);
	assert.strictEqual(emptyInstructions.data, null);
	console.log('PASS: AssistantSlot renders nothing when no assistant or empty instructions');
}

async function testAssistantSlotCompression(): Promise<void> {
	const slot = new AssistantSlot();
	const built = await slot.build({
		app: {} as any,
		sessionContext: {} as any,
		resolvedAssistant: {
			definition: makeAssistant({ instructions: 'critical directive body' }),
			knowledgeRefs: [],
			toolPolicy: defaultToolPolicy(),
		},
	} as any);
	const compressed = await slot.compress(built, 1);
	const text = (compressed.data as any).text as string;
	// Framing header dropped, directive body preserved.
	assert.doesNotMatch(text, /acting as/i);
	assert.match(text, /critical directive body/);
	console.log('PASS: AssistantSlot compression keeps directive, drops framing header');
}

async function testReactNeverBuildsInstructionsIntoPrompt(): Promise<void> {
	// Structural guard for §5.3.2: any Composer/React file that references
	// `instructions` should NOT be splicing them into a user prompt.
	// We approximate the check by grepping the composer directory for
	// suspicious patterns. A negative assertion — if it fires, someone is
	// re-introducing the React-side path Task B2 forbids.
	const { readdirSync, readFileSync } = await import('fs');
	const { join } = await import('path');
	const composerDir = join(__dirname, '..', 'src', 'ui', 'view', 'chat-view', 'components', 'composer');
	const files = readdirSync(composerDir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));
	const banned = /assistant.*\.instructions.*(prompt|content|message)/i;
	for (const f of files) {
		const body = readFileSync(join(composerDir, f), 'utf8');
		assert.ok(
			!banned.test(body),
			`React file ${f} appears to splice assistant.instructions into a prompt — forbidden by plan §5.3.2`,
		);
	}
	console.log('PASS: no Composer file splices assistant.instructions into a prompt');
}

// ─── R3 knowledgeRefs merge ───────────────────────────────────────────────────

function fakeAppWithFiles(paths: string[]) {
	const present = new Set(paths);
	return {
		vault: {
			getAbstractFileByPath: (p: string) => (present.has(p) ? { path: p } : null),
		},
	};
}

async function testKnowledgeRefsMerge(): Promise<void> {
	const receipts = new SourceReceiptCollector();
	const refs: ExplicitContextRef[] = [
		{ id: 'r-vault', kind: 'vault-file', uri: 'Notes/A.md', title: 'A' },
		{ id: 'r-url', kind: 'url', uri: 'https://example.com', title: 'ex' },
		{ id: 'r-missing', kind: 'vault-file', uri: 'Deleted.md', title: 'gone' },
		{ id: 'r-folder', kind: 'vault-folder', uri: 'Folder', title: 'f' },
	];
	const merged = mergeAssistantKnowledgeRefsForTest({
		userAttachments: ['UserAttachment.md'],
		resolvedAssistant: {
			definition: makeAssistant({ knowledgeRefs: refs }),
			knowledgeRefs: refs,
			toolPolicy: defaultToolPolicy(),
		},
		app: fakeAppWithFiles(['Notes/A.md']) as any,
		receipts,
	});
	assert.deepStrictEqual(
		merged,
		['UserAttachment.md', 'Notes/A.md', 'https://example.com'],
		'user attachments first; only reachable refs join the list',
	);
	const snap = receipts.snapshot();
	const usedIds = snap.explicitRefsUsed.map((r) => r.id).sort();
	assert.deepStrictEqual(
		usedIds,
		['r-url', 'r-vault'],
		'receipt records exactly the refs that reached the attachment pipe',
	);
	console.log('PASS: knowledgeRefs merge — reachable refs join attachments and appear in receipt');
}

async function testKnowledgeRefsNoAssistant(): Promise<void> {
	const receipts = new SourceReceiptCollector();
	const merged = mergeAssistantKnowledgeRefsForTest({
		userAttachments: ['A.md'],
		resolvedAssistant: null,
		app: fakeAppWithFiles([]) as any,
		receipts,
	});
	assert.deepStrictEqual(merged, ['A.md']);
	assert.deepStrictEqual(receipts.snapshot().explicitRefsUsed, []);
	console.log('PASS: knowledgeRefs merge — Default assistant is a no-op');
}

async function testKnowledgeRefsDedupe(): Promise<void> {
	// User attachment already covers a knowledge ref — dedupe by uri.
	const receipts = new SourceReceiptCollector();
	const refs: ExplicitContextRef[] = [
		{ id: 'r-dup', kind: 'vault-file', uri: 'Shared.md', title: 'dup' },
	];
	const merged = mergeAssistantKnowledgeRefsForTest({
		userAttachments: ['Shared.md'],
		resolvedAssistant: {
			definition: makeAssistant({ knowledgeRefs: refs }),
			knowledgeRefs: refs,
			toolPolicy: defaultToolPolicy(),
		},
		app: fakeAppWithFiles(['Shared.md']) as any,
		receipts,
	});
	assert.deepStrictEqual(merged, ['Shared.md'], 'no duplicate string in attachments');
	// The ref still counts as used — user asked, assistant also referenced.
	assert.strictEqual(receipts.snapshot().explicitRefsUsed.length, 1);
	console.log('PASS: knowledgeRefs merge dedupes attachment strings by uri');
}

// ─── R4 toolPolicy ────────────────────────────────────────────────────────────

function makeReadTool(name: string): ToolDef {
	return {
		name,
		description: `read ${name}`,
		inputSchema: z.object({}).passthrough(),
		kind: 'read',
		async execute() { return ok('read'); },
	};
}
function makeEditTool(name: string): ToolDef {
	return {
		name,
		description: `edit ${name}`,
		inputSchema: z.object({}).passthrough(),
		kind: 'edit',
		async execute() { return ok('done'); },
	};
}

function testToolPolicyDenyFilter(): void {
	const tools = [makeReadTool('vault_search'), makeEditTool('mcp_x_write'), makeEditTool('mcp_x_delete')];
	const policy: AssistantToolPolicy = { allow: [], deny: ['mcp_x_delete'], approval: 'writes' };
	const filtered = filterToolsByAssistantPolicy(tools, policy);
	assert.deepStrictEqual(filtered.map((t) => t.name), ['vault_search', 'mcp_x_write']);
	console.log('PASS: toolPolicy deny filter removes denied tools from ToolDef list');
}

function testToolPolicyRules(): void {
	// deny wins over allow: name appears in both → deny rule only.
	const policy: AssistantToolPolicy = {
		allow: ['mcp_x_write', 'mcp_x_delete'],
		deny: ['mcp_x_delete'],
		approval: 'writes',
	};
	const rules = buildAssistantPermissionRules(policy);
	assert.strictEqual(rules.length, 2);
	const denyRule = rules.find((r) => r.effect === 'deny');
	const allowRule = rules.find((r) => r.effect === 'allow');
	assert.ok(denyRule && denyRule.tool === 'mcp_x_delete');
	assert.ok(allowRule && allowRule.tool === 'mcp_x_write');
	console.log('PASS: buildAssistantPermissionRules — allow + deny, deny takes precedence');
}

function testApprovalModeMapping(): void {
	assert.strictEqual(
		resolveAssistantPermissionMode({ allow: [], deny: [], approval: 'always' }),
		'ask',
	);
	assert.strictEqual(
		resolveAssistantPermissionMode({ allow: [], deny: [], approval: 'writes' }),
		'ask',
	);
	assert.strictEqual(
		resolveAssistantPermissionMode({ allow: [], deny: [], approval: 'never' }),
		'bypassPermissions',
	);
	assert.strictEqual(resolveAssistantPermissionMode(null), 'ask', 'default = ask');
	console.log('PASS: approval mapping — always→ask, writes→ask, never→bypassPermissions');
}

async function testAllowRuleSilencesAskInHarness(): Promise<void> {
	// End-to-end: install an allow rule for a mutating tool; the harness must
	// execute it without emitting a chat-permission-request event.
	const tool = makeEditTool('mcp_test_write');
	const guard = new PermissionGuard({
		mode: 'ask',
		rules: buildAssistantPermissionRules({
			allow: ['mcp_test_write'],
			deny: [],
			approval: 'writes',
		}),
	});
	const model = toolThenTextModel('mcp_test_write', {}, 'ok');
	const gen = harnessStreamChatWithModel(
		{
			profile: makeProfile(),
			modelId: 'm',
			messages: BASE_MSGS,
			tools: [tool],
			loopId: 'b2-allow',
			budget: { maxSteps: 3, maxTokens: 999, maxToolCalls: 3 },
			permission: guard,
			resolvePermissionAsk: async () => {
				throw new Error('resolver must not be called when allow rule matches');
			},
		},
		model as unknown as LanguageModel,
	);
	const events = await drainEvents(gen);
	assert.strictEqual(
		events.find((e) => e.type === 'chat-permission-request'),
		undefined,
		'allow rule bypasses ask path',
	);
	const toolResult = events.find((e) => e.type === 'tool-result') as any;
	assert.strictEqual(toolResult.output, 'done');
	console.log('PASS: allow rule silences ask path in harness');
}

async function testUnmentionedToolStillAsks(): Promise<void> {
	// A mutating tool with no allow/deny entry stays under the ask path.
	const tool = makeEditTool('mcp_untouched');
	const guard = new PermissionGuard({
		mode: 'ask',
		rules: buildAssistantPermissionRules({
			allow: ['mcp_other'],
			deny: ['mcp_bad'],
			approval: 'writes',
		}),
	});
	const model = toolThenTextModel('mcp_untouched', {}, 'ok');
	let askSeen = false;
	const gen = harnessStreamChatWithModel(
		{
			profile: makeProfile(),
			modelId: 'm',
			messages: BASE_MSGS,
			tools: [tool],
			loopId: 'b2-untouched',
			budget: { maxSteps: 3, maxTokens: 999, maxToolCalls: 3 },
			permission: guard,
			resolvePermissionAsk: async () => {
				askSeen = true;
				return { decision: 'allow' };
			},
		},
		model as unknown as LanguageModel,
	);
	await drainEvents(gen);
	assert.ok(askSeen, 'tool without allow/deny still triggers ask');
	console.log('PASS: unmentioned tool still routes through ask path');
}

async function testDenyRuleBlocksEvenIfToolReappears(): Promise<void> {
	// The ToolDef filter removes a denied tool from the list, but if it
	// somehow reaches execute (e.g. re-injected mid-run), the guard must
	// still block it. We simulate by NOT filtering out and relying only on
	// the guard.
	const tool = makeEditTool('mcp_bad');
	const guard = new PermissionGuard({
		mode: 'ask',
		rules: buildAssistantPermissionRules({
			allow: [],
			deny: ['mcp_bad'],
			approval: 'writes',
		}),
	});
	const model = toolThenTextModel('mcp_bad', {}, 'ok');
	const gen = harnessStreamChatWithModel(
		{
			profile: makeProfile(),
			modelId: 'm',
			messages: BASE_MSGS,
			tools: [tool],
			loopId: 'b2-deny-defense',
			budget: { maxSteps: 3, maxTokens: 999, maxToolCalls: 3 },
			permission: guard,
			resolvePermissionAsk: async () => ({ decision: 'allow' }),
		},
		model as unknown as LanguageModel,
	);
	const events = await drainEvents(gen);
	const toolResult = events.find((e) => e.type === 'tool-result') as any;
	assert.ok(toolResult, 'tool-result emitted');
	const payload = String(toolResult.output ?? '');
	assert.match(payload, /denied by assistant toolPolicy|permission denied/i);
	console.log('PASS: deny rule blocks even if tool bypasses the ToolDef filter');
}

// ─── R5 model precedence ──────────────────────────────────────────────────────

function testPrecedenceFixed(): void {
	const p1 = makeProfile({ id: 'p1', kind: 'openai' });
	const p2 = makeProfile({ id: 'p2', kind: 'anthropic' });
	const res = resolveEffectiveModel({
		fixedSelection: { profileId: 'p1', modelId: 'gpt-x' },
		assistantPreferred: { profileId: 'p2', modelId: 'claude-x' },
		defaultModel: { modelId: 'auto-default', provider: 'openai' },
		profileRegistry: fakeProfileRegistry({ profiles: [p1, p2] }),
	});
	assert.strictEqual(res.modelId, 'gpt-x');
	assert.strictEqual(res.provider, 'openai');
	assert.strictEqual(res.profileId, 'p1');
	assert.strictEqual(res.source, 'conversation-fixed');
	console.log('PASS: precedence — conversation fixed wins');
}

function testPrecedenceAssistantPreferred(): void {
	const p2 = makeProfile({ id: 'p2', kind: 'anthropic' });
	const res = resolveEffectiveModel({
		fixedSelection: null,
		assistantPreferred: { profileId: 'p2', modelId: 'claude-x' },
		defaultModel: { modelId: 'auto-default', provider: 'openai' },
		profileRegistry: fakeProfileRegistry({ profiles: [p2] }),
	});
	assert.strictEqual(res.source, 'assistant-preferred');
	assert.strictEqual(res.modelId, 'claude-x');
	assert.strictEqual(res.provider, 'anthropic');
	console.log('PASS: precedence — assistant preferred used when no fixed');
}

function testPrecedenceAutoDefault(): void {
	const p1 = makeProfile({ id: 'p1', kind: 'openai' });
	const res = resolveEffectiveModel({
		fixedSelection: null,
		assistantPreferred: null,
		defaultModel: { modelId: 'auto-default', provider: 'openai' },
		profileRegistry: fakeProfileRegistry({ profiles: [p1], activeChat: { profile: p1, modelId: 'chat-m' } }),
	});
	assert.strictEqual(res.source, 'auto-default');
	assert.strictEqual(res.modelId, 'chat-m', 'active Chat profile beats settings.defaultModel');
	console.log('PASS: precedence — Auto default = active Chat config');
}

function testPrecedenceAssistantPreferredMissingFallsBack(): void {
	// A deleted configured profile is a route error, not permission to use Chat.
	const p1 = makeProfile({ id: 'p1', kind: 'openai' });
	assert.throws(() => resolveEffectiveModel({
		fixedSelection: null,
		assistantPreferred: { profileId: 'gone', modelId: 'claude-x' },
		defaultModel: { modelId: 'auto-default', provider: 'openai' },
		profileRegistry: fakeProfileRegistry({ profiles: [p1], activeChat: { profile: p1, modelId: 'chat-m' } }),
	}), /fallback is disabled/i);
	console.log('PASS: precedence — missing assistant profile fails loudly');
}

function testPrecedenceAssistantPreferredDisabled(): void {
	const p1 = makeProfile({ id: 'p1', kind: 'openai' });
	const disabled = makeProfile({ id: 'p2', kind: 'anthropic', enabled: false });
	assert.throws(() => resolveEffectiveModel({
		fixedSelection: null,
		assistantPreferred: { profileId: 'p2', modelId: 'claude-x' },
		defaultModel: { modelId: 'auto-default', provider: 'openai' },
		profileRegistry: fakeProfileRegistry({ profiles: [p1, disabled], activeChat: { profile: p1, modelId: 'chat-m' } }),
	}), /fallback is disabled/i);
	console.log('PASS: precedence — disabled preferred profile fails loudly');
}

// ─── R6 builder safety ────────────────────────────────────────────────────────

async function testBuilderCannotWidenTools(): Promise<void> {
	// Read the ChatAssistantDraft prompt template and its usage — the draft
	// output schema must NOT expose allow/deny fields; the builder modal
	// hardcodes empty allow/deny on create.
	const { readFileSync } = await import('fs');
	const { join } = await import('path');
	// 1. Builder modal never sets allow/deny from draft; hardcodes empty arrays.
	const modalPath = join(
		__dirname,
		'..',
		'src',
		'ui',
		'view',
		'chat-view',
		'components',
		'composer',
		'AssistantBuilderModal.tsx',
	);
	const modal = readFileSync(modalPath, 'utf8');
	// Draft type: only name/summary/instructions from AI, plus user-chosen approval.
	assert.doesNotMatch(
		modal,
		/queryStructured<[^>]*allow/i,
		'AI draft schema must not include an allow field',
	);
	assert.doesNotMatch(
		modal,
		/queryStructured<[^>]*deny/i,
		'AI draft schema must not include a deny field',
	);
	assert.match(
		modal,
		/allow:\s*\[\]/,
		'create call hardcodes empty allow list',
	);
	assert.match(
		modal,
		/deny:\s*\[\]/,
		'create call hardcodes empty deny list',
	);
	// 2. On edit, the modal preserves existing toolPolicy (spread) and only
	//    replaces `approval` — allow/deny cannot be widened by AI text.
	assert.match(
		modal,
		/\.\.\.editing\.toolPolicy,\s*approval:/,
		'edit path spreads existing toolPolicy, replacing only approval',
	);
	console.log('PASS: Assistant builder cannot auto-widen toolPolicy (allow/deny stay locked)');
}

// ─── Harness fixtures (mirroring permission-chat-flow) ────────────────────────

const BASE_MSGS: LLMRequestMessage[] = [
	{ role: 'system', content: [{ type: 'text', text: 's' }] },
	{ role: 'user', content: [{ type: 'text', text: 'u' }] },
];

const RAW_USAGE_STOP = {
	inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
	outputTokens: { total: 5, textTokens: 5, reasoningTokens: undefined },
	totalTokens: 15,
	reasoningTokens: undefined,
	cachedInputTokens: undefined,
};
const RAW_USAGE_TOOL = {
	inputTokens: { total: 12, noCache: 12, cacheRead: undefined, cacheWrite: undefined },
	outputTokens: { total: 6, textTokens: 6, reasoningTokens: undefined },
	totalTokens: 18,
	reasoningTokens: undefined,
	cachedInputTokens: undefined,
};

function toolThenTextModel(toolName: string, toolInput: any, finalText: string): MockLanguageModelV3 {
	const steps = [
		[
			{ type: 'stream-start', warnings: [] },
			{ type: 'tool-call', toolCallId: 'tc1', toolName, input: JSON.stringify(toolInput) },
			{ type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: RAW_USAGE_TOOL },
		],
		[
			{ type: 'stream-start', warnings: [] },
			{ type: 'text-start', id: 't1' },
			{ type: 'text-delta', id: 't1', delta: finalText },
			{ type: 'text-end', id: 't1' },
			{ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: RAW_USAGE_STOP },
		],
	];
	let call = 0;
	return new MockLanguageModelV3({
		provider: 'mock',
		modelId: 'mock-b2',
		doStream: async () => {
			const idx = Math.min(call, steps.length - 1);
			call += 1;
			return { stream: convertArrayToReadableStream([...steps[idx]] as any) };
		},
	});
}

async function drainEvents(gen: AsyncGenerator<LLMStreamEvent, unknown, void>): Promise<LLMStreamEvent[]> {
	const out: LLMStreamEvent[] = [];
	while (true) {
		const step = await gen.next();
		if (step.done) return out;
		out.push(step.value);
	}
}

// ─── Runner ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const tests: Array<[string, () => Promise<void> | void]> = [
		// R1
		['resolver: valid id', testResolverValidId],
		['resolver: missing id', testResolverMissingId],
		['resolver: deleted id', testResolverDeletedId],
		['resolver: storage failure propagates', testResolverStorageFailure],
		// R2
		['AssistantSlot: renders instructions', testAssistantSlotRenders],
		['AssistantSlot: empty cases', testAssistantSlotEmpty],
		['AssistantSlot: compression', testAssistantSlotCompression],
		['No Composer file splices instructions', testReactNeverBuildsInstructionsIntoPrompt],
		// R3
		['knowledgeRefs merge — receipt + skip missing', testKnowledgeRefsMerge],
		['knowledgeRefs merge — Default no-op', testKnowledgeRefsNoAssistant],
		['knowledgeRefs merge — dedupe by uri', testKnowledgeRefsDedupe],
		// R4
		['toolPolicy: deny filter', testToolPolicyDenyFilter],
		['toolPolicy: allow + deny rules', testToolPolicyRules],
		['toolPolicy: approval → mode mapping', testApprovalModeMapping],
		['toolPolicy: allow rule silences ask', testAllowRuleSilencesAskInHarness],
		['toolPolicy: unmentioned tool still asks', testUnmentionedToolStillAsks],
		['toolPolicy: deny blocks even if tool reappears', testDenyRuleBlocksEvenIfToolReappears],
		// R5
		['precedence: conversation fixed wins', testPrecedenceFixed],
		['precedence: assistant preferred', testPrecedenceAssistantPreferred],
		['precedence: Auto default', testPrecedenceAutoDefault],
		['precedence: missing assistant profile throws', testPrecedenceAssistantPreferredMissingFallsBack],
		['precedence: disabled assistant profile throws', testPrecedenceAssistantPreferredDisabled],
		// R6
		['builder: cannot widen toolPolicy', testBuilderCannotWidenTools],
	];
	for (const [name, fn] of tests) {
		try {
			await fn();
		} catch (err) {
			console.error(`FAIL: ${name}`);
			throw err;
		}
	}
	console.log(`\nassistant-runtime: all ${tests.length} guards passed`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
