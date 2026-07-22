/**
 * Loader + typed fallback for `templates/config/artifact-create.json`
 * (Chat Studio zero-gap Track D, 2026-07-21).
 *
 * The JSON is the source of truth; this file mirrors it as a compiled
 * fallback so producers work when the TemplateManager is unavailable
 * (cold-start, tests, missing template).
 */

import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { TemplateManager } from '@/core/template/TemplateManager';
import defaults from '../../../../templates/config/artifact-create.json';
import type { ArtifactCreateConfig } from './artifactProducers';

export const DEFAULT_ARTIFACT_CREATE_CONFIG: ArtifactCreateConfig =
	defaults as unknown as ArtifactCreateConfig;

export async function loadArtifactCreateConfig(): Promise<ArtifactCreateConfig> {
	const tm = TemplateManager.getInstance();
	if (!tm) return DEFAULT_ARTIFACT_CREATE_CONFIG;
	try {
		const loaded = await tm.loadJson(ConfigTemplateId.ArtifactCreate);
		if (loaded && typeof loaded === 'object') {
			return { ...DEFAULT_ARTIFACT_CREATE_CONFIG, ...(loaded as Partial<ArtifactCreateConfig>) };
		}
	} catch {
		/* fall through to defaults */
	}
	return DEFAULT_ARTIFACT_CREATE_CONFIG;
}
