import type { VaultScanAiOperationPlan } from '@/core/types/vault-intelligence';
import type { VaultIntelligenceConfig } from './VaultIntelligenceDefaults';

/**
 * Extensions whose Vault byte size is a useful approximation for directly
 * readable source text. Binary/extracted formats are intentionally excluded:
 * their on-disk size is not a trustworthy stand-in for text sent to a model.
 */
const DIRECT_TEXT_EXTENSIONS = new Set([
	'md', 'markdown', 'txt', 'json', 'jsonl', 'csv', 'tsv', 'html', 'htm',
	'xml', 'yaml', 'yml', 'canvas', 'excalidraw', 'js', 'jsx', 'ts', 'tsx',
	'css', 'scss', 'py', 'java', 'go', 'rs', 'sql', 'sh', 'bash',
]);

export interface VaultScanTextEstimateInput {
	paths: string[];
	pathBytes?: Record<string, number>;
	bytesPerToken: number;
}

export interface VaultScanTextEstimate {
	readableFileCount: number;
	readableBytes: number;
	inputTokens: number;
}

export function estimateVaultScanText(input: VaultScanTextEstimateInput): VaultScanTextEstimate {
	const readablePaths = (input.paths ?? []).filter(isDirectTextPath);
	const readableBytes = readablePaths.reduce((total, path) => total + (input.pathBytes?.[path] ?? 0), 0);
	return {
		readableFileCount: readablePaths.length,
		readableBytes,
		inputTokens: readableBytes > 0 ? Math.ceil(readableBytes / input.bytesPerToken) : 0,
	};
}

export function estimateVaultScanOperations(
	operations: VaultScanAiOperationPlan[],
	config: VaultIntelligenceConfig,
	text: VaultScanTextEstimate,
): VaultScanAiOperationPlan[] {
	const definitions = new Map(config.scanOperations.map((operation) => [operation.id, operation]));
	return operations.map((operation) => {
		const rule = definitions.get(operation.id)?.estimate;
		if (!rule) return operation;
		const estimatedInputTokens = Math.ceil(text.inputTokens * rule.inputShare) + text.readableFileCount * rule.promptTokensPerFile;
		const estimatedOutputTokens = text.readableFileCount * rule.outputTokensPerFile;
		return {
			...operation,
			estimatedInputTokens,
			estimatedOutputTokens,
			estimatedTokens: estimatedInputTokens + estimatedOutputTokens,
			estimatedCostUsd: 0,
		};
	});
}

function isDirectTextPath(path: string): boolean {
	const extension = path.split('.').pop()?.toLocaleLowerCase() ?? '';
	return DIRECT_TEXT_EXTENSIONS.has(extension);
}
