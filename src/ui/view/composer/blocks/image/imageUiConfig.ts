/**
 * Peak Composer — image candidate UI strings (WP7, typed fallback + loader).
 *
 * Mirrors `templates/config/composer.json` → `image.ui`. Per
 * docs/conventions/configurability.md every user-facing label lives in the JSON
 * template; this module is the compiled fallback (cold-start / tests / harness).
 * No string here is ever a dispatch key. The copy is deliberately free of any
 * "program cleanup / AI candidate" internal wording (handoff §10.7).
 */

import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';

export interface ImageCandidateUiStrings {
	accept: string;
	discard: string;
	cancel: string;
	regenerate: string;
	retry: string;
	/** Rename review. */
	nameLabel: string;
	namePlaceholder: string;
	nameAria: string;
	/** AI edit. */
	editInstructionPlaceholder: string;
	editInstructionAria: string;
	generating: string;
	failed: string;
	stale: string;
	rerun: string;
	prevVariant: string;
	nextVariant: string;
	variantCounter: string;
	/** Caption. */
	captionPlaceholder: string;
	captionAria: string;
	/** Metadata line: `{w}` `{h}` `{size}` substituted. */
	dimensionsTemplate: string;
	unsupportedResult: string;
}

export const DEFAULT_IMAGE_UI_STRINGS: ImageCandidateUiStrings = {
	accept: '接受',
	discard: '丢弃',
	cancel: '取消',
	regenerate: '换一个',
	retry: '重试',
	nameLabel: '文件名',
	namePlaceholder: '输入文件名…（Enter 生成）',
	nameAria: 'Image file name',
	editInstructionPlaceholder: '描述想要的修改…（Enter 生成）',
	editInstructionAria: 'Image edit instruction',
	generating: '生成中…',
	failed: '生成失败',
	stale: '源已变化，需重新运行',
	rerun: '重新运行',
	prevVariant: '上一版本',
	nextVariant: '下一版本',
	variantCounter: '{index}/{count}',
	captionPlaceholder: '描述这张图…（Enter 生成）',
	captionAria: 'Caption instruction',
	dimensionsTemplate: '{w}×{h} · {size}',
	unsupportedResult: '暂不支持渲染此结果类型',
};

/** Substitute `{index}` / `{count}` in the variant counter template. */
export function formatImageVariantCounter(template: string, index: number, count: number): string {
	return template.replace('{index}', String(index)).replace('{count}', String(count));
}

/** Human-readable byte size (`1.2 MB`). */
export function formatByteSize(bytes: number | undefined): string {
	if (!bytes || bytes <= 0) return '—';
	const units = ['B', 'KB', 'MB', 'GB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Fill the dimensions line (`{w}×{h} · {size}`). */
export function formatDimensions(
	template: string,
	width: number | undefined,
	height: number | undefined,
	byteSize: number | undefined,
): string {
	return template
		.replace('{w}', width !== undefined ? String(width) : '—')
		.replace('{h}', height !== undefined ? String(height) : '—')
		.replace('{size}', formatByteSize(byteSize));
}

/** Load the image UI strings (JSON template first, compiled fallback otherwise). */
export async function loadImageUiStrings(): Promise<ImageCandidateUiStrings> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_IMAGE_UI_STRINGS;
		const parsed = await tm.loadJson<{ image?: { ui?: Partial<ImageCandidateUiStrings> } }>(
			ConfigTemplateId.Composer,
		);
		const section = parsed?.image?.ui;
		if (!section || typeof section !== 'object') return DEFAULT_IMAGE_UI_STRINGS;
		return { ...DEFAULT_IMAGE_UI_STRINGS, ...section };
	} catch {
		return DEFAULT_IMAGE_UI_STRINGS;
	}
}
