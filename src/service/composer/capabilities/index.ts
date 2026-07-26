/**
 * Peak Composer — capability runtime barrel (WP3). Framework-neutral: no
 * `obsidian` imports (boundary-guarded). The app layer composes these into
 * the document-bound runtime; the UI consumes only the core-declared ports.
 */
export * from './capabilityConfig';
export * from './registry';
export * from './applicability';
export * from './contextAssembler';
export * from './resultMaterializers';
export * from './writebackAdapters';
export * from './executorPort';
export * from './documentRuntime';
export * from './packs/prose';
export * from './packs/native';
export * from './packs/link';
