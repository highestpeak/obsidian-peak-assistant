/**
 * Peak Composer — capability runtime config (WP3).
 *
 * Typed fallback + loader for the `capabilities` section of
 * `templates/config/composer.json`. Per docs/conventions/configurability.md,
 * every user-facing label (action titles, disabled reasons, history labels)
 * and every knob (context window size) is domain config data living in the
 * JSON template; this module is the documented compiled fallback used at
 * cold-start / in tests. Drift guard: test/composer-capability-registry.test.ts
 * asserts the JSON covers every registered capability.
 *
 * No presentation string in this file is ever used for dispatch — dispatch is
 * by capability / renderer / adapter ID only.
 */

import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import type { ComposerCapabilityPresentation } from '@/core/composer';

/** Runtime-level strings (guard/disabled reasons surfaced via descriptors). */
export interface ComposerCapabilityRuntimeStrings {
	/** Disabled reason when the frozen snapshot's revision drifted from the live doc. */
	staleSnapshot: string;
	/** Disabled reason when the target has no content to operate on. */
	emptyTarget: string;
	/** Failure text recorded when a run is cancelled by the user. */
	runCancelled: string;
	/** Generic failure text when a run errors without a message. */
	runFailed: string;
	/** Disabled reason when the native object file cannot be edited (no native-file port). */
	nativeUnavailable: string;
}

export interface ComposerCapabilityContextPolicy {
	/** Bounded window (chars) of source captured before/after the target. */
	nearbyChars: number;
}

export interface ComposerCapabilitiesConfig {
	context: ComposerCapabilityContextPolicy;
	/** Per-capability presentation, keyed by the definition's configKey (= stable id). */
	actions: Record<string, Partial<ComposerCapabilityPresentation>>;
	/** Preset instruction used when a block-row quick action is invoked without custom text. */
	instructions: Record<string, string>;
	strings: ComposerCapabilityRuntimeStrings;
}

/** Compiled fallback — mirrors templates/config/composer.json `capabilities`. */
export const DEFAULT_COMPOSER_CAPABILITIES_CONFIG: ComposerCapabilitiesConfig = {
	context: { nearbyChars: 800 },
	actions: {
		'composer.prose.polish': {
			title: 'Polish text',
			description: 'Improve clarity and style without changing meaning',
			lucideIcon: 'sparkles',
			historyLabel: 'AI polish',
			order: 10,
		},
		'composer.prose.polish-block': {
			title: '润色文本',
			description: '改善当前段落的表达顺序、语气与连接',
			lucideIcon: 'sparkles',
			historyLabel: 'AI 润色',
			order: 10,
		},
		'composer.prose.add-example': {
			title: '补一个例子',
			description: '补充一个贴近当前语境的具体例子',
			lucideIcon: 'lightbulb',
			historyLabel: 'AI 补例',
			order: 11,
		},
		'composer.prose.to-table': {
			title: '转成表格',
			description: '把并列概念整理为可继续编辑的 Markdown 表格',
			lucideIcon: 'table',
			historyLabel: 'AI 转表格',
			order: 12,
		},
		'composer.heading.shorten': {
			title: '改短标题',
			description: '生成更短、更像目录项的标题',
			lucideIcon: 'heading',
			historyLabel: 'AI 改标题',
			order: 10,
		},
		'composer.heading.outline': {
			title: '补提纲',
			description: '根据标题补出下一层写作提纲',
			lucideIcon: 'list-tree',
			historyLabel: 'AI 补提纲',
			order: 11,
		},
		'composer.heading.questions': {
			title: '生成导读问题',
			description: '把标题转成这一节需要回答的问题',
			lucideIcon: 'circle-help',
			historyLabel: 'AI 导读问题',
			order: 12,
		},
		'composer.list.fill-gaps': {
			title: '补缺项',
			description: '检查列表遗漏并补出可插入的新项',
			lucideIcon: 'list-plus',
			historyLabel: 'AI 补列表',
			order: 10,
		},
		'composer.list.reorder': {
			title: '重排列表',
			description: '按当前语义重新排列列表项',
			lucideIcon: 'arrow-up-down',
			historyLabel: 'AI 重排列表',
			order: 11,
		},
		'composer.list.to-table': {
			title: '转成表格',
			description: '把并列列表转换为 Markdown 表格',
			lucideIcon: 'table',
			historyLabel: 'AI 列表转表格',
			order: 12,
		},
		'composer.task.find-blockers': {
			title: '找阻塞',
			description: '标出不清晰、不可执行或等待依赖的任务',
			lucideIcon: 'octagon-alert',
			historyLabel: 'AI 找阻塞',
			order: 10,
		},
		'composer.task.add-next-step': {
			title: '补下一步',
			description: '为每个任务补一个最小可执行下一步',
			lucideIcon: 'list-checks',
			historyLabel: 'AI 补下一步',
			order: 11,
		},
		'composer.task.prioritize': {
			title: '按优先级重排',
			description: '按影响与紧急度重排任务列表',
			lucideIcon: 'arrow-up-down',
			historyLabel: 'AI 任务排序',
			order: 12,
		},
		'composer.quote.explain': {
			title: '解释引用',
			description: '解释引用在当前上下文中的作用',
			lucideIcon: 'quote',
			historyLabel: 'AI 解释引用',
			order: 10,
		},
		'composer.quote.counterexample': {
			title: '找反例',
			description: '补充可能反驳该观点的反例或边界',
			lucideIcon: 'scale',
			historyLabel: 'AI 找反例',
			order: 11,
		},
		'composer.quote.to-callout': {
			title: '转 Callout',
			description: '转换为 Obsidian Callout 并保留原句',
			lucideIcon: 'message-square-warning',
			historyLabel: 'AI 转 Callout',
			order: 12,
		},
		'composer.callout.change-type': {
			title: '改 Callout 类型',
			description: '选择更贴合内容语气的 Callout 类型',
			lucideIcon: 'badge-info',
			historyLabel: 'AI 改 Callout',
			order: 10,
		},
		'composer.callout.expand': {
			title: '扩写原则',
			description: '把提示扩成可执行的写作规则',
			lucideIcon: 'text',
			historyLabel: 'AI 扩写原则',
			order: 11,
		},
		'composer.callout.to-checklist': {
			title: '生成检查项',
			description: '把提示转换为可验证的 Markdown 任务清单',
			lucideIcon: 'list-checks',
			historyLabel: 'AI 生成检查项',
			order: 12,
		},
		'composer.frontmatter.suggest-tags': {
			title: '补标签',
			description: '根据正文补全可复用标签并保留原 YAML 结构',
			lucideIcon: 'tag',
			historyLabel: 'AI 补标签',
			order: 41,
		},
		'composer.frontmatter.normalize-properties': {
			title: '规范属性',
			description: '检查字段格式与值的一致性',
			lucideIcon: 'list-checks',
			historyLabel: 'AI 规范属性',
			order: 42,
		},
	},
	instructions: {
		'composer.prose.polish-block': '优化表达顺序、语气和连接词，保持原意与 Markdown 段落形态。',
		'composer.prose.add-example': '补一个贴近当前上下文的具体例子，让内容不只停留在抽象原则。',
		'composer.prose.to-table': '把并列概念、阶段或路径整理成 Markdown 表格，保留原信息并便于后续编辑。',
		'composer.heading.shorten': '把标题改得更短、更像目录项，保留原来的 heading 层级。',
		'composer.heading.outline': '根据当前标题生成下一层写作提纲，输出仍作为当前块的完整替换内容。',
		'composer.heading.questions': '把标题转成 2 到 3 个导读问题，作为这一节的写作目标。',
		'composer.list.fill-gaps': '检查列表是否遗漏重要类别，并补出必要的新 bullet。',
		'composer.list.reorder': '按最清晰的逻辑顺序重排列表，保持合法 Markdown 列表语法。',
		'composer.list.to-table': '把当前列表转换为 Markdown 表格，保留全部信息。',
		'composer.task.find-blockers': '把任务区分为可执行、受阻和待确认，并明确阻塞原因。',
		'composer.task.add-next-step': '为每个任务补一个最小可执行下一步，保持 Markdown task list 语法。',
		'composer.task.prioritize': '按影响和紧急度重排任务，保持完成状态不变。',
		'composer.quote.explain': '解释这段引用在当前文档里的作用，并保留引用内容与引用语法。',
		'composer.quote.counterexample': '补充一个可能反驳该观点的反例或适用边界。',
		'composer.quote.to-callout': '把引用转换为合适的 Obsidian Callout，并保留原句。',
		'composer.callout.change-type': '把 Callout 类型改成更贴合内容语气的类型，保留正文。',
		'composer.callout.expand': '把当前原则扩写为一条可执行的写作规则。',
		'composer.callout.to-checklist': '把 Callout 转换成可验证的 Markdown task list。',
		'composer.frontmatter.suggest-tags': '只建议 tags 字段；根据标题和正文补全可复用标签，保留原始 YAML 结构。',
		'composer.frontmatter.normalize-properties': '检查 created、updated、tags、type、status 等字段的格式一致性；不要改写程序维护字段。',
	},
	strings: {
		staleSnapshot: 'Document changed — reopen the action to continue',
		emptyTarget: 'Nothing to work on in this block',
		runCancelled: 'Generation cancelled',
		runFailed: 'Generation failed',
		nativeUnavailable: 'This native object cannot be edited here',
	},
};

/** A getter so late-loading config reaches long-lived runtimes without rebuild. */
export type ComposerCapabilitiesConfigProvider = () => ComposerCapabilitiesConfig;

/**
 * Load the capabilities config, preferring the runtime JSON template and
 * falling back to the compiled default on any failure (same contract as
 * `loadComposerConfig`).
 */
export async function loadComposerCapabilitiesConfig(): Promise<ComposerCapabilitiesConfig> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_COMPOSER_CAPABILITIES_CONFIG;
		const parsed = await tm.loadJson<{ capabilities?: Partial<ComposerCapabilitiesConfig> }>(
			ConfigTemplateId.Composer,
		);
		const section = parsed?.capabilities;
		if (!section || typeof section !== 'object') return DEFAULT_COMPOSER_CAPABILITIES_CONFIG;
		return {
			context: { ...DEFAULT_COMPOSER_CAPABILITIES_CONFIG.context, ...(section.context ?? {}) },
			actions: { ...DEFAULT_COMPOSER_CAPABILITIES_CONFIG.actions, ...(section.actions ?? {}) },
			instructions: {
				...DEFAULT_COMPOSER_CAPABILITIES_CONFIG.instructions,
				...(section.instructions ?? {}),
			},
			strings: { ...DEFAULT_COMPOSER_CAPABILITIES_CONFIG.strings, ...(section.strings ?? {}) },
		};
	} catch {
		return DEFAULT_COMPOSER_CAPABILITIES_CONFIG;
	}
}

/** Resolve the effective presentation for one definition (config over fallback). */
export function resolvePresentation(
	config: ComposerCapabilitiesConfig,
	configKey: string,
	fallback: ComposerCapabilityPresentation,
): ComposerCapabilityPresentation {
	const override = config.actions[configKey];
	if (!override) return fallback;
	return { ...fallback, ...override };
}
