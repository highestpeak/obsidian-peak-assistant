import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
	canScrollInDirection,
	distanceFromBottom,
	isTimelineNearBottom,
	resolveAdaptiveComposerDisplay,
} from '@/ui/view/chat-view/components/composer/composerAdaptiveState';
import {
	buildComposerContextPreview,
	type ComposerContextModelCopy,
	type ComposerContextLayerId,
} from '@/ui/view/chat-view/components/composer/composerContextModel';
import { emptyComposerDraft } from '@/ui/view/chat-view/store/composerStore';

const ROOT = join(__dirname, '..');

function copy(): ComposerContextModelCopy {
	const ids: ComposerContextLayerId[] = [
		'system-prompt',
		'assistant',
		'recent-messages',
		'working-context',
		'conv-summary',
		'activity-index',
		'user-profile',
		'prev-analysis',
		'resource-index',
	];
	return {
		layers: Object.fromEntries(ids.map((id) => [id, {
			title: id,
			description: `${id} description`,
			source: `${id} source`,
			reason: `${id} reason`,
			treatment: `${id} treatment`,
		}])) as ComposerContextModelCopy['layers'],
		systemBaseNotice: 'Base system prompt is rendered at send time.',
		customPromptLabel: 'Custom prompt',
		focusFolderLabel: 'Focus folder',
		sourceScopeLabel: 'Source scope',
		projectSourceLabel: 'Project',
		vaultSourceLabel: 'Vault',
		webSourceLabel: 'Web',
		explicitRefsLabel: 'Explicit refs',
		activeFileLabel: 'Active file',
		workingThemeLabel: 'Theme',
		recentActivityLabel: 'Activity',
		projectDescriptionLabel: 'Project description',
		projectInstructionsLabel: 'Project instructions',
		projectSummaryLabel: 'Project summary',
		conversationSummaryLabel: 'Conversation summary',
		conversationTopicsLabel: 'Topics',
		userRoleLabel: 'User',
		assistantRoleLabel: 'Assistant',
		analysisFallbackTitle: 'Analysis',
		resourceFallbackTitle: 'Resource',
		emptyContent: 'No content recorded.',
		requestProject: 'Project context',
		requestVault: 'Vault search',
		requestWeb: 'Web search',
		requestExplicitRef: 'Explicit reference',
		requestAttachment: 'Attachment',
		requestDraft: 'Current draft',
		requestAssistantKnowledge: 'Assistant knowledge',
		assistantFrameTemplate: 'You are acting as {name}:\n\n{instructions}',
	};
}

function testAdaptiveState(): void {
	const metrics = { scrollHeight: 1000, clientHeight: 400, scrollTop: 500 };
	assert.strictEqual(distanceFromBottom(metrics), 100);
	assert.strictEqual(isTimelineNearBottom(metrics, 96), false);
	assert.strictEqual(isTimelineNearBottom(metrics, 100), true);

	const base = {
		activePlacement: true,
		nearBottom: false,
		focused: false,
		hasDraft: false,
		hasAttachments: false,
		hasOpenSurface: false,
		hasActiveRun: false,
	};
	assert.strictEqual(resolveAdaptiveComposerDisplay(base), 'compact');
	for (const forced of ['nearBottom', 'focused', 'hasDraft', 'hasAttachments', 'hasOpenSurface', 'hasActiveRun'] as const) {
		assert.strictEqual(resolveAdaptiveComposerDisplay({ ...base, [forced]: true }), 'expanded', forced);
	}
	assert.strictEqual(resolveAdaptiveComposerDisplay({ ...base, activePlacement: false }), 'expanded');

	assert.strictEqual(canScrollInDirection({ scrollHeight: 800, clientHeight: 200, scrollTop: 20 }, -1, 2), true);
	assert.strictEqual(canScrollInDirection({ scrollHeight: 800, clientHeight: 200, scrollTop: 0 }, -1, 2), false);
	assert.strictEqual(canScrollInDirection({ scrollHeight: 800, clientHeight: 200, scrollTop: 600 }, 1, 2), false);
	assert.strictEqual(canScrollInDirection({ scrollHeight: 800, clientHeight: 200, scrollTop: 500 }, 1, 2), true);
	console.log('PASS: adaptive display and wheel-routing decisions');
}

function testContextModel(): void {
	const draft = emptyComposerDraft();
	draft.text = 'Next question';
	draft.vaultSearch = true;
	draft.explicitRefs = [{ id: 'r1', kind: 'vault-file', uri: 'Notes/A.md', title: 'A' }];
	const model = buildComposerContextPreview({
		conversation: {
			meta: {
				id: 'c1',
				title: 'Conversation',
				projectId: 'p1',
				createdAtTimestamp: 1,
				updatedAtTimestamp: 2,
				activeModel: 'm',
				activeProvider: 'p',
				focusFolder: 'Peak Assistant',
			},
			messages: [
				{ id: 'u1', role: 'user', content: 'Question', createdAtTimestamp: 1, createdAtZone: 'UTC', starred: false, model: 'm', provider: 'p' },
				{ id: 'a1', role: 'assistant', content: 'Old answer', createdAtTimestamp: 2, createdAtZone: 'UTC', starred: false, model: 'm', provider: 'p', variantGroupId: 'g1', variantIndex: 0, isActiveVariant: false },
				{ id: 'a2', role: 'assistant', content: 'Active answer', createdAtTimestamp: 3, createdAtZone: 'UTC', starred: false, model: 'm', provider: 'p', variantGroupId: 'g1', variantIndex: 1, isActiveVariant: true },
			],
			context: {
				lastUpdatedTimestamp: 2,
				recentMessagesWindow: [],
				shortSummary: 'Durable summary',
				resourceIndex: [{ id: 'cr1', source: 'Notes/B.md', kind: 'markdown', title: 'B', lastUpdatedTimestamp: 2 }],
			},
			content: '',
		},
		project: {
			meta: { id: 'p1', name: 'Project', createdAtTimestamp: 1, updatedAtTimestamp: 2 },
			context: { lastUpdatedTimestamp: 2, description: 'Project description' },
		},
		draft,
		attachments: [],
		assistant: {
			id: 'assistant-1',
			name: 'Research partner',
			summary: 'Researches carefully',
			instructions: 'Cite durable evidence.',
			knowledgeRefs: [{ id: 'ak1', kind: 'url', uri: 'https://example.com', title: 'Reference' }],
			toolPolicy: { allow: [], deny: [], approval: 'writes' },
			createdAt: 1,
			updatedAt: 1,
		},
		workingContext: null,
		userProfileMarkdown: '## Preference\n- Chinese-first',
		analyses: [],
		lastReceipt: null,
		vaultAvailable: true,
		copy: copy(),
	});

	assert.strictEqual(model.layers.length, 9, 'mirrors active ChatProfile slots');
	assert.deepStrictEqual(model.layers.map((layer) => layer.id), [
		'system-prompt', 'assistant', 'recent-messages', 'working-context', 'conv-summary',
		'activity-index', 'user-profile', 'prev-analysis', 'resource-index',
	]);
	const history = model.layers.find((layer) => layer.id === 'recent-messages')!;
	assert.match(history.content, /Active answer/);
	assert.ok(!history.content.includes('Old answer'), 'inactive variants stay excluded');
	assert.strictEqual(model.recentMessageCount, 3, 'the pending user draft mirrors the send-time recent-message slot');
	assert.strictEqual(model.resourceCount, 3, 'resource index + explicit refs + assistant knowledge');
	assert.ok(model.requestScope.some((item) => item.kind === 'project'));
	assert.ok(model.requestScope.some((item) => item.kind === 'vault'));
	assert.ok(model.requestScope.some((item) => item.kind === 'explicit-ref'));
	assert.ok(model.requestScope.some((item) => item.kind === 'draft'));
	const assistant = model.layers.find((layer) => layer.id === 'assistant')!;
	assert.strictEqual(assistant.completeness, 'exact');
	assert.match(assistant.content, /Research partner[\s\S]*Cite durable evidence/);
	assert.ok(model.requestScope.some((item) => item.label === 'Assistant knowledge'));
	assert.strictEqual(history.completeness, 'preview', 'serialized prompt content is not overclaimed as exact');
	console.log('PASS: context projection mirrors profile order and active history truth');
}

function testScopeGuards(): void {
	const messages = readFileSync(join(ROOT, 'src/ui/view/chat-view/view-Messages.tsx'), 'utf8');
	const projectHome = readFileSync(join(ROOT, 'src/ui/view/chat-view/view-ProjectOverview.tsx'), 'utf8');
	const composer = readFileSync(join(ROOT, 'src/ui/view/chat-view/components/Composer.tsx'), 'utf8');
	const styles = readFileSync(join(ROOT, 'src/styles/peak-components.css'), 'utf8');
	assert.match(messages, /<Composer[^>]*scrollContainerRef=\{bodyScrollRef\}/,
		'only the active conversation passes the timeline bridge');
	assert.ok(!projectHome.includes('scrollContainerRef='), 'Project Home does not opt into adaptive behavior');
	assert.match(composer, /data-composer-placement=\{activePlacement \? ['"]active['"] : ['"]start['"]\}/);
	assert.strictEqual((composer.match(/onSurfaceOpenChange=/g) ?? []).length, 4,
		'all existing Composer menus keep the shell expanded while open');
	assert.match(styles, /\.pkchat-context-rail\s*\{[\s\S]*?border-radius:\s*16px 16px 0 0 !important;/,
		'context hover rail follows the shell on top and stays square below');
	assert.match(styles, /\.pkchat-context-popover\s*\{[\s\S]*?width:\s*var\(--radix-popover-trigger-width\) !important;/,
		'context popover follows the Composer width');
	console.log('PASS: active placement is explicit and start surfaces stay isolated');
}

function run(): void {
	testAdaptiveState();
	testContextModel();
	testScopeGuards();
	console.log('chat-studio-adaptive-composer: all guards passed');
}

run();
