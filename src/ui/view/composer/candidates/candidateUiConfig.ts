/**
 * Peak Composer — candidate UI strings (WP3, typed fallback + loader).
 *
 * Mirrors `templates/config/composer.json` → `capabilities.candidateUi`. Per
 * docs/conventions/configurability.md every user-facing label lives in the
 * JSON template; this module is the compiled fallback (cold-start / tests /
 * harness). None of these strings is ever a dispatch key.
 */

import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';

export interface CandidateUiStrings {
	accept: string;
	discard: string;
	regenerate: string;
	cancel: string;
	retry: string;
	instructionPlaceholder: string;
	instructionAria: string;
	streaming: string;
	failed: string;
	stale: string;
	/** Action label for re-running a stale candidate against the current source. */
	rerun: string;
	acceptDisabledStreaming: string;
	prevVariant: string;
	nextVariant: string;
	/** `{index}` / `{count}` are substituted at render time. */
	variantCounter: string;
	unsupportedResult: string;
	/** Label used when the producing capability is unavailable to a specialized runtime. */
	draftActionFallback: string;
	draftTitle: string;
	streamingTitle: string;
	/** `{action}`, `{index}` and `{count}` are substituted by the review footer. */
	draftMeta: string;
	/** `{action}`, `{index}` and `{count}` are substituted by the review footer. */
	streamingMeta: string;
}

export const DEFAULT_CANDIDATE_UI_STRINGS: CandidateUiStrings = {
	accept: '接受',
	discard: '丢弃',
	regenerate: '重新生成',
	cancel: '取消',
	retry: '重试',
	instructionPlaceholder: '告诉 AI 这版怎么改…',
	instructionAria: '告诉 AI 这版怎么改',
	streaming: '生成中…',
	failed: '生成失败',
	stale: '源已变化，需重新运行',
	rerun: '重新运行',
	acceptDisabledStreaming: '生成完成后才能接受',
	prevVariant: '上一版本',
	nextVariant: '下一版本',
	variantCounter: '{index}/{count}',
	unsupportedResult: '暂不支持渲染此结果类型',
	draftActionFallback: '当前草稿',
	draftTitle: 'AI 草稿',
	streamingTitle: 'AI 生成中…',
	draftMeta: '{action} · 版本 {index}/{count} · 未写入 Markdown',
	streamingMeta: '{action} · 正在流式生成版本 {index}/{count} · 未写入 Markdown',
};

/** Substitute `{index}` / `{count}` in the variant counter template. */
export function formatVariantCounter(template: string, index: number, count: number): string {
	return template.replace('{index}', String(index)).replace('{count}', String(count));
}

export function formatCandidateMeta(template: string, action: string, index: number, count: number): string {
	return template
		.replace('{action}', action)
		.replace('{index}', String(index))
		.replace('{count}', String(count));
}

/** Load the candidate UI strings (JSON template first, compiled fallback otherwise). */
export async function loadCandidateUiStrings(): Promise<CandidateUiStrings> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_CANDIDATE_UI_STRINGS;
		const parsed = await tm.loadJson<{ capabilities?: { candidateUi?: Partial<CandidateUiStrings> } }>(
			ConfigTemplateId.Composer,
		);
		const section = parsed?.capabilities?.candidateUi;
		if (!section || typeof section !== 'object') return DEFAULT_CANDIDATE_UI_STRINGS;
		return { ...DEFAULT_CANDIDATE_UI_STRINGS, ...section };
	} catch {
		return DEFAULT_CANDIDATE_UI_STRINGS;
	}
}
