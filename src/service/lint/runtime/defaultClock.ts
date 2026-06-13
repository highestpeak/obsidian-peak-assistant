// T6 Vault Lint Ports — production clock.
//
// Wraps `Date.now`. Tests inject their own port instead of mocking the
// global Date.

import type { VaultLintClockPort } from '../ports/VaultLintPorts';

export class DefaultVaultLintClock implements VaultLintClockPort {
	now(): number {
		return Date.now();
	}
}
