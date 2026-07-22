/**
 * Music licensing acceptance (zero-gap Track E).
 *
 * The confirm-cost card for music jobs must — on FIRST use per policy version
 * — force the user to read the licensing note and check "I accept" before the
 * Confirm button is enabled. Once accepted the acceptance persists in
 * `settings.ai.mediaDefaults.musicLicensingAccepted`, keyed by policy version,
 * so a bumped policy re-prompts the user.
 *
 * Pure functions (no React) so unit tests exercise every branch without
 * mounting a card.
 */

import type { MediaSettingsOverride } from '@/core/config/settingsTypes';

export interface MusicTermsAcceptanceView {
	/** True when the user has already accepted the current policy version. */
	alreadyAccepted: boolean;
	/** Human-safe reason (matches the persisted `policyVersion`). */
	activePolicyVersion: string;
	/** Timestamp of prior acceptance, or undefined. */
	confirmedAt?: number;
}

export function evaluateMusicTermsAcceptance(input: {
	activePolicyVersion: string;
	acceptance?: MediaSettingsOverride['musicLicensingAccepted'];
}): MusicTermsAcceptanceView {
	const accepted = input.acceptance;
	const alreadyAccepted =
		!!accepted
		&& accepted.policyVersion === input.activePolicyVersion
		&& typeof accepted.confirmedAt === 'number';
	return {
		alreadyAccepted,
		activePolicyVersion: input.activePolicyVersion,
		confirmedAt: accepted?.confirmedAt,
	};
}

/**
 * Build the acceptance record to persist. Kept separate so the writer path
 * cannot accidentally build a record with a mismatched policyVersion.
 */
export function buildAcceptanceRecord(
	activePolicyVersion: string,
	now: number = Date.now(),
): NonNullable<MediaSettingsOverride['musicLicensingAccepted']> {
	return {
		policyVersion: activePolicyVersion,
		confirmedAt: now,
	};
}

/**
 * Confirm-button gate: given the receipt's mediaKind and current acceptance
 * state, decide whether the Confirm button should be disabled AND why.
 */
export function musicConfirmGate(input: {
	mediaKind: string | undefined;
	acceptance: MusicTermsAcceptanceView;
	checkedThisSession: boolean;
}): { disabled: boolean; requiresAcceptance: boolean; reason?: string } {
	if (input.mediaKind !== 'music') {
		return { disabled: false, requiresAcceptance: false };
	}
	if (input.acceptance.alreadyAccepted) {
		return { disabled: false, requiresAcceptance: false };
	}
	if (input.checkedThisSession) {
		return { disabled: false, requiresAcceptance: true };
	}
	return {
		disabled: true,
		requiresAcceptance: true,
		reason: 'music-terms-not-accepted',
	};
}
