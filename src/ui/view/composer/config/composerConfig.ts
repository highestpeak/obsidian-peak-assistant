/**
 * Peak Composer — domain config (typed fallback + loader).
 *
 * Mirrors templates/config/composer.json. Per docs/conventions/configurability.md,
 * all user-facing labels (view title, lifecycle state copy, per-kind block
 * labels, fold aria) are domain config data, so they live in the JSON template;
 * this module is the compiled fallback used at cold-start / in tests / in the
 * browser harness where the TemplateManager is not available.
 *
 * No label/regex/threshold is hardcoded in the render logic — the UI reads
 * everything through {@link ComposerConfig}.
 */

import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import {
	DEFAULT_TRANSACTION_CONFIG,
	type ComposerBlockKind,
	type ComposerTransactionConfig,
} from '@/core/composer';
import {
	DEFAULT_TABLE_BLOCK_STRINGS,
	type ChartBlockStrings,
	type TableToolbarStrings,
} from '../blocks/table/tableViewConfig';
import type { TableSelectionStrings } from '@/service/composer';

export interface ComposerStrings {
	displayText: string;
	emptyTitle: string;
	emptyHint: string;
	loading: string;
	missingTitle: string;
	missingHint: string;
	staleTitle: string;
	staleHint: string;
	revalidate: string;
	errorTitle: string;
	collapseBlock: string;
	expandBlock: string;
	collapseSection: string;
	expandSection: string;
	/** Suffix appended to a kind label for the unknown/unsupported fallback. */
	unknownFallback: string;
	/** Collapsed-block summary shown when a block has no text preview. */
	emptyPreview: string;
	/** Read-only banner label. */
	readOnlyBadge: string;
	blocksSuffix: string;
}

/** Color swatch. The label is accessibility-only; the palette stays visual. */
export interface ComposerSwatch {
	label: string;
	value: string;
}

/**
 * WP4 editing-chrome copy. AI capability labels are NOT here — they come from
 * the capability projection port (descriptors), never hardcoded in the chrome.
 * Everything below is deterministic chrome copy (labels, templates, guard
 * messages) routed through config per configurability.md.
 */
export interface ComposerChromeConfig {
	/** Pointer must remain intentional this long before a large hover surface appears. */
	surfacePreviewOpenDelayMs: number;
	/** Shorter dwell used after the user has acquired a visible plus trigger. */
	surfaceIntentOpenDelayMs: number;
	/** Hover corridor grace period for moving from an action trigger into its floating surface. */
	surfacePreviewCloseDelayMs: number;
	/** Movement beyond this distance restarts hover intent acquisition. */
	surfacePointerTravelTolerancePx: number;
	actions: {
		insertBelow: string;
		copy: string;
		comment: string;
		history: string;
		instruction: string;
		instructionPlaceholder: string;
		instructionSubmitHint: string;
		instructionClose: string;
		drag: string;
		directEdit: string;
		disabledNoRuntime: string;
		listGapLabel: string;
		listGapInsertItem: string;
		listGapInsertTask: string;
		listGapAi: string;
		listGapPlaceholder: string;
		listGapGenerate: string;
		listGapCancel: string;
	};
	insertDraft: {
		chooserLabel: string;
		commit: string;
		generate: string;
		generating: string;
		stop: string;
		acceptGenerated: string;
		generationUnavailable: string;
		generationFailed: string;
		cancel: string;
		shortcutHint: string;
		types: Array<{
			/** Stable option id; labels and source templates remain config-owned. */
			id: string;
			label: string;
			default: boolean;
			initialValue: string;
			placeholder: string;
			/** Markdown inserted at the caret when this option is used as a syntax shortcut. */
			syntaxPrefix: string;
			syntaxSuffix: string;
			shortcut: boolean;
			mode: 'markdown' | 'ai';
		}>;
	};
	undo: {
		undo: string;
		redo: string;
		committed: string;
		undone: string;
		redone: string;
		shortcutUndo: string;
		shortcutRedo: string;
	};
	displayStates: {
		groupLabel: string;
		edit: string;
		clean: string;
		nativeMarkdown: string;
		/** `{count}` is replaced with the pending candidate count. */
		reviewAll: string;
	};
	selection: {
		formats: {
			bold: string;
			italic: string;
			underline: string;
			strikethrough: string;
			link: string;
			textColor: string;
			highlight: string;
		};
		comment: string;
		pasteUrl: string;
		applyLink: string;
		linkPlaceholder: string;
		clearColor: string;
		colorPalette: string;
		customColor: string;
		scopeTemplates: {
			crossParagraph: string;
			crossItem: string;
			crossCell: string;
			crossBlock: string;
		};
		guards: {
			codeBlockRichFormat: string;
			crossStructureLink: string;
			semanticInlineHtmlFormat: string;
			emptySelection: string;
		};
		quickTextColors: ComposerSwatch[];
		quickHighlightColors: ComposerSwatch[];
		textColors: ComposerSwatch[];
		highlightColors: ComposerSwatch[];
	};
	copy: {
		plain: string;
		image: string;
		markdown: string;
		html: string;
		success: string;
		imageSuccess: string;
		close: string;
	};
	link: {
		openVault: string;
		openExternal: string;
		brokenTitle: string;
		pathLabel: string;
	};
	inlineStyle: {
		removeBold: string;
		removeItalic: string;
		removeUnderline: string;
		removeStrikethrough: string;
		removeTextColor: string;
		removeHighlight: string;
		 polishSelection: string;
		 suggestStyle: string;
		 suggestBoldInstruction: string;
		 suggestItalicInstruction: string;
		 suggestUnderlineInstruction: string;
		 suggestStrikethroughInstruction: string;
		 suggestTextColorInstruction: string;
		 suggestHighlightInstruction: string;
		unavailable: string;
	};
	comment: {
		railBreakpointPx: number;
		placeholder: string;
		replyPlaceholder: string;
		save: string;
		cancel: string;
		stale: string;
		addTitle: string;
		railTitle: string;
		openRail: string;
		closeRail: string;
		selectionAnchor: string;
		blockAnchor: string;
		privateLabel: string;
		sharedLabel: string;
		ownerLabel: string;
		externalLabel: string;
		reply: string;
		resolve: string;
		reopen: string;
		remove: string;
		askCopilot: string;
		copilotTaskTitle: string;
		empty: string;
	};
	history: {
		title: string;
		empty: string;
		locate: string;
		versions: string;
		accepted: string;
		notAdopted: string;
		pending: string;
		failed: string;
		cancelled: string;
		restore: string;
		rollback: string;
		rollbackRefused: string;
	};
	findings: {
		askCopilot: string;
		confirm: string;
		close: string;
		dismiss: string;
		stale: string;
	};
}

export interface ComposerConfig {
	/** Per-block-kind display label. */
	kinds: Record<ComposerBlockKind, string>;
	strings: ComposerStrings;
	chrome: ComposerChromeConfig;
	/** Table object-toolbar and selection copy. */
	table: {
		toolbar: TableToolbarStrings;
		selection: TableSelectionStrings;
	};
	/** Chart object-block copy. */
	chart: ChartBlockStrings;
}

/** JSON/template patch shape. Table and chart deliberately support nested partial overrides. */
export type ComposerConfigPatch = Omit<Partial<ComposerConfig>, 'table' | 'chart'> & {
	table?: {
		toolbar?: Partial<TableToolbarStrings>;
		selection?: Partial<TableSelectionStrings>;
	};
	chart?: Partial<ChartBlockStrings>;
};

export const DEFAULT_COMPOSER_CONFIG: ComposerConfig = {
	kinds: {
		frontmatter: 'Frontmatter',
		heading: 'Heading',
		paragraph: 'Paragraph',
		list: 'List',
		task: 'Tasks',
		quote: 'Quote',
		callout: 'Callout',
		divider: 'Divider',
		code: 'Code',
		math: 'Formula',
		table: 'Table',
		image: 'Image',
		mermaid: 'Mermaid',
		dataview: 'Dataview',
		html: 'HTML',
		comment: 'Comment',
		'footnote-def': 'Footnote',
		embed: 'Embed',
		base: 'Base',
		canvas: 'Canvas',
		excalidraw: 'Excalidraw',
		unknown: 'Unsupported',
	},
	strings: {
		displayText: 'Composer',
		emptyTitle: 'No document open',
		emptyHint: 'Open a Markdown note to compose it here.',
		loading: 'Loading document…',
		missingTitle: 'Document removed',
		missingHint: 'The file backing this composer was deleted.',
		staleTitle: 'Document changed on disk',
		staleHint: 'This note was modified outside the composer.',
		revalidate: 'Reload from file',
		errorTitle: 'Could not open document',
		collapseBlock: 'Collapse block',
		expandBlock: 'Expand block',
		collapseSection: 'Collapse section',
		expandSection: 'Expand section',
		unknownFallback: 'shown verbatim',
		emptyPreview: '(empty)',
		readOnlyBadge: 'Read-only preview',
		blocksSuffix: 'blocks',
	},
	chrome: {
		surfacePreviewOpenDelayMs: 360,
		surfaceIntentOpenDelayMs: 120,
		surfacePreviewCloseDelayMs: 180,
		surfacePointerTravelTolerancePx: 6,
		actions: {
				insertBelow: '在下方插入',
			copy: '复制',
			comment: '评论',
			history: '生成历史',
			instruction: '指令',
			instructionPlaceholder: '让 AI 对这个块做什么？',
			instructionSubmitHint: '按 Enter 执行',
			instructionClose: '返回操作',
				drag: '拖动块',
				directEdit: '直接编辑',
				disabledNoRuntime: '编辑运行时未接入',
				listGapLabel: '在这里插入列表项',
				listGapInsertItem: '列表项',
				listGapInsertTask: '待办项',
				listGapAi: 'AI 补项',
				listGapPlaceholder: '描述这一项需要补什么（可选）',
				listGapGenerate: '生成',
				listGapCancel: '取消',
			},
			insertDraft: {
				chooserLabel: '在下方插入',
				commit: '写入为块',
				generate: 'AI 生成',
				generating: '正在生成…',
				stop: '停止',
				acceptGenerated: '接受为新块',
				generationUnavailable: 'AI 生成运行时未接入',
				generationFailed: 'AI 生成失败，请保留当前草稿后重试。',
				cancel: '取消',
				shortcutHint: '⌘↵ 写入',
				types: [
					{ id: 'paragraph', label: '段落', default: true, initialValue: '', placeholder: '输入正文，格式会即时呈现…', syntaxPrefix: '', syntaxSuffix: '', shortcut: false, mode: 'markdown' },
					{ id: 'heading', label: '标题', default: false, initialValue: '## ', placeholder: '输入标题…', syntaxPrefix: '## ', syntaxSuffix: '', shortcut: true, mode: 'markdown' },
					{ id: 'list', label: '列表', default: false, initialValue: '- ', placeholder: '输入列表项…', syntaxPrefix: '- ', syntaxSuffix: '', shortcut: true, mode: 'markdown' },
					{ id: 'task', label: '待办', default: false, initialValue: '- [ ] ', placeholder: '输入待办事项…', syntaxPrefix: '- [ ] ', syntaxSuffix: '', shortcut: true, mode: 'markdown' },
					{ id: 'quote', label: '引用', default: false, initialValue: '> ', placeholder: '输入引用内容…', syntaxPrefix: '> ', syntaxSuffix: '', shortcut: true, mode: 'markdown' },
					{ id: 'callout', label: 'Callout', default: false, initialValue: '> [!note]\n> ', placeholder: '输入提示内容…', syntaxPrefix: '> [!note]\n> ', syntaxSuffix: '', shortcut: true, mode: 'markdown' },
					{ id: 'formula', label: '公式', default: false, initialValue: '$$E = mc^2$$', placeholder: '输入 LaTeX 公式…', syntaxPrefix: '$$', syntaxSuffix: '$$', shortcut: true, mode: 'markdown' },
					{ id: 'image', label: '图片', default: false, initialValue: '![[附件.png]]', placeholder: '输入图片或附件名称…', syntaxPrefix: '![[', syntaxSuffix: ']]', shortcut: true, mode: 'markdown' },
					{ id: 'table', label: '表格', default: false, initialValue: '| 项目 | 说明 |\n| --- | --- |\n| 新项目 | 待填写 |', placeholder: '输入 Markdown 表格…', syntaxPrefix: '| 项目 | 说明 |\n| --- | --- |\n| 新项目 | 待填写 |', syntaxSuffix: '', shortcut: true, mode: 'markdown' },
					{ id: 'base', label: 'Base', default: false, initialValue: '![[新视图.base]]', placeholder: '输入 Base 文件名…', syntaxPrefix: '![[', syntaxSuffix: '.base]]', shortcut: false, mode: 'markdown' },
					{ id: 'canvas', label: 'Canvas', default: false, initialValue: '![[新画布.canvas]]', placeholder: '输入 Canvas 文件名…', syntaxPrefix: '![[', syntaxSuffix: '.canvas]]', shortcut: false, mode: 'markdown' },
					{ id: 'excalidraw', label: 'Excalidraw', default: false, initialValue: '![[新草图.excalidraw.md]]', placeholder: '输入 Excalidraw 文件名…', syntaxPrefix: '![[', syntaxSuffix: '.excalidraw.md]]', shortcut: false, mode: 'markdown' },
					{ id: 'ai', label: 'AI 续写', default: false, initialValue: '', placeholder: '描述希望 AI 在这里补充什么…', syntaxPrefix: '', syntaxSuffix: '', shortcut: false, mode: 'ai' },
				],
			},
			undo: {
			undo: '撤销',
			redo: '重做',
			committed: '改动已写入',
			undone: '已撤销',
			redone: '已重做',
			shortcutUndo: '⌘Z',
			shortcutRedo: '⇧⌘Z',
		},
		displayStates: {
			groupLabel: '文档视图',
			edit: '编辑视图',
			clean: '纯净阅读',
			nativeMarkdown: '原生 Markdown',
			reviewAll: '审阅全部改动 · {count}',
		},
		selection: {
			formats: {
				bold: '加粗',
				italic: '斜体',
				underline: '下划线',
				strikethrough: '删除线',
				link: '链接',
				textColor: '文字颜色',
				highlight: '高亮',
			},
			comment: '评论',
			pasteUrl: '粘贴 URL',
			applyLink: '应用',
			linkPlaceholder: '粘贴或输入链接…',
			clearColor: '清除',
			colorPalette: '颜色',
			customColor: '自定义颜色',
			scopeTemplates: {
				crossParagraph: '跨 {n} 个块 · {fragments} 个片段',
				crossItem: '跨 {n} 个列表项',
				crossCell: '跨 {n} 个单元格',
				crossBlock: '跨 {n} 个块 · {fragments} 个片段',
			},
			guards: {
				codeBlockRichFormat: '代码块内不支持富文本格式',
				crossStructureLink: '一个链接只能落在一个段落、列表项或单元格内',
				semanticInlineHtmlFormat: '链接、行内代码或公式不能合并进 HTML 样式，请缩小选择范围',
				emptySelection: '请先选中文本',
			},
			quickTextColors: [
				{ label: '红色', value: '#b42318' },
				{ label: '蓝色', value: '#2563eb' },
				{ label: '绿色', value: '#16845f' },
			],
			quickHighlightColors: [
				{ label: '黄色高亮', value: '#fff1a8' },
				{ label: '绿色高亮', value: '#dff4e8' },
				{ label: '红色高亮', value: '#fde4e4' },
			],
			textColors: [
				{ label: '深灰色', value: '#1f2937' },
				{ label: '紫色', value: '#7c3aed' },
				{ label: '蓝色', value: '#2563eb' },
				{ label: '棕色', value: '#b45309' },
				{ label: '红色', value: '#b42318' },
				{ label: '绿色', value: '#16845f' },
			],
			highlightColors: [
				{ label: '黄色高亮', value: '#fff1a8' },
				{ label: '绿色高亮', value: '#dff4e8' },
				{ label: '蓝色高亮', value: '#dfeaff' },
				{ label: '紫色高亮', value: '#eee5ff' },
				{ label: '红色高亮', value: '#fde4e4' },
			],
		},
		copy: {
			plain: '纯文本',
			image: '图片',
			markdown: 'Markdown',
			html: 'HTML',
			success: '复制成功',
			imageSuccess: '已下载 PNG',
			close: '关闭',
		},
		link: {
			openVault: '打开 {title}',
			openExternal: '访问 {url}',
			brokenTitle: '链接未解析',
			pathLabel: '路径',
		},
		inlineStyle: {
			removeBold: '取消加粗',
			removeItalic: '取消斜体',
			removeUnderline: '取消下划线',
			removeStrikethrough: '取消删除线',
			removeTextColor: '移除文字色',
			removeHighlight: '移除标记',
			polishSelection: '润色这个片段',
			suggestStyle: 'AI 样式建议',
			suggestBoldInstruction: '评估这处加粗是否真正承载关键结论；保留必要强调，或给出更清晰的强调位置。返回可审阅的改写。',
			suggestItalicInstruction: '评估这处斜体是否适合作为补充语气或术语强调；保留必要强调，或给出更清晰的改写。返回可审阅的改写。',
			suggestUnderlineInstruction: '评估这处下划线是否表达可执行行动；必要时改成更明确的行动表述或 checklist。返回可审阅的改写。',
			suggestStrikethroughInstruction: '判断这处删除线是否应保留为历史结论；必要时改写为清晰的已废弃说明。返回可审阅的改写。',
			suggestTextColorInstruction: '评估这处文字色是否有明确语义；保留必要颜色，或改为更一致的强调方式。返回可审阅的改写。',
			suggestHighlightInstruction: '评估这处标记是否值得保留为关键结论；保留必要重点，或建议更准确的强调范围。返回可审阅的改写。',
			unavailable: '编辑运行时未接入',
		},
		comment: {
			railBreakpointPx: 560,
			placeholder: '写下评论……',
			replyPlaceholder: '回复此评论……',
			save: '保存',
			cancel: '取消',
			stale: '锚点已失效',
			addTitle: '添加评论',
			railTitle: '评论',
			openRail: '打开评论',
			closeRail: '关闭评论',
			selectionAnchor: '文字选区',
			blockAnchor: '整个内容块',
			privateLabel: '仅自己',
			sharedLabel: '分享时公开',
			ownerLabel: '你',
			externalLabel: '外部评论',
			reply: '回复',
			resolve: '解决',
			reopen: '重新打开',
			remove: '删除评论',
			askCopilot: '交给 Copilot',
			copilotTaskTitle: '根据评论处理正文',
			empty: '当前文档还没有评论。',
		},
		history: {
			title: '该段历史',
			empty: '该块暂无历史',
			locate: '定位',
			versions: '{count} 个版本',
			accepted: '已采用',
			notAdopted: '未采用',
			pending: '待审阅',
			failed: '失败',
			cancelled: '已取消',
			restore: '恢复',
			rollback: '回滚',
			rollbackRefused: '区域已变化，无法回滚',
		},
		findings: {
			askCopilot: '问 Copilot',
			confirm: '标记已确认',
			close: '关闭',
			dismiss: '忽略',
			stale: '正文已变化，需要重新定位',
		},
	},
	table: {
		toolbar: { ...DEFAULT_TABLE_BLOCK_STRINGS.toolbar },
		selection: { ...DEFAULT_TABLE_BLOCK_STRINGS.selection },
	},
	chart: { ...DEFAULT_TABLE_BLOCK_STRINGS.chart },
};

/**
 * Load the composer config, preferring the runtime JSON template and falling
 * back to the compiled default on any failure.
 */
export async function loadComposerConfig(): Promise<ComposerConfig> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_COMPOSER_CONFIG;
		const parsed = await tm.loadJson<ComposerConfigPatch>(ConfigTemplateId.Composer);
		if (!parsed || typeof parsed !== 'object') return DEFAULT_COMPOSER_CONFIG;
		return mergeComposerConfig(parsed);
	} catch {
		return DEFAULT_COMPOSER_CONFIG;
	}
}

/** Merge a partial JSON template over the compiled, cold-start-safe fallback. */
export function mergeComposerConfig(parsed?: ComposerConfigPatch): ComposerConfig {
	if (!parsed) return DEFAULT_COMPOSER_CONFIG;
	const base = DEFAULT_COMPOSER_CONFIG;
	return {
		kinds: { ...base.kinds, ...(parsed.kinds ?? {}) },
		strings: { ...base.strings, ...(parsed.strings ?? {}) },
		chrome: mergeChrome(parsed.chrome),
		table: {
			toolbar: { ...base.table.toolbar, ...parsed.table?.toolbar },
			selection: { ...base.table.selection, ...parsed.table?.selection },
		},
		chart: { ...base.chart, ...parsed.chart },
	};
}

/** Shallow-merge the chrome section subtree over the compiled fallback. */
function mergeChrome(parsed?: Partial<ComposerChromeConfig>): ComposerChromeConfig {
	const base = DEFAULT_COMPOSER_CONFIG.chrome;
	if (!parsed) return base;
	return {
		surfacePreviewOpenDelayMs:
			parsed.surfacePreviewOpenDelayMs ?? base.surfacePreviewOpenDelayMs,
		surfaceIntentOpenDelayMs:
			parsed.surfaceIntentOpenDelayMs ?? base.surfaceIntentOpenDelayMs,
		surfacePreviewCloseDelayMs:
			parsed.surfacePreviewCloseDelayMs ?? base.surfacePreviewCloseDelayMs,
		surfacePointerTravelTolerancePx:
			parsed.surfacePointerTravelTolerancePx ?? base.surfacePointerTravelTolerancePx,
		actions: { ...base.actions, ...parsed.actions },
		insertDraft: {
			...base.insertDraft,
			...parsed.insertDraft,
			types: parsed.insertDraft?.types ?? base.insertDraft.types,
		},
		undo: { ...base.undo, ...parsed.undo },
		displayStates: { ...base.displayStates, ...parsed.displayStates },
		selection: {
			...base.selection,
			...parsed.selection,
			formats: { ...base.selection.formats, ...parsed.selection?.formats },
			scopeTemplates: { ...base.selection.scopeTemplates, ...parsed.selection?.scopeTemplates },
			guards: { ...base.selection.guards, ...parsed.selection?.guards },
			quickTextColors: parsed.selection?.quickTextColors ?? base.selection.quickTextColors,
			quickHighlightColors: parsed.selection?.quickHighlightColors ?? base.selection.quickHighlightColors,
			textColors: parsed.selection?.textColors ?? base.selection.textColors,
			highlightColors: parsed.selection?.highlightColors ?? base.selection.highlightColors,
		},
		copy: { ...base.copy, ...parsed.copy },
		link: { ...base.link, ...parsed.link },
		inlineStyle: { ...base.inlineStyle, ...parsed.inlineStyle },
		comment: { ...base.comment, ...parsed.comment },
		history: { ...base.history, ...parsed.history },
		findings: { ...base.findings, ...parsed.findings },
	};
}

/**
 * Load the WP2 transaction config (`transaction` section of composer.json).
 * Timing/grouping knobs are domain config, not code constants; this reads the
 * runtime JSON and falls back to {@link DEFAULT_TRANSACTION_CONFIG}. The app
 * layer passes the result into the Composer transaction runtime.
 */
export async function loadComposerTransactionConfig(): Promise<ComposerTransactionConfig> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_TRANSACTION_CONFIG;
		const parsed = await tm.loadJson<{ transaction?: Partial<ComposerTransactionConfig> }>(
			ConfigTemplateId.Composer,
		);
		if (!parsed || typeof parsed !== 'object' || !parsed.transaction) return DEFAULT_TRANSACTION_CONFIG;
		return { ...DEFAULT_TRANSACTION_CONFIG, ...parsed.transaction };
	} catch {
		return DEFAULT_TRANSACTION_CONFIG;
	}
}
