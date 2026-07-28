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
	vaultLibrary: string;
	aiSuggest: string;
	aiSuggestCount: string;
	addProperty: string;
	origin: Record<ComposerMetadataOrigin, string>;
	reviewShapeChange: string;
}

export interface FrontmatterLibraryStrings {
	title: string;
	subtitle: string;
	close: string;
	colField: string;
	colCoverage: string;
	colIssue: string;
	colAdd: string;
	alreadyPresent: string;
	add: string;
	typeConflict: string;
	rare: string;
	customTitle: string;
	customSubtitle: string;
	keyPlaceholder: string;
	valuePlaceholder: string;
	addToDoc: string;
	footer: string;
	statFields: string;
	statTags: string;
	statSingle: string;
	statConflict: string;
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
	suggestions: FrontmatterSuggestionStrings;
}

export const DEFAULT_FRONTMATTER_CONFIG: FrontmatterConfig = {
	grid: {
		issueWarning: '属性告警',
		vaultLibrary: '属性库',
		aiSuggest: 'AI 属性建议',
		aiSuggestCount: 'AI 属性建议 · {count}',
		addProperty: '添加属性',
		origin: { program: '程序', human: '人工', ai: 'AI 建议', convention: '规范建议' },
		reviewShapeChange: '该改动会改变字段类型，请确认后再写入',
	},
	library: {
		title: 'Vault 属性库',
		subtitle: '全知识库字段与标签统计 · 选择后只在当前文档生成候选',
		close: '关闭属性库',
		colField: '字段',
		colCoverage: '覆盖率',
		colIssue: '发现的问题',
		colAdd: '加入本文',
		alreadyPresent: '已在本文',
		add: '添加',
		typeConflict: '类型不一致',
		rare: '单次使用',
		customTitle: '自定义属性',
		customSubtitle: '任意 key / value；先生成候选，不静默写入 YAML',
		keyPlaceholder: 'key，例如 cssclasses',
		valuePlaceholder: 'value，例如 wide-page',
		addToDoc: '添加到本文',
		footer: '统计范围是整个 Vault；入口跟随当前 Frontmatter，只把选中的字段作为本文候选。',
		statFields: '个字段',
		statTags: '个标签',
		statSingle: '个单次字段',
		statConflict: '处类型不一致',
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
			suggestions: { ...DEFAULT_FRONTMATTER_CONFIG.suggestions, ...(section.suggestions ?? {}) },
		};
	} catch {
		return DEFAULT_FRONTMATTER_CONFIG;
	}
}
