import assert from 'assert';
import { hasUsableVaultIndex } from '@/ui/view/modals/onboarding/indexingStartup';

async function run(): Promise<void> {
	const tests: Array<{ name: string; fn: () => void }> = [
		{
			name: 'hasUsableVaultIndex: true when index state is ready',
			fn: () => {
				assert.strictEqual(hasUsableVaultIndex({
					isReady: true,
					indexBuiltAt: 123,
					indexedDocs: 10,
				}), true);
			},
		},
		{
			name: 'hasUsableVaultIndex: true for legacy docs count even if ready flag is missing',
			fn: () => {
				assert.strictEqual(hasUsableVaultIndex({
					isReady: false,
					indexBuiltAt: null,
					indexedDocs: 5,
				}), true);
			},
		},
		{
			name: 'hasUsableVaultIndex: false when no index metadata exists',
			fn: () => {
				assert.strictEqual(hasUsableVaultIndex({
					isReady: false,
					indexBuiltAt: null,
					indexedDocs: null,
				}), false);
			},
		},
	];

	for (const test of tests) {
		test.fn();
		console.log(`PASS ${test.name}`);
	}
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
