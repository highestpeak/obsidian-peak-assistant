// T6 Vault Lint Ports — production id factory.
//
// Wraps `crypto.randomUUID` so the engine never imports `crypto` at the
// top of the file (which historically caused friction with the test
// bundler). Tests inject their own port instead of stubbing this
// function.

import { randomUUID } from 'crypto';
import type { VaultLintIdPort } from '../ports/VaultLintPorts';

export class DefaultVaultLintIdFactory implements VaultLintIdPort {
	nextScanId(): string {
		return randomUUID();
	}
}
