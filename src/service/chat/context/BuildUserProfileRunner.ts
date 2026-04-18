import type { App, TFile } from 'obsidian';
import { PromptId } from '@/service/prompt/PromptId';
import type { UserProfileService } from '@/service/chat/context/UserProfileService';
import type { UserProfileItem } from '@/service/chat/context/UserProfileService';
import { USER_PROFILE_MIN_CONFIDENCE_THRESHOLD } from '@/core/constant';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { UserProfileProcessedHashRepo } from '@/core/storage/sqlite/repositories/UserProfileProcessedHashRepo';
import { hashSHA256 } from '@/core/utils/hash-utils';
import type { AIServiceSettings } from '@/app/settings/types';
import type { ModelTokenLimits } from '@/core/providers/types';

const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_MAX_CONTENT_LENGTH_PER_DOC = 6000;

const TEMPLATE_OVERHEAD_CHARS = 2000;
const OUTPUT_RESERVE_TOKENS = 2048;
const CHARS_PER_TOKEN = 2;

export interface BuildUserProfileRunnerOptions {
	batchSize?: number;
	maxContentLengthPerDoc?: number;
}

export interface BuildUserProfileRunParams {
	app: App;
	profileService: UserProfileService;
	aiServiceManager: AIServiceManager;
	abortSignal?: AbortSignal;
	onNotice: (message: string) => void;
	processedHashRepo?: UserProfileProcessedHashRepo;
	options?: BuildUserProfileRunnerOptions;
}

interface FileWithHash {
	file: TFile;
	hash: string;
	content: string;
}

/**
 * Runs vault scan + LLM extraction + profile update. No step limit; cancel via abortSignal.
 * When processedHashRepo is set, skips docs already in DB and inserts hashes after each batch.
 */
export async function runBuildUserProfile(params: BuildUserProfileRunParams): Promise<void> {
	const {
		app,
		profileService,
		aiServiceManager,
		abortSignal,
		onNotice,
		processedHashRepo,
		options = {},
	} = params;
	const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
	const maxContentLengthPerDoc = options.maxContentLengthPerDoc ?? DEFAULT_MAX_CONTENT_LENGTH_PER_DOC;

	const allFiles = app.vault.getMarkdownFiles();
	if (allFiles.length === 0) {
		onNotice('No markdown files to scan.');
		return;
	}

	let processedSet = new Set<string>();
	if (processedHashRepo) {
		processedSet = await processedHashRepo.loadAllHashes();
	}

	const toProcess: FileWithHash[] = [];
	for (const file of allFiles) {
		if (abortSignal?.aborted) {
			onNotice('Build user profile cancelled.');
			return;
		}
		try {
			const content = await app.vault.read(file);
			const hash = hashSHA256(content);
			if (processedSet.has(hash)) continue;
			const truncated =
				content.length > maxContentLengthPerDoc
					? content.slice(0, maxContentLengthPerDoc) + '\n...[truncated]'
					: content;
			toProcess.push({ file, hash, content: truncated });
		} catch {
			// Skip unreadable
		}
	}

	if (toProcess.length === 0) {
		onNotice('All markdown files already processed (unchanged).');
		try {
			await profileService.organizeProfileWithAI();
		} catch (e) {
			console.warn('[BuildUserProfileRunner] Organize failed:', e);
		}
		onNotice('Build user profile completed.');
		return;
	}

	const settings = aiServiceManager.getSettings();
	const { provider, model } = resolveProfileFromVaultModel(settings);
	const tokenLimits = await aiServiceManager.getModelTokenLimits(model, provider);
	const maxInputChars = computeMaxInputChars(tokenLimits);

	const totalBatches = Math.ceil(toProcess.length / batchSize);

	for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
		if (abortSignal?.aborted) {
			onNotice('Build user profile cancelled.');
			return;
		}

		onNotice(`Scanning... (batch ${batchIndex + 1}/${totalBatches})`);

		const start = batchIndex * batchSize;
		const batch = toProcess.slice(start, start + batchSize);
		const vaultContent = buildBatchContent(batch);
		if (!vaultContent.trim()) continue;

		const { vaultContent: trimmedVault } = truncateToFitContext(
			vaultContent,
			undefined,
			maxInputChars,
		);

		if (abortSignal?.aborted) {
			onNotice('Build user profile cancelled.');
			return;
		}

		try {
			// Extract only from vault content; merge/dedupe is done in updateProfile (UserProfileOrganizeMarkdown).
			const content = await aiServiceManager.chatWithPrompt(
				PromptId.ProfileFromVaultJson,
				{ vaultContent: trimmedVault },
				provider,
				model,
			);

			console.debug('[BuildUserProfileRunner] extracted:', { content, vaultContent: trimmedVault });
			const rawItems: unknown[] = parseJsonFromLLM(content);
			const validatedItems = validateProfileItems(rawItems);
			if (validatedItems.length > 0) {
				await profileService.updateProfile({ newItems: validatedItems });
			}
			if (processedHashRepo) {
				const hashes = batch.map((b) => b.hash);
				await processedHashRepo.insertMany(hashes);
				hashes.forEach((h) => processedSet.add(h));
			}
		} catch (e) {
			console.warn('[BuildUserProfileRunner] Batch extraction failed:', e);
		}
	}

	if (abortSignal?.aborted) {
		onNotice('Build user profile cancelled.');
		return;
	}

	onNotice('Organizing profile...');
	try {
		await profileService.organizeProfileWithAI();
	} catch (e) {
		console.warn('[BuildUserProfileRunner] Organize failed:', e);
	}
	onNotice('Build user profile completed.');
}

function resolveProfileFromVaultModel(settings: AIServiceSettings): { provider: string; model: string } {
	const promptModel = settings.promptModelMap?.[PromptId.ProfileFromVaultJson];
	if (promptModel) return { provider: promptModel.provider, model: promptModel.modelId };
	const defaultModel = settings.defaultModel;
	if (!defaultModel)
		throw new Error('No AI model configured. Open Settings → Model Config to set a default model and enter your API key.');
	return { provider: defaultModel.provider, model: defaultModel.modelId };
}

function computeMaxInputChars(limits: ModelTokenLimits | undefined): number {
	const maxInput = limits?.maxInputTokens ?? limits?.maxTokens ?? 128000;
	const available = Math.max(0, maxInput - OUTPUT_RESERVE_TOKENS);
	return available * CHARS_PER_TOKEN - TEMPLATE_OVERHEAD_CHARS;
}

function truncateToFitContext(
	vaultContent: string,
	existingProfileMarkdown: string | undefined,
	maxInputChars: number,
): { vaultContent: string; existingProfileMarkdown: string | undefined } {
	const existingLen = existingProfileMarkdown?.length ?? 0;
	const vaultLen = vaultContent.length;
	if (TEMPLATE_OVERHEAD_CHARS + vaultLen + existingLen <= maxInputChars + TEMPLATE_OVERHEAD_CHARS) {
		return { vaultContent, existingProfileMarkdown };
	}
	let v = vaultContent;
	let e = existingProfileMarkdown;
	if ((e?.length ?? 0) > 0 && v.length < maxInputChars) {
		const maxExisting = maxInputChars - v.length;
		e =
			(e as string).slice(0, maxExisting) +
			(maxExisting < (e as string).length ? '\n...[truncated]' : '');
	}
	if (v.length + (e?.length ?? 0) > maxInputChars) {
		const maxVault = maxInputChars - (e?.length ?? 0);
		v = v.slice(0, Math.max(0, maxVault)) + (maxVault < v.length ? '\n...[truncated]' : '');
	}
	return { vaultContent: v, existingProfileMarkdown: e };
}

/** Strip code fence, fix common LLM JSON mistakes, parse. Returns [] on failure. */
function parseJsonFromLLM(content: string): unknown[] {
	let s = content.trim();
	const codeFence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (codeFence) s = codeFence[1].trim();
	s = s.replace(/([{\[,])\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
	s = s.replace(/,(\s*[}\]])/g, '$1');
	try {
		const out = JSON.parse(s);
		return Array.isArray(out) ? out : [];
	} catch {
		try {
			const arrayMatch = s.match(/\[\s*[\s\S]*\s*\]/);
			if (arrayMatch) {
				const fixed = arrayMatch[0]
					.replace(/([{\[,])\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
					.replace(/,(\s*[}\]])/g, '$1');
				return JSON.parse(fixed) as unknown[];
			}
		} catch {
			// ignore
		}
		return [];
	}
}

function buildBatchContent(batch: FileWithHash[]): string {
	return batch.map((b) => `[${b.file.path}]\n${b.content}`).join('\n\n---\n\n');
}

function validateProfileItems(raw: unknown[]): UserProfileItem[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter((c): c is UserProfileItem => {
			if (!c || typeof (c as any).text !== 'string' || !String((c as any).text).trim()) return false;
			const cat = (c as any).category;
			if (typeof cat !== 'string' || !String(cat).trim()) return false;
			const conf = (c as any).confidence;
			if (conf !== undefined && (typeof conf !== 'number' || conf < 0 || conf > 1)) return false;
			return true;
		})
		.map((c) => ({
			text: String((c as any).text).trim(),
			category: String((c as any).category).trim(),
			confidence: (c as any).confidence as number | undefined,
		}))
		.filter((c) => !c.confidence || c.confidence >= USER_PROFILE_MIN_CONFIDENCE_THRESHOLD);
}
