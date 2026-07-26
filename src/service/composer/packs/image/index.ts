/**
 * Peak Composer — image pack barrel (WP7). Framework-neutral: no `obsidian`
 * imports (boundary-guarded). The app layer composes the coordinator with
 * Obsidian adapters; the UI consumes the payload schemas + dispatch ids.
 */
export * from './ports';
export * from './imageConfig';
export * from './imageNaming';
export * from './imageTransaction';
export * from './imageCaption';
export * from './imageLayout';
export * from './imageCanvas';
export * from './dispatchIds';
export * from './imageMaterializers';
export * from './imageWritebackAdapters';
export * from './imageCoordinator';
