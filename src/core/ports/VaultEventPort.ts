import type { VaultFileRef, VaultFolderRef } from './VaultFileRef';

/**
 * T11R: Narrow vault-event subscription port used by indexUpdater,
 * SkillRegistry, and CascadeWorker. Wraps `app.vault.on('create'|'modify'|'delete'|'rename')`.
 *
 * `VaultEventRef` is an opaque token; service code never opens it.
 */
export type VaultEventRef = unknown;

/** Either-or union for events that may fire for files or folders. */
export type VaultEventTarget = VaultFileRef | VaultFolderRef;

export interface VaultEventPort {
	onCreate(handler: (target: VaultEventTarget) => void): VaultEventRef;
	onModify(handler: (target: VaultEventTarget) => void): VaultEventRef;
	onDelete(handler: (target: VaultEventTarget) => void): VaultEventRef;
	onRename(handler: (target: VaultEventTarget, oldPath: string) => void): VaultEventRef;
	offref(ref: VaultEventRef): void;
}
