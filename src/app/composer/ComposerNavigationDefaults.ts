/**
 * Compiled cold-start fallback for Composer host navigation copy.
 *
 * This small app-bound set is intentionally separate from routing logic. It
 * mirrors `templates/config/composer.json -> navigation` and can be replaced by
 * a template-backed provider without changing the router.
 */
export interface ComposerNavigationStrings {
	openInComposer: string;
	openCurrentInComposer: string;
	openInMarkdown: string;
	openIntelligence: string;
	conversionFailed: string;
	intelligenceUnavailable: string;
	intelligenceBindFailed: string;
	openMarkdownFirst: string;
	runtimeNotReady: string;
	noAvailableLeaf: string;
}

export const DEFAULT_COMPOSER_NAVIGATION_STRINGS: ComposerNavigationStrings = {
	openInComposer: '切换到 Composer',
	openCurrentInComposer: '在 Composer 中打开',
	openInMarkdown: '切换到原生 Markdown',
	openIntelligence: '打开 Intelligence',
	conversionFailed: '无法切换文档视图，已恢复原视图。',
	intelligenceUnavailable: 'Composer Intelligence 当前不可用。',
	intelligenceBindFailed: 'Composer Intelligence 无法绑定此文档。',
	openMarkdownFirst: '请先打开一个 Markdown 文件。',
	runtimeNotReady: '无法打开 Composer：文档运行时尚未就绪。',
	noAvailableLeaf: '无法打开 Composer：没有可用的工作区标签页。',
};
