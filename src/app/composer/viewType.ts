/**
 * Peak Composer — stable view id (obsidian-free constant module).
 *
 * Kept separate from `DocumentComposerView` (which extends the Obsidian
 * `ItemView`) so tests can import the id without pulling the `obsidian`
 * runtime. The product name shown to users is "Composer"; the code name is
 * DocumentComposer to avoid collision with the Chat Studio input `Composer`
 * (handoff §4.3).
 */
export const DOCUMENT_COMPOSER_VIEW_TYPE = 'peak-document-composer-view';
