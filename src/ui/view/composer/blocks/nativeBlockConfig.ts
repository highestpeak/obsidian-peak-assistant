/**
 * Peak Composer — native block UI copy (WP8). Typed fallback + loader for the
 * top-level `native` key of templates/config/composer.json. Per
 * docs/conventions/configurability.md, every user-facing label (preview/source
 * toggle, empty/unsupported reasons, summary suffixes) is domain config data —
 * the render components read everything through {@link NativeBlockStrings} and
 * never hardcode a label.
 */

import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';

export interface NativeBlockStrings {
	/** Header toggle: rendered preview. */
	preview: string;
	/** Header toggle: raw source. */
	source: string;
	openOriginal: string;
	sourceReference: string;
	codeLabel: string;
	codeSourceTitle: string;
	mermaidLabel: string;
	mermaidTitle: string;
	baseLabel: string;
	baseDescription: string;
	canvasLabel: string;
	canvasDescription: string;
	excalidrawLabel: string;
	excalidrawDescription: string;
	embedLabel: string;
	attachmentLabel: string;
	explainSource: string;
	explainSourceInstruction: string;
	anchorResolved: string;
	anchorMissing: string;
	vaultAttachment: string;
	pagesSuffix: string;
	/** Base preview. */
	baseViewsLabel: string;
	baseColumnsLabel: string;
	baseFiltersLabel: string;
	baseFormulasLabel: string;
	baseInvalid: string;
	/** Canvas preview. */
	canvasNodesLabel: string;
	canvasEdgesLabel: string;
	canvasInvalid: string;
	/** Excalidraw preview. */
	excalidrawElementsLabel: string;
	excalidrawTextLabel: string;
	excalidrawUnsupported: string;
	/** Embed preview. */
	embedOpenLabel: string;
	embedBroken: string;
	nativeLoading: string;
	nativeMissing: string;
	nativeError: string;
	nativeReload: string;
	/** Mermaid preview. */
	mermaidRenderError: string;
	mermaidEmpty: string;
	/** Generic. */
	linesSuffix: string;
	copySource: string;
	copied: string;
}

export const DEFAULT_NATIVE_BLOCK_STRINGS: NativeBlockStrings = {
	preview: '预览',
	source: '源码',
	openOriginal: '打开原文件',
	sourceReference: '来源',
	codeLabel: '代码',
	codeSourceTitle: '源代码',
	mermaidLabel: 'Mermaid',
	mermaidTitle: '流程图',
	baseLabel: 'Base',
	baseDescription: '基于 Vault 数据的结构化视图',
	canvasLabel: 'Canvas',
	canvasDescription: '可视化节点与连线',
	excalidrawLabel: 'Excalidraw',
	excalidrawDescription: '可编辑白板场景',
	embedLabel: '嵌入',
	attachmentLabel: '附件',
	explainSource: '解释源格式',
	explainSourceInstruction: '解释这段源代码的格式、结构和关键逻辑，不修改原文。',
	anchorResolved: '锚点已解析',
	anchorMissing: '锚点未解析',
	vaultAttachment: 'Vault 附件',
	pagesSuffix: '页',
	baseViewsLabel: '视图',
	baseColumnsLabel: '列',
	baseFiltersLabel: '过滤',
	baseFormulasLabel: '公式',
	baseInvalid: '无法解析此 Base 视图',
	canvasNodesLabel: '节点',
	canvasEdgesLabel: '连线',
	canvasInvalid: '无法解析此 Canvas',
	excalidrawElementsLabel: '元素',
	excalidrawTextLabel: '文本',
	excalidrawUnsupported: '此 Excalidraw 图当前不可预览',
	embedOpenLabel: '打开',
	embedBroken: '嵌入目标缺失',
	nativeLoading: '正在加载嵌入目标…',
	nativeMissing: '嵌入目标缺失',
	nativeError: '嵌入目标读取失败',
	nativeReload: '重新加载',
	mermaidRenderError: '图表渲染失败，已显示源码',
	mermaidEmpty: '空图表',
	linesSuffix: '行',
	copySource: '复制源码',
	copied: '已复制',
};

export type NativeBlockStringsProvider = () => NativeBlockStrings;

interface NativeJson {
	native?: Partial<NativeBlockStrings>;
}

/** Load the native block strings, preferring the JSON template. Never throws. */
export async function loadNativeBlockStrings(): Promise<NativeBlockStrings> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_NATIVE_BLOCK_STRINGS;
		const parsed = await tm.loadJson<NativeJson>(ConfigTemplateId.Composer);
		const section = parsed?.native;
		if (!section || typeof section !== 'object') return DEFAULT_NATIVE_BLOCK_STRINGS;
		return { ...DEFAULT_NATIVE_BLOCK_STRINGS, ...section };
	} catch {
		return DEFAULT_NATIVE_BLOCK_STRINGS;
	}
}
