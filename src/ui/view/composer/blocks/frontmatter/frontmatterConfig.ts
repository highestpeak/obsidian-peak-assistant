/**
 * Peak Composer — frontmatter block UI copy (WP5, typed fallback + loader).
 *
 * Mirrors `templates/config/composer.json` → `frontmatter`. Per
 * docs/conventions/configurability.md every user-facing label lives in the JSON
 * template; this compiled fallback is the cold-start / test / harness default.
 * None of these strings is ever a dispatch key.
 */

import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import type { ComposerMetadataOrigin } from '@/core/schemas/composer';

export interface FrontmatterGridStrings {
	issueWarning: string;
	aiSuggest: string;
	addProperty: string;
	origin: Record<ComposerMetadataOrigin, string>;
	reviewShapeChange: string;
}

export interface FrontmatterLibraryStrings {
	title: string;
	subtitle: string;
	close: string;
	unavailable: string;
	alreadyPresent: string;
	searchPlaceholder: string;
	loading: string;
	loadFailed: string;
	recommendedTitle: string;
	searchResultsTitle: string;
	allTitle: string;
	noResults: string;
	createProperty: string;
	customCandidateHint: string;
	browseAll: string;
	showRecommended: string;
	showSystemFields: string;
	hideSystemFields: string;
	usedInNotes: string;
	typeConflict: string;
	rare: string;
	valuePlaceholder: string;
	addToDoc: string;
	cancel: string;
	commitFailed: string;
}

export interface FrontmatterPickerConfig {
	defaultResultLimit: number;
	searchResultLimit: number;
	hiddenFieldPrefixes: string[];
	hiddenFieldKeys: string[];
	listValueSeparator: string;
}

export interface FrontmatterSuggestionStrings {
	title: string;
	subtitle: string;
	close: string;
	add: string;
	reject: string;
	empty: string;
	streaming: string;
	footer: string;
	candidateTitle: string;
	candidateTagTitle: string;
	candidateDescription: string;
	accept: string;
	restore: string;
	retry: string;
	failed: string;
	stale: string;
}

export interface FrontmatterConfig {
	grid: FrontmatterGridStrings;
	library: FrontmatterLibraryStrings;
	picker: FrontmatterPickerConfig;
	suggestions: FrontmatterSuggestionStrings;
}

export const DEFAULT_FRONTMATTER_CONFIG: FrontmatterConfig = {
	grid: {
		issueWarning: '属性告警',
		aiSuggest: 'AI 建议',
		addProperty: '添加属性',
		origin: { program: '程序', human: '人工', ai: 'AI 建议', convention: '规范建议' },
		reviewShapeChange: '该改动会改变字段类型，请确认后再写入',
	},
	library: {
		title: '添加属性',
		subtitle: '搜索或创建当前文档需要的属性',
		close: '关闭属性选择器',
		unavailable: '当前无法读取或写入 Vault 属性',
		alreadyPresent: '已在本文',
		searchPlaceholder: '搜索或创建属性…',
		loading: '正在读取 Vault 属性…',
		loadFailed: '无法读取 Vault 属性，请关闭后重试',
		recommendedTitle: 'Vault 常用属性',
		searchResultsTitle: '搜索结果',
		allTitle: '全部可添加属性',
		noResults: '没有匹配的可添加属性',
		createProperty: '创建属性“{key}”',
		customCandidateHint: '将在当前 Frontmatter 中生成候选',
		browseAll: '浏览全部 {count} 个属性',
		showRecommended: '返回常用属性',
		showSystemFields: '显示系统字段',
		hideSystemFields: '隐藏系统字段',
		usedInNotes: '{count} 篇文档使用',
		typeConflict: '类型不一致',
		rare: '单次使用',
		valuePlaceholder: '输入属性值',
		addToDoc: '添加到本文',
		cancel: '取消',
		commitFailed: '属性没有写入，请检查文档是否已变化后重试',
	},
	picker: {
		defaultResultLimit: 8,
		searchResultLimit: 24,
		hiddenFieldPrefixes: ['hub_', 'peak_'],
		hiddenFieldKeys: ['created', 'updated', 'modified', 'date created', 'date modified'],
		listValueSeparator: ',',
	},
	suggestions: {
		title: 'AI 属性建议',
		subtitle: '根据正文与 Vault 关系生成 · 逐条选择',
		close: '关闭 AI 属性建议',
		add: '添加',
		reject: '忽略',
		empty: '暂无建议',
		streaming: '生成中…',
		footer: 'AI 只建议字段和值；点击“添加”后还要在 Frontmatter 中确认。',
		candidateTitle: '补全属性',
		candidateTagTitle: '补标签',
		candidateDescription: '候选直接标在对应 Frontmatter 字段中',
		accept: '接受',
		restore: '还原',
		retry: '重试',
		failed: '生成失败，请重试',
		stale: '原文已变化，请重新生成',
	},
};

export async function loadFrontmatterConfig(): Promise<FrontmatterConfig> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_FRONTMATTER_CONFIG;
		const parsed = await tm.loadJson<{ frontmatter?: Partial<FrontmatterConfig> }>(ConfigTemplateId.Composer);
		const section = parsed?.frontmatter;
		if (!section || typeof section !== 'object') return DEFAULT_FRONTMATTER_CONFIG;
		return {
			grid: { ...DEFAULT_FRONTMATTER_CONFIG.grid, ...(section.grid ?? {}) },
			library: { ...DEFAULT_FRONTMATTER_CONFIG.library, ...(section.library ?? {}) },
			picker: { ...DEFAULT_FRONTMATTER_CONFIG.picker, ...(section.picker ?? {}) },
			suggestions: { ...DEFAULT_FRONTMATTER_CONFIG.suggestions, ...(section.suggestions ?? {}) },
		};
	} catch {
		return DEFAULT_FRONTMATTER_CONFIG;
	}
}
