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

/** Named swatch (Highlightr-style) for text color / highlight. */
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
	actions: {
		insertBelow: string;
		copy: string;
		comment: string;
		history: string;
		instruction: string;
		instructionPlaceholder: string;
		instructionRun: string;
		drag: string;
		directEdit: string;
		disabledNoRuntime: string;
		insertDraftPlaceholder: string;
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
		work: string;
		all: string;
		clean: string;
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
		scopeTemplates: {
			crossParagraph: string;
			crossItem: string;
			crossCell: string;
			crossBlock: string;
		};
		guards: {
			codeBlockRichFormat: string;
			crossStructureLink: string;
			emptySelection: string;
		};
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
		fixLabel: string;
		pathLabel: string;
	};
	comment: {
		placeholder: string;
		save: string;
		cancel: string;
		stale: string;
		addTitle: string;
	};
	history: {
		title: string;
		empty: string;
		locate: string;
		rollback: string;
		rollbackRefused: string;
	};
}

export interface ComposerConfig {
	/** Per-block-kind display label. */
	kinds: Record<ComposerBlockKind, string>;
	strings: ComposerStrings;
	chrome: ComposerChromeConfig;
}

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
		actions: {
			insertBelow: '在下方插入',
			copy: '复制',
			comment: '评论',
			history: '生成历史',
			instruction: '指令',
			instructionPlaceholder: '输入针对此块的指令…',
			instructionRun: '执行',
			drag: '拖动块',
			directEdit: '直接编辑',
			disabledNoRuntime: '编辑运行时未接入',
			insertDraftPlaceholder: '输入新段落内容…',
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
			groupLabel: '正文工作状态',
			work: '工作视图',
			all: '全部改动',
			clean: '纯净阅读',
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
			scopeTemplates: {
				crossParagraph: '跨 {n} 个块',
				crossItem: '跨 {n} 个列表项',
				crossCell: '跨 {n} 个单元格',
				crossBlock: '跨 {n} 个块',
			},
			guards: {
				codeBlockRichFormat: '代码块内不支持富文本格式',
				crossStructureLink: '一个链接只能落在一个段落、列表项或单元格内',
				emptySelection: '请先选中文本',
			},
			textColors: [
				{ label: '红', value: '#b42318' },
				{ label: '橙', value: '#c4520a' },
				{ label: '绿', value: '#067647' },
				{ label: '蓝', value: '#175cd3' },
				{ label: '紫', value: '#6941c6' },
			],
			highlightColors: [
				{ label: '重点', value: '#fff1a8' },
				{ label: '定义', value: '#c7f0d8' },
				{ label: '资料', value: '#cfe4ff' },
				{ label: '想法', value: '#e4d5ff' },
				{ label: '风险', value: '#ffd5d5' },
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
			fixLabel: '修复建议',
			pathLabel: '路径',
		},
		comment: {
			placeholder: '写下评论……',
			save: '保存',
			cancel: '取消',
			stale: '锚点已失效',
			addTitle: '添加评论',
		},
		history: {
			title: '生成历史',
			empty: '该块暂无历史',
			locate: '定位',
			rollback: '回滚',
			rollbackRefused: '区域已变化，无法回滚',
		},
	},
};

/**
 * Load the composer config, preferring the runtime JSON template and falling
 * back to the compiled default on any failure.
 */
export async function loadComposerConfig(): Promise<ComposerConfig> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_COMPOSER_CONFIG;
		const parsed = await tm.loadJson<Partial<ComposerConfig>>(ConfigTemplateId.Composer);
		if (!parsed || typeof parsed !== 'object') return DEFAULT_COMPOSER_CONFIG;
		return {
			kinds: { ...DEFAULT_COMPOSER_CONFIG.kinds, ...(parsed.kinds ?? {}) },
			strings: { ...DEFAULT_COMPOSER_CONFIG.strings, ...(parsed.strings ?? {}) },
			chrome: mergeChrome(parsed.chrome),
		};
	} catch {
		return DEFAULT_COMPOSER_CONFIG;
	}
}

/** Shallow-merge the chrome section subtree over the compiled fallback. */
function mergeChrome(parsed?: Partial<ComposerChromeConfig>): ComposerChromeConfig {
	const base = DEFAULT_COMPOSER_CONFIG.chrome;
	if (!parsed) return base;
	return {
		actions: { ...base.actions, ...parsed.actions },
		undo: { ...base.undo, ...parsed.undo },
		displayStates: { ...base.displayStates, ...parsed.displayStates },
		selection: {
			...base.selection,
			...parsed.selection,
			formats: { ...base.selection.formats, ...parsed.selection?.formats },
			scopeTemplates: { ...base.selection.scopeTemplates, ...parsed.selection?.scopeTemplates },
			guards: { ...base.selection.guards, ...parsed.selection?.guards },
			textColors: parsed.selection?.textColors ?? base.selection.textColors,
			highlightColors: parsed.selection?.highlightColors ?? base.selection.highlightColors,
		},
		copy: { ...base.copy, ...parsed.copy },
		link: { ...base.link, ...parsed.link },
		comment: { ...base.comment, ...parsed.comment },
		history: { ...base.history, ...parsed.history },
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
