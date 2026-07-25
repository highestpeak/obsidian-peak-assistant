/**
 * Peak Composer — read-only UI barrel (WP1). The app-layer view mounts
 * `ComposerRoot`; the browser harness imports it directly with a mock source.
 */
export { ComposerRoot } from './ComposerRoot';
export type { ComposerRootProps } from './ComposerRoot';
export { createComposerFoldStore } from './foldStore';
export type { ComposerFoldStore, ComposerFoldState } from './foldStore';
export {
	DEFAULT_COMPOSER_CONFIG,
	loadComposerConfig,
	loadComposerTransactionConfig,
	type ComposerConfig,
	type ComposerStrings,
} from './config/composerConfig';
