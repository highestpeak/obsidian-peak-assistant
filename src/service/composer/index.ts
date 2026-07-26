/**
 * Peak Composer — service-layer barrel (parser, session, revision, identity,
 * ports). Framework-neutral: no `obsidian` imports (boundary-guarded).
 */
export * from './ports';
export * from './documentParser';
export * from './blockIdentity';
export * from './sourceRevisionService';
export * from './documentSession';
export * from './transactionEngine';
export * from './candidateStore';
export * from './historyStore';
export * from './undoRedoStore';
export * from './transactionHub';
export * from './capabilities';

// WP9 — Intelligence Sidecar runtime (finding identity, Copilot session
// lifecycle, related materials, telemetry). Framework-neutral and node-tested.
export * from './intelligence';

// WP4 — editing chrome service logic (selection formatting, clipboard, comments,
// link preview). Framework-neutral and node-tested.
export * from './selection/formattingSyntax';
export * from './selection/markSerializer';
export * from './selection/linkOps';
export * from './selection/partitionSelection';
export * from './clipboard/easyCopy';
export * from './directEdit';
export * from './blockOps';
export * from './comment/commentModel';
export * from './comment/commentStore';
export * from './linkPreview/linkPreviewModel';
export * from './render/inlineRuns';

// WP8 — native objects (Code / Mermaid / Base / Canvas / Excalidraw) + link
// analysis. Framework-neutral parse/patch/preview cores; no obsidian imports.
export * from './packs/native';
export * from './packs/link';

// WP6 — table + chart packs (model, HTML port, object selection, block ops) and
// their capability plumbing (typed table-patch / chart-source).
export * from './packs/table';
export * from './packs/chart';
export * from './capabilities/packs/table';
export * from './capabilities/packs/chart';
// WP5 — frontmatter + math pack domain logic.
export * from './packs';
// WP7 — image pack (paste/rename transaction, converter geometry, caption,
// multi-image layout, media-edit coordinator). Framework-neutral + node-tested.
export * from './packs/image';
export * from './capabilities/packs/image';
