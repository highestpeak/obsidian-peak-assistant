/**
 * Peak Composer — app-layer barrel (WP1). View host, lifecycle controller,
 * Obsidian adapters, and runtime composition. This is the only composer layer
 * allowed to import `obsidian`.
 */
export { DOCUMENT_COMPOSER_VIEW_TYPE } from './viewType';
export { DocumentComposerView } from './DocumentComposerView';
export { DocumentComposerRuntime } from './DocumentComposerRuntime';
export { composeDocumentComposerRuntime } from './composeDocumentComposerRuntime';
export { NativeMarkdownIntelligenceModal } from './NativeMarkdownIntelligenceModal';
export * from './NativeMarkdownIntelligenceContext';
export { NativeMarkdownComposerAffordance } from './NativeMarkdownComposerAffordance';
export {
	ComposerDocumentRouter,
	composerViewStateForPath,
	type ComposerDocumentRouterOptions,
} from './ComposerDocumentRouter';
export {
	DocumentComposerController,
	type DocumentComposerControllerDeps,
	type ComposerLifecycleStatus,
	type DocumentComposerState,
} from './DocumentComposerController';
export {
	ObsidianComposerSourceAdapter,
	ObsidianComposerFileEventsAdapter,
	ObsidianComposerWriteAdapter,
} from './ObsidianComposerAdapters';
export { ObsidianComposerNativeFileAdapter } from './ObsidianNativeFileAdapter';
export { ObsidianComposerEmbedAnchorAdapter } from './ObsidianComposerEmbedAnchorAdapter';
export {
	composeComposerCapabilityRuntime,
	type ComposerCapabilityRuntimeFactory,
} from './capabilities/composeComposerCapabilityRuntime';
export { ComposerAiExecutorAdapter } from './capabilities/ComposerAiExecutorAdapter';
