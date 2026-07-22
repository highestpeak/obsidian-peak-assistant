// Composition root for the structured-artifact vault-writer port
// (Chat Studio zero-gap Track D, 2026-07-21). Called once from app-owned
// code — service / UI never instantiate the concrete adapter directly.

import type { App } from 'obsidian';
import type { ArtifactVaultWriterPort } from '@/core/ports/ArtifactVaultWriterPort';
import { AppArtifactVaultWriterAdapter } from './AppArtifactVaultWriterAdapter';

export function composeArtifactVaultWriter(app: App): ArtifactVaultWriterPort {
	return new AppArtifactVaultWriterAdapter(app);
}
