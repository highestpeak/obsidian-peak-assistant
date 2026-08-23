import { useEffect, useSyncExternalStore } from 'react';
import type { Profile } from '@/core/profiles/types';
import { useServiceContext } from '@/ui/context/ServiceContext';

/** Reactive access to the single app-owned provider catalog runtime. */
export function useModelCatalog(profiles?: readonly Profile[]) {
	const { modelCatalog } = useServiceContext();
	const signature = profiles?.map((profile) => `${profile.id}:${profile.kind}:${profile.enabled}:${profile.baseUrl}:${credentialRevision(profile.apiKey)}`).join('|') ?? '';
	useSyncExternalStore(
		(listener) => modelCatalog.subscribe(listener),
		() => modelCatalog.getRevision(),
		() => modelCatalog.getRevision(),
	);
	useEffect(() => {
		if (!profiles) return;
		void modelCatalog.refreshProfiles(profiles);
	}, [modelCatalog, signature]);
	return modelCatalog;
}

function credentialRevision(value: string | null): string {
	let hash = 2166136261;
	for (let index = 0; index < (value?.length ?? 0); index += 1) {
		hash ^= value!.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}
