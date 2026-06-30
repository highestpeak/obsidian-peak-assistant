// T9: App-layer adapter for the Vault Review profile port.
//
// Wraps `AppContext.getInstance().manager.getProfileService()` so the
// service-layer `runVaultReview` no longer reaches the AppContext
// singleton directly. Returns `undefined` whenever the profile service
// is not yet available or returns an empty string — the meta-agent
// prompt builder treats `undefined` as "no user preferences known".

import { AppContext } from '@/app/context/AppContext';
import type { VaultReviewProfilePort } from '@/core/ports/VaultReviewPorts';

export class AppVaultReviewProfileAdapter implements VaultReviewProfilePort {
	async loadUserProfileText(): Promise<string | undefined> {
		try {
			const profileService = AppContext.getInstance().manager.getProfileService();
			if (!profileService) return undefined;
			const text = await profileService.getProfileAsMarkdown();
			return text.trim() || undefined;
		} catch (err) {
			console.warn('[AppVaultReviewProfileAdapter] failed to load user profile', err);
			return undefined;
		}
	}
}
