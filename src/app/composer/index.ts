/**
 * Peak Composer — app-layer barrel (WP1). View host, lifecycle controller,
 * Obsidian adapters, and runtime composition. This is the only composer layer
 * allowed to import `obsidian`.
 */
export { DOCUMENT_COMPOSER_VIEW_TYPE } from './viewType';
export { DocumentComposerView } from './DocumentComposerView';
export { DocumentComposerRuntime } from './DocumentComposerRuntime';
export { composeDocumentComposerRuntime } from './composeDocumentComposerRuntime';
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
export {
	composeComposerCapabilityRuntime,
	type ComposerCapabilityRuntimeFactory,
} from './capabilities/composeComposerCapabilityRuntime';
export { ComposerAiExecutorAdapter } from './capabilities/ComposerAiExecutorAdapter';
