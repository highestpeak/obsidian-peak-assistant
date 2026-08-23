import assert from 'node:assert/strict';
import { DEFAULT_VAULT_INTELLIGENCE_CONFIG } from '@/ui/view/vault-intelligence/VaultIntelligenceDefaults';
import { estimateVaultScanOperations, estimateVaultScanText } from '@/ui/view/vault-intelligence/VaultScanEstimate';

const text = estimateVaultScanText({
	paths: ['notes/one.md', 'data/two.json', 'assets/diagram.png'],
	pathBytes: {
		'notes/one.md': 350,
		'data/two.json': 700,
		'assets/diagram.png': 80_000,
	},
	bytesPerToken: 3.5,
});

assert.deepEqual(text, {
	readableFileCount: 2,
	readableBytes: 1_050,
	inputTokens: 300,
}, 'the generic estimate counts direct text sources and excludes binary file size');

const operations = estimateVaultScanOperations([
	{
		id: 'file-summaries',
		enabled: true,
		model: 'example',
		provider: 'openai',
		estimatedTokens: 0,
		estimatedCostUsd: 0,
	},
], DEFAULT_VAULT_INTELLIGENCE_CONFIG, text);

assert.equal(operations[0]?.estimatedInputTokens, 540, 'summary input includes source text plus 120 prompt tokens per readable file');
assert.equal(operations[0]?.estimatedOutputTokens, 360, 'summary output is a transparent per-file budget');
assert.equal(operations[0]?.estimatedTokens, 900, 'the operation total is input plus output, never a fixed whole-Vault allowance');

console.log('vault-scan-estimate tests passed');
