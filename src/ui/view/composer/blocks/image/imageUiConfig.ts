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
import { DEFAULT_IMAGE_ACTION_STRINGS, type ImageActionStrings } from '@/service/composer';

export interface ImageCandidateUiStrings {
	loadFailed: string;
	sourceUnavailable: string;
	fullscreen: string;
	editImage: string;
	rename: string;
	copy: string;
	renamePlaceholder: string;
	renameAria: string;
	renameApply: string;
	lightbox: {
		label: string;
		zoomOut: string;
		zoomIn: string;
		actualSize: string;
		fit: string;
		toggleStrip: string;
		close: string;
		previous: string;
		next: string;
		thumbnail: string;
	};
	converter: {
		title: string;
		crop: string;
		freeCrop: string;
		clearFreeCrop: string;
		freeCropHint: string;
		rotateLeft: string;
		rotateRight: string;
		flipHorizontal: string;
		flipVertical: string;
		straighten: string;
		format: string;
		quality: string;
		stripMetadata: string;
		reset: string;
		cancel: string;
		apply: string;
		converting: string;
		failed: string;
	};
	layoutTitle: string;
	layoutDescription: string;
	layoutSource: string;
	layoutModeAria: string;
	layoutModes: { grid: string; hero: string; strip: string; story: string };
	editingRequired: string;
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
	loadFailed: '图片加载失败',
	sourceUnavailable: '图片源不可用',
	fullscreen: '全屏',
	editImage: '编辑图片',
	rename: '重命名',
	copy: '复制',
	renamePlaceholder: '输入新的图片文件名…',
	renameAria: '图片文件名',
	renameApply: '生成重命名预览',
	lightbox: {
		label: '图片查看器',
		zoomOut: '缩小',
		zoomIn: '放大',
		actualSize: '恢复实际大小',
		fit: '适合窗口',
		toggleStrip: '显示或隐藏缩略图',
		close: '关闭图片查看器',
		previous: '上一张',
		next: '下一张',
		thumbnail: '查看第 {index} 张图片',
	},
	converter: {
		title: '编辑图片',
		crop: '矩形裁剪',
		freeCrop: '自由裁剪',
		clearFreeCrop: '清除选区',
		freeCropHint: '沿图片拖动以绘制自由裁剪区域',
		rotateLeft: '左转',
		rotateRight: '右转',
		flipHorizontal: '水平翻转',
		flipVertical: '垂直翻转',
		straighten: '校正',
		format: '格式',
		quality: '质量',
		stripMetadata: '导出时移除 EXIF 与其他元数据',
		reset: '重置',
		cancel: '取消',
		apply: '生成预览',
		converting: '处理中…',
		failed: '图片转换失败',
	},
	layoutTitle: '图片组合',
	layoutDescription: 'HTML Block · Markdown Preview 可见',
	layoutSource: 'HTML source',
	layoutModeAria: '图片组合布局',
	layoutModes: { grid: '网格', hero: '主图', strip: '横排', story: '叙事' },
	editingRequired: '需编辑权限',
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

/** Load the image object-action titles (`image.actions`; typed fallback otherwise). */
export async function loadImageActionStrings(): Promise<ImageActionStrings> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_IMAGE_ACTION_STRINGS;
		const parsed = await tm.loadJson<{ image?: { actions?: Partial<ImageActionStrings> } }>(
			ConfigTemplateId.Composer,
		);
		const section = parsed?.image?.actions;
		if (!section || typeof section !== 'object') return DEFAULT_IMAGE_ACTION_STRINGS;
		return { ...DEFAULT_IMAGE_ACTION_STRINGS, ...section };
	} catch {
		return DEFAULT_IMAGE_ACTION_STRINGS;
	}
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
