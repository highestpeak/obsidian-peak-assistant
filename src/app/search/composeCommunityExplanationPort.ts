import type { AppContext } from '@/app/context/AppContext';
import { CommunityExplanationService } from '@/service/search/community/CommunityExplanationService';

export function composeCommunityExplanationPort(appContext: AppContext): CommunityExplanationService | null {
	const outputs = appContext.runtimeRegistry.tryGetGeneratedOutputPersistenceRuntime();
	if (!outputs) return null;
	return new CommunityExplanationService(appContext.manager, outputs);
}
