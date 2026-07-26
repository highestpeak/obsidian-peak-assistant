/**
 * Peak Composer — WP5 pack domain logic barrel (frontmatter + math).
 *
 * Framework-neutral (no `obsidian` import): YAML property model/writeback, Vault
 * property inventory, metadata field-patch operations/materializer/adapter, and
 * the formula parsing / copy / detail-state model + annotation materializer.
 */

// Frontmatter
export * from './frontmatter/yamlModel';
export * from './frontmatter/yamlWriteback';
export * from './frontmatter/vaultInventory';
export * from './frontmatter/metadataWriteback';

// Math
export * from './math/formulaModel';
export * from './math/formulaCopy';
export * from './math/formulaDetailModel';
export * from './math/formulaMaterializer';
