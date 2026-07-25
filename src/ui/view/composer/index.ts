/**
 * Peak Composer — UI barrel (WP1 host + WP4 editing chrome). The app-layer view
 * mounts `ComposerRoot` with an app-composed runtime; the browser harness
 * imports it directly with a mock source + in-memory runtime.
 */
export { ComposerRoot } from './ComposerRoot';
export type { ComposerRootProps } from './ComposerRoot';
export type { ComposerChromeRuntime } from './chrome/ComposerChromeContext';
export type { ComposerDisplayState } from './chrome/DisplayStateSwitch';
export { createComposerFoldStore } from './foldStore';
export type { ComposerFoldStore, ComposerFoldState } from './foldStore';
export {
	DEFAULT_COMPOSER_CONFIG,
	loadComposerConfig,
	loadComposerTransactionConfig,
	type ComposerConfig,
	type ComposerStrings,
	type ComposerChromeConfig,
} from './config/composerConfig';
