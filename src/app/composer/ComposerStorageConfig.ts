/**
 * Peak Composer machine-data storage policy.
 *
 * Mirrors `templates/config/composer.json#storage`. Paths are relative to the
 * configured Peak Assistant DataStore; the plugin installation/source
 * directory is never a valid canonical data root.
 */

import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';

export interface ComposerStorageConfig {
	commentsSubdir: string;
	workspaceStateSubdir: string;
	workspaceStateFile: string;
	telemetrySubdir: string;
	telemetryFile: string;
	workspaceCompactionEventThreshold: number;
	telemetryRotationBytes: number;
	telemetryRetentionFiles: number;
}

export const DEFAULT_COMPOSER_STORAGE_CONFIG: ComposerStorageConfig = {
	commentsSubdir: 'composer/comments',
	workspaceStateSubdir: 'records/composer/workspaces',
	workspaceStateFile: 'current.jsonl',
	telemetrySubdir: 'telemetry/composer',
	telemetryFile: 'composer-intelligence.jsonl',
	workspaceCompactionEventThreshold: 200,
	telemetryRotationBytes: 1_048_576,
	telemetryRetentionFiles: 14,
};

interface ComposerConfigShape {
	storage?: Partial<ComposerStorageConfig>;
}

export async function loadComposerStorageConfig(): Promise<ComposerStorageConfig> {
	try {
		const manager = TemplateManager.getInstance();
		if (!manager) return DEFAULT_COMPOSER_STORAGE_CONFIG;
		const parsed = await manager.loadJson<ComposerConfigShape>(ConfigTemplateId.Composer);
		const storage = parsed?.storage;
		if (!storage || typeof storage !== 'object') return DEFAULT_COMPOSER_STORAGE_CONFIG;
		return {
			commentsSubdir: relativePath(storage.commentsSubdir, DEFAULT_COMPOSER_STORAGE_CONFIG.commentsSubdir),
			workspaceStateSubdir: relativePath(
				storage.workspaceStateSubdir,
				DEFAULT_COMPOSER_STORAGE_CONFIG.workspaceStateSubdir,
			),
			workspaceStateFile: fileName(
				storage.workspaceStateFile,
				DEFAULT_COMPOSER_STORAGE_CONFIG.workspaceStateFile,
			),
			telemetrySubdir: relativePath(
				storage.telemetrySubdir,
				DEFAULT_COMPOSER_STORAGE_CONFIG.telemetrySubdir,
			),
			telemetryFile: fileName(storage.telemetryFile, DEFAULT_COMPOSER_STORAGE_CONFIG.telemetryFile),
			workspaceCompactionEventThreshold: positiveInteger(
				storage.workspaceCompactionEventThreshold,
				DEFAULT_COMPOSER_STORAGE_CONFIG.workspaceCompactionEventThreshold,
			),
			telemetryRotationBytes: positiveInteger(
				storage.telemetryRotationBytes,
				DEFAULT_COMPOSER_STORAGE_CONFIG.telemetryRotationBytes,
			),
			telemetryRetentionFiles: positiveInteger(
				storage.telemetryRetentionFiles,
				DEFAULT_COMPOSER_STORAGE_CONFIG.telemetryRetentionFiles,
			),
		};
	} catch {
		return DEFAULT_COMPOSER_STORAGE_CONFIG;
	}
}

function relativePath(value: unknown, fallback: string): string {
	if (typeof value !== 'string') return fallback;
	const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
	if (!normalized) return fallback;
	const segments = normalized.split('/');
	if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return fallback;
	return normalized;
}

function fileName(value: unknown, fallback: string): string {
	if (typeof value !== 'string') return fallback;
	const normalized = value.trim();
	if (!normalized || normalized.includes('/') || normalized.includes('\\')) return fallback;
	if (normalized === '.' || normalized === '..') return fallback;
	return normalized;
}

function positiveInteger(value: unknown, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	const normalized = Math.floor(value);
	return normalized > 0 ? normalized : fallback;
}
