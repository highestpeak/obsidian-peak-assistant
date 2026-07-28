/**
 * Peak Composer — math block UI copy (WP5, typed fallback + loader).
 *
 * Mirrors `templates/config/composer.json` → `math`. Compiled fallback for
 * cold-start / tests / harness. No string here is ever a dispatch key.
 */

import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';

export interface MathDetailStrings {
	explain: string;
	split: string;
	variables: string;
	insertBelow: string;
	copy: string;
	comment: string;
	history: string;
	instruction: string;
	keep: string;
	kept: string;
	applySplit: string;
	splitApplied: string;
	close: string;
	regenerate: string;
	followUpPlaceholder: string;
	streaming: string;
	failed: string;
	applyFailed: string;
	splitUnsafe: string;
	empty: string;
	prevVariant: string;
	nextVariant: string;
	variantCounter: string;
	explainMeta: string;
	splitMeta: string;
	variablesMeta: string;
	originalFormula: string;
	splitFormula: string;
	variablesCount: string;
	notWritten: string;
	roleFallback: string;
	colSymbol: string;
	colMeaning: string;
}

export interface MathCopyStrings {
	plain: string;
	latex: string;
	html: string;
	image: string;
	copied: string;
	copyFormula: string;
}

export interface MathConfig {
	contextCharacterLimit: number;
	detail: MathDetailStrings;
	copy: MathCopyStrings;
}

export const DEFAULT_MATH_CONFIG: MathConfig = {
	contextCharacterLimit: 1200,
	detail: {
		explain: '解释公式',
		split: '拆分公式',
		variables: '变量表',
		insertBelow: '在下方插入',
		copy: '复制',
		comment: '评论',
		history: 'History',
		instruction: '指令',
		keep: '保留注释',
		kept: '已保留',
		applySplit: '应用拆分',
		splitApplied: '已应用',
		close: '关闭',
		regenerate: '重新生成',
		followUpPlaceholder: '告诉 AI 这版怎么改…',
		streaming: '生成中…',
		failed: '生成失败',
		applyFailed: '原文已变化，无法应用；请重新生成',
		splitUnsafe: '这版可以阅读，但组成项不是完整定义式，不能写回 Markdown',
		empty: '暂无内容',
		prevVariant: '上一版本',
		nextVariant: '下一版本',
		variantCounter: '{index}/{count}',
		explainMeta: '符号沿箭头展开，保留公式上下文',
		splitMeta: '原式在上，拆分后的可渲染公式在下',
		variablesMeta: '当前公式 · {count} 个变量 · 未写入 Markdown',
		originalFormula: '原公式',
		splitFormula: '拆分后',
		variablesCount: '{count} 个变量',
		notWritten: '未写入 Markdown',
		roleFallback: '变量',
		colSymbol: '符号',
		colMeaning: '含义',
	},
	copy: {
		plain: '纯文本',
		latex: 'LaTeX',
		html: 'HTML',
		image: '图片',
		copied: '已复制',
		copyFormula: '复制公式',
	},
};

/** Substitute `{index}` / `{count}` in the variant counter template. */
export function formatMathVariantCounter(template: string, index: number, count: number): string {
	return template.replace('{index}', String(index)).replace('{count}', String(count));
}

export async function loadMathConfig(): Promise<MathConfig> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_MATH_CONFIG;
		const parsed = await tm.loadJson<{ math?: Partial<MathConfig> }>(ConfigTemplateId.Composer);
		const section = parsed?.math;
		if (!section || typeof section !== 'object') return DEFAULT_MATH_CONFIG;
		return {
			contextCharacterLimit:
				typeof section.contextCharacterLimit === 'number'
					? section.contextCharacterLimit
					: DEFAULT_MATH_CONFIG.contextCharacterLimit,
			detail: { ...DEFAULT_MATH_CONFIG.detail, ...(section.detail ?? {}) },
			copy: { ...DEFAULT_MATH_CONFIG.copy, ...(section.copy ?? {}) },
		};
	} catch {
		return DEFAULT_MATH_CONFIG;
	}
}

export function formatMathCount(template: string, count: number): string {
	return template.replace('{count}', String(count));
}
