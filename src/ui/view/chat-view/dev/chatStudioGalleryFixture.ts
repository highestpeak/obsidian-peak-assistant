import { MessageStatus, type ChatMessage } from '@/core/types/chat';
import type {
	ChatArtifactReceipt,
	TurnExecutionReceipt,
} from '@/core/types/chat-studio';

/**
 * Stable marker used by the palette command to find and rebuild only the
 * plugin-owned QA conversation. User conversations are never matched by title
 * alone, so renaming a normal conversation to the gallery title is harmless.
 */
export const CHAT_STUDIO_GALLERY_LABEL = 'peak.chat-studio.component-gallery.v1';
export const CHAT_STUDIO_GALLERY_TITLE = '[QA] Chat Studio Component Gallery';

export interface ChatStudioGalleryFixture {
	messages: ChatMessage[];
	artifactReceipts: ChatArtifactReceipt[];
	turnReceipts: TurnExecutionReceipt[];
	debugMessageId: string;
	debugRunId: string;
}

function imagePreview(
	title: string,
	subtitle: string,
	background: string,
	accent: string,
	secondary: string,
	composition: string,
): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="${background}"/>
  ${composition}
  <rect x="44" y="42" width="9" height="72" rx="4.5" fill="${accent}"/>
  <text x="74" y="78" fill="#f8fafc" font-family="sans-serif" font-size="31" font-weight="650">${title}</text>
  <text x="76" y="111" fill="${secondary}" font-family="sans-serif" font-size="18">${subtitle}</text>
</svg>`)}`;
}

const IMAGE_PREVIEWS = [
	{
		title: 'concept-board.png',
		uri: imagePreview(
			'Concept board',
			'Generated image · 16:9',
			'#111827',
			'#8b5cf6',
			'#cbd5e1',
			'<circle cx="710" cy="130" r="170" fill="#7c3aed" opacity=".78"/><circle cx="245" cy="430" r="230" fill="#2563eb" opacity=".58"/><path d="M0 420L260 235L420 360L610 165L960 420V540H0Z" fill="#f8fafc" opacity=".93"/>',
		),
	},
	{
		title: 'dashboard-direction.png',
		uri: imagePreview(
			'Dashboard direction',
			'Generated image · layout study',
			'#172033',
			'#38bdf8',
			'#bae6fd',
			'<rect x="82" y="164" width="356" height="278" rx="22" fill="#26344f"/><rect x="466" y="164" width="410" height="120" rx="22" fill="#e2e8f0"/><rect x="466" y="310" width="194" height="132" rx="22" fill="#0ea5e9"/><rect x="682" y="310" width="194" height="132" rx="22" fill="#334155"/>',
		),
	},
	{
		title: 'mobile-storyboard.png',
		uri: imagePreview(
			'Mobile storyboard',
			'Generated image · three frames',
			'#201a2e',
			'#f472b6',
			'#fbcfe8',
			'<rect x="132" y="154" width="196" height="330" rx="32" fill="#f8fafc"/><rect x="382" y="154" width="196" height="330" rx="32" fill="#312e81"/><rect x="632" y="154" width="196" height="330" rx="32" fill="#fce7f3"/><circle cx="230" cy="218" r="36" fill="#f472b6"/><circle cx="480" cy="218" r="36" fill="#818cf8"/><circle cx="730" cy="218" r="36" fill="#db2777"/>',
		),
	},
	{
		title: 'campaign-cover.png',
		uri: imagePreview(
			'Campaign cover',
			'Generated image · square-safe crop',
			'#10251f',
			'#34d399',
			'#a7f3d0',
			'<circle cx="710" cy="320" r="210" fill="#065f46"/><circle cx="710" cy="320" r="138" fill="#10b981"/><circle cx="710" cy="320" r="62" fill="#d1fae5"/><path d="M92 444C220 292 346 228 520 176" fill="none" stroke="#6ee7b7" stroke-width="28" stroke-linecap="round"/>',
		),
	},
] as const;

const IMAGE_PREVIEW = IMAGE_PREVIEWS[0].uri;

// One-second local MP4 used by two receipts. It keeps visual QA offline while
// exercising native playback and fullscreen controls instead of a fake poster.
const DEMO_VIDEO = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANVbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAoB0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAUAAAAC0AAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAAAAABAAAAAAH4bWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAwAAAAMABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABo21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAWNzdGJsAAAAu3N0c2QAAAAAAAAAAQAAAKthdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAUAAtABIAAAASAAAAAAAAAABFUxhdmM2MS4xOS4xMDEgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAMWF2Y0MBQsAe/+EAGWdCwB7ZAUGfnwEQAAADABAAAAMBgPFi5IABAAVoy4PLIAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAB3oAAAAAAAAABhzdHRzAAAAAAAAAAEAAAAMAAAEAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAMAAAAAQAAAERzdHN6AAAAAAAAAAAAAAAMAAADRAAAAAsAAAALAAAACwAAAAsAAAALAAAACwAAAAsAAAALAAAACwAAAAsAAAALAAAAFHN0Y28AAAAAAAAAAQAAA4UAAABhdWR0YQAAAFltZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAACxpbHN0AAAAJKl0b28AAAAcZGF0YQAAAAEAAAAATGF2ZjYxLjcuMTAwAAAACGZyZWUAAAPFbWRhdAAAAnEGBf//bdxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjQgcjMxMDggMzFlMTlmOSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjMgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0wIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDE6MHgxMTEgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMiBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTAgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz02IGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5aW50PTI1MCBrZXlpbnRfbWluPTEyIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAy2WIhA7xGKAALOMcAAQNo4AAgEycnJycnJycnJycnJycnJycnJyddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddeAAAAB0GaOB3gPGAAAAAHQZpUB3gPGAAAAAdBmmA7wHjAAAAAB0GagDvAeMAAAAAHQZqgO8B4wAAAAAdBmsA7wHjAAAAAB0Ga4DvAeMAAAAAHQZsAO8B4wAAAAAdBmyA7wHjAAAAAB0GbQDfAeMAAAAAHQZtgM8B4wA==';

// Two-second local Opus tone. It gives the native controls a truthful duration
// while keeping the gallery offline and avoiding a tracked binary fixture.
const DEMO_AUDIO = 'data:audio/ogg;base64,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';
const GALLERY_DOC_PATH = '.obsidian/plugins/obsidian-peak-assistant/docs/testing/chat-studio-component-gallery.md';
const CAPABILITY_CHECKLIST_PATH = '.obsidian/plugins/obsidian-peak-assistant/docs/testing/chat-studio-capability-checklist.md';

function message(
	id: string,
	role: ChatMessage['role'],
	content: string,
	createdAtTimestamp: number,
	overrides: Partial<ChatMessage> = {},
): ChatMessage {
	return {
		id,
		role,
		content,
		createdAtTimestamp,
		createdAtZone: 'Pacific/Auckland',
		starred: false,
		model: role === 'assistant' ? 'openai/gpt-5.1' : '',
		provider: role === 'assistant' ? 'openrouter' : '',
		status: MessageStatus.COMPLETED,
		...overrides,
	};
}

function artifact(
	conversationId: string,
	messageId: string,
	createdAt: number,
	artifactId: string,
	overrides: Omit<Partial<ChatArtifactReceipt>, 'artifactId' | 'messageId' | 'conversationId' | 'createdAt'>,
): ChatArtifactReceipt {
	return {
		artifactId,
		runId: `gallery-run-${messageId}`,
		messageId,
		conversationId,
		direction: 'generated',
		kind: 'document',
		title: artifactId,
		state: 'ready',
		availableActions: [],
		createdAt,
		...overrides,
	};
}

function turn(
	conversationId: string,
	messageId: string,
	startedAt: number,
	overrides: Partial<TurnExecutionReceipt> = {},
): TurnExecutionReceipt {
	return {
		requestId: `gallery-request-${messageId}`,
		messageId,
		conversationId,
		effectiveModel: { profileId: 'gallery-openrouter', provider: 'openrouter', modelId: 'openai/gpt-5.1' },
		requestedSources: {
			project: null,
			vaultSearch: true,
			webSearch: false,
			explicitRefs: [],
		},
		actualSources: {
			projectIncluded: false,
			vaultQueries: [],
			vaultDocuments: [],
			webQueries: [],
			webSources: [],
		},
		status: 'completed',
		artifactIds: [],
		startedAt,
		finishedAt: startedAt + 2_600,
		...overrides,
	};
}

/**
 * Production-component fixture, not a parallel mock UI. The command persists
 * these records through the normal conversation/receipt services, then opens
 * the ordinary Chat Studio so every row exercises the real renderer.
 */
export function createChatStudioGalleryFixture(
	conversationId: string,
	now: number = Date.now(),
): ChatStudioGalleryFixture {
	const minute = 60_000;
	const base = now - 12 * minute;
	const ids = {
		input: 'gallery-user-inputs',
		rich: 'gallery-assistant-rich',
		codeAsk: 'gallery-user-code',
		code: 'gallery-assistant-code',
		agentAsk: 'gallery-user-agent',
		agent: 'gallery-assistant-agent',
		mediaAsk: 'gallery-user-media',
		media: 'gallery-assistant-media',
		failed: 'gallery-assistant-failed',
		cancelled: 'gallery-assistant-cancelled',
		finish: 'gallery-assistant-finish',
	};
	const debugRunId = `gallery-debug-${now}`;

	const messages: ChatMessage[] = [
		message(
			ids.input,
			'user',
			'请用这些输入资料做一次完整的 UI 展示，并保留文件、网页、图片和数据表的来源。',
			base,
			{
				topic: 'Rich content',
				resources: [
					{ id: 'gallery-ref-note', source: GALLERY_DOC_PATH, kind: 'markdown', displayName: 'chat-studio-component-gallery.md' },
					{ id: 'gallery-ref-web', source: 'https://example.com/design-system', kind: 'url' },
					{
						id: 'gallery-ref-image',
						source: 'assets/reference-board.png',
						kind: 'image',
						displayName: 'reference-board.png',
						previewUri: IMAGE_PREVIEW,
					},
					{ id: 'gallery-ref-data', source: CAPABILITY_CHECKLIST_PATH, kind: 'markdown', displayName: 'chat-studio-capability-checklist.md' },
				],
			},
		),
		message(
			ids.rich,
			'assistant',
			`下面把正文、引用、列表、表格和公式放在同一条真实 assistant message 中，便于检查阅读节奏。

> 设计原则：消息正文应该像文档，而不是层层嵌套的输入框。

- [x] 正文与 Composer 使用同一阅读宽度
- [x] 表格横向溢出时只滚动表格
- [x] 行内 \`code\`、[[${GALLERY_DOC_PATH}|组件画廊测试文档]] 与普通链接保持清晰层级

| Component | State | Long-value stress test |
| --- | ---: | --- |
| Table | Ready | 中文、English、\`inline code\` 与 https://example.com/a/very/long/path/that/should/not-break/the-layout |
| Message | Streaming | 统一正文宽度，避免大面积背景框 |
| Composer | Focused | 附件名称缩写，悬停显示完整路径 |

行内公式 $E = mc^2$，块公式：

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$`,
			base + minute,
			{
				topic: 'Rich content',
				starred: true,
				resources: [
					{ id: 'gallery-assistant-doc', source: CAPABILITY_CHECKLIST_PATH, kind: 'markdown', displayName: 'chat-studio-capability-checklist.md' },
				],
				tokenUsage: { inputTokens: 612, outputTokens: 488, totalTokens: 1100 },
				genTimeMs: 4_280,
				suggestedFollowups: ['继续检查代码块', '只看表格样式', '打开资源索引'],
			},
		),
		message(ids.codeAsk, 'user', '再展示代码、多语言高亮和 Mermaid；代码行要足够长以测试横向滚动。', base + 2 * minute, {
			topic: 'Rich content',
		}),
		message(
			ids.code,
			'assistant',
			`代码工作台应该与正文分层，但仍然属于同一个消息系统。

\`\`\`typescript
type GalleryState = 'idle' | 'streaming' | 'completed' | 'failed';

export function describeGallery(state: GalleryState, components: string[]): string {
  const detail = components.map((name, index) => \`\${index + 1}. \${name}\`).join(' · ');
  return \`Chat Studio is \${state}: \${detail} — this deliberately long line verifies horizontal scrolling without stretching the reading column.\`;
}
\`\`\`

\`\`\`json
{"theme":"github-dark","surfaces":["code","table","mermaid"],"configurable":true}
\`\`\`

\`\`\`bash
npm run test -- test/chat-studio-gallery-fixture.test.ts
\`\`\`

\`\`\`mermaid
flowchart LR
  A[User input] --> B[Agent run]
  B --> C{Artifact kind}
  C -->|Image| D[Preview]
  C -->|Audio or video| E[Media receipt]
  C -->|Table or code| F[Rich message]
\`\`\``,
			base + 3 * minute,
			{
				topic: 'Rich content',
				reasoning: {
					content: '先判断内容类型，再选择表格、代码或图表组件。Reasoning 是次要文本披露，不应伪装成 Agent Trace。',
				},
				tokenUsage: { inputTokens: 880, outputTokens: 742, totalTokens: 1622 },
				genTimeMs: 7_140,
			},
		),
		message(ids.agentAsk, 'user', '请运行一次带工具调用和诊断栈的 agent 流程。', base + 4 * minute, {
			topic: 'Agent execution',
		}),
		message(
			ids.agent,
			'assistant',
			'已完成 Vault 检索、文件读取和上下文组装。上方是可读的 Agent Run；其中的 Diagnostic trace 是独立的运行栈，不等同于 reasoning 文本。',
			base + 5 * minute,
			{
				topic: 'Agent execution',
				debugRunId,
				toolCalls: [
					{
						toolName: 'vault_search',
						input: { query: 'Chat Studio message component design' },
						output: { results: [{ path: 'kb/product/Chat Studio 设计说明.md' }, { path: 'kb/ui/Message tokens.md' }] },
					},
					{
						toolName: 'vault_read_note',
						input: { note_path: 'kb/product/Chat Studio 设计说明.md' },
						output: { summary: 'Loaded the message rendering and right-index requirements.' },
					},
					{
						toolName: 'context-pipeline:assemble',
						input: { prompt: 'Assemble verified sources for the answer' },
						output: { summary: 'Prompt assembled with two Vault sources.' },
					},
				],
				tokenUsage: { inputTokens: 1440, outputTokens: 522, totalTokens: 1962 },
				genTimeMs: 9_480,
			},
		),
		message(ids.mediaAsk, 'user', '生成图片、视频、music、表格、代码和 Obsidian Base，并显示不同生成状态。', base + 6 * minute, {
			topic: 'Media and artifacts',
			resources: [
				{ id: 'gallery-audio-input', source: 'uploads/reference-theme.mp3', kind: 'unknown' },
				{ id: 'gallery-video-input', source: 'uploads/reference-motion.mp4', kind: 'unknown' },
			],
		}),
		message(
			ids.media,
			'assistant',
			'这一批 receipts 同时包含 4 张图片、3 个视频、3 首 music、多份 CSV / 代码 / 文档，以及图表、Base 和压缩包。多媒体应形成可浏览画廊，其他产物进入连续清单，并明确区分 Ready、Generating、Needs permission 与 Failed。',
			base + 7 * minute,
			{
				topic: 'Media and artifacts',
				tokenUsage: { inputTokens: 704, outputTokens: 316, totalTokens: 1020 },
				genTimeMs: 3_620,
			},
		),
		message(ids.failed, 'assistant', '媒体生成服务返回了可恢复错误。此行用于验证错误状态、重试提示和 Outline 锚点。', base + 8 * minute, {
			topic: 'Message states',
			status: MessageStatus.ERROR,
			isErrorMessage: true,
		}),
		message(ids.cancelled, 'assistant', '用户停止了本轮生成，已有内容仍然保留。', base + 9 * minute, {
			topic: 'Message states',
			status: MessageStatus.CANCELLED,
		}),
		message(ids.finish, 'assistant', '组件画廊已就绪。右侧 Outline 应严格按时间倒序；重复的 Rich content 只在连续消息内聚合，跨 topic 后会形成新的独立分组。', base + 10 * minute, {
			topic: 'Rich content',
			suggestedFollowups: ['筛选 Generated media', '检查 Agent trace', '切换代码主题'],
		}),
	];

	const mediaReceiptAt = base + 7 * minute;
	const imageReceipts: ChatArtifactReceipt[] = IMAGE_PREVIEWS.map((image, index) => artifact(
		conversationId,
		ids.media,
		mediaReceiptAt + (index + 1) * 100,
		`gallery-image-${index + 1}`,
		{
			kind: 'image',
			title: image.title,
			contentType: 'image/svg+xml',
			preview: { kind: 'image', uri: image.uri },
			uri: image.uri,
			state: 'ready',
			availableActions: ['copy'],
		},
	));
	const audioReceipts: ChatArtifactReceipt[] = [
		'ambient-focus-theme.ogg',
		'launch-sting.ogg',
		'deep-work-loop.ogg',
	].map((title, index) => artifact(
		conversationId,
		ids.media,
		mediaReceiptAt + 800 + index * 100,
		`gallery-audio-${index + 1}`,
		{
			kind: 'audio',
			title,
			contentType: 'audio/ogg',
			uri: DEMO_AUDIO,
			state: 'ready',
			availableActions: [],
		},
	));

	const artifactReceipts: ChatArtifactReceipt[] = [
		...imageReceipts,
		artifact(conversationId, ids.media, mediaReceiptAt + 500, 'gallery-video-1', {
			kind: 'video',
			title: 'product-walkthrough.mp4',
			contentType: 'video/mp4',
			uri: DEMO_VIDEO,
			state: 'ready',
			availableActions: [],
		}),
		artifact(conversationId, ids.media, mediaReceiptAt + 600, 'gallery-video-2', {
			kind: 'video',
			title: 'feature-reveal.mp4',
			contentType: 'video/mp4',
			uri: DEMO_VIDEO,
			state: 'ready',
			availableActions: [],
		}),
		artifact(conversationId, ids.media, mediaReceiptAt + 700, 'gallery-video-3', {
			kind: 'video',
			title: 'export-processing.mp4',
			contentType: 'video/mp4',
			state: 'generating',
			availableActions: [],
		}),
		...audioReceipts,
		artifact(conversationId, ids.media, mediaReceiptAt + 1_100, 'gallery-table-1', {
			kind: 'table',
			title: 'component-audit.csv',
			vaultPath: 'QA/Chat Studio/component-audit.csv',
			preview: { kind: 'text', text: 'component,status\nmessage,ready\ncomposer,ready\nresources,ready' },
			state: 'saved',
			availableActions: ['open', 'copy'],
		}),
		artifact(conversationId, ids.media, mediaReceiptAt + 1_200, 'gallery-table-2', {
			kind: 'table',
			title: 'generation-costs.csv',
			vaultPath: 'QA/Chat Studio/generation-costs.csv',
			preview: { kind: 'text', text: 'type,count,cost\nimage,4,0.16\nvideo,3,0.42\naudio,3,0.09' },
			state: 'saved',
			availableActions: ['open', 'copy'],
		}),
		artifact(conversationId, ids.media, mediaReceiptAt + 1_300, 'gallery-table-3', {
			kind: 'table',
			title: 'asset-manifest.csv',
			vaultPath: 'QA/Chat Studio/asset-manifest.csv',
			state: 'saved',
			availableActions: ['open'],
		}),
		artifact(conversationId, ids.media, mediaReceiptAt + 1_400, 'gallery-dataset', {
			kind: 'dataset',
			title: 'generation-events.jsonl',
			preview: { kind: 'text', text: '{"type":"image","state":"ready"}\n{"type":"video","state":"ready"}\n{"type":"audio","state":"ready"}' },
			state: 'ready',
			availableActions: ['copy'],
		}),
		artifact(conversationId, ids.media, mediaReceiptAt + 1_500, 'gallery-code-1', {
			kind: 'code',
			title: 'gallery-state.ts',
			preview: { kind: 'code', text: "export const galleryState = 'ready' as const;" },
			state: 'ready',
			availableActions: ['copy'],
		}),
		artifact(conversationId, ids.media, mediaReceiptAt + 1_600, 'gallery-code-2', {
			kind: 'code',
			title: 'media-batch.ts',
			preview: { kind: 'code', text: 'export const mediaBatch = { images: 4, videos: 3, audio: 3 };' },
			state: 'ready',
			availableActions: ['copy'],
		}),
		artifact(conversationId, ids.media, mediaReceiptAt + 1_700, 'gallery-document-1', {
			kind: 'document',
			title: 'creative-brief.md',
			vaultPath: 'QA/Chat Studio/creative-brief.md',
			preview: { kind: 'document', text: '# Creative brief\nA coordinated launch package across image, motion, audio, and data.' },
			state: 'saved',
			availableActions: ['open', 'copy'],
		}),
		artifact(conversationId, ids.media, mediaReceiptAt + 1_800, 'gallery-document-2', {
			kind: 'document',
			title: 'delivery-notes.md',
			vaultPath: 'QA/Chat Studio/delivery-notes.md',
			state: 'saved',
			availableActions: ['open'],
		}),
		artifact(conversationId, ids.media, mediaReceiptAt + 1_900, 'gallery-diagram-1', {
			kind: 'diagram',
			title: 'generation-flow.mmd',
			state: 'generating',
			availableActions: [],
		}),
		artifact(conversationId, ids.media, mediaReceiptAt + 2_000, 'gallery-diagram-2', {
			kind: 'diagram',
			title: 'asset-dependencies.mmd',
			preview: { kind: 'text', text: 'brief --> image\nbrief --> video\nbrief --> audio\nall --> delivery' },
			state: 'ready',
			availableActions: ['copy'],
		}),
		artifact(conversationId, ids.media, mediaReceiptAt + 2_100, 'gallery-base', {
			kind: 'base',
			title: 'research-index.base',
			state: 'needs-permission',
			availableActions: [],
		}),
		artifact(conversationId, ids.media, mediaReceiptAt + 2_200, 'gallery-bundle', {
			kind: 'bundle',
			title: 'campaign-delivery.zip',
			state: 'ready',
			availableActions: [],
		}),
		artifact(conversationId, ids.failed, base + 8 * minute + 100, 'gallery-failed-doc', {
			kind: 'document',
			title: 'release-notes.md',
			state: 'failed',
			error: { code: 'provider_unavailable', message: 'Provider unavailable — retry when the media gateway is configured.' },
			availableActions: ['retry'],
		}),
	];

	const turnReceipts: TurnExecutionReceipt[] = [
		turn(conversationId, ids.rich, base + minute, {
			actualSources: {
				projectIncluded: false,
				vaultQueries: ['Chat Studio design'],
				vaultDocuments: [{ id: 'gallery-vault-source', path: 'kb/product/Chat Studio 设计说明.md', title: 'Chat Studio 设计说明' }],
				webQueries: [],
				webSources: [],
			},
		}),
		turn(conversationId, ids.code, base + 3 * minute, {
			actualSources: {
				projectIncluded: false,
				vaultQueries: ['Streamdown code theme'],
				vaultDocuments: [{ id: 'gallery-code-source', path: 'kb/ui/Message tokens.md', title: 'Message tokens' }],
				webQueries: ['Mermaid accessibility'],
				webSources: [{ id: 'gallery-web-source', url: 'https://mermaid.js.org/', title: 'Mermaid' }],
			},
		}),
		turn(conversationId, ids.agent, base + 5 * minute, { runId: debugRunId }),
		turn(conversationId, ids.media, base + 7 * minute, {
			artifactIds: artifactReceipts.filter((receipt) => receipt.messageId === ids.media).map((receipt) => receipt.artifactId),
		}),
	];

	return {
		messages,
		artifactReceipts,
		turnReceipts,
		debugMessageId: ids.agent,
		debugRunId,
	};
}
