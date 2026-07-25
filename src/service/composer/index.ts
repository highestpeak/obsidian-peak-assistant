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
