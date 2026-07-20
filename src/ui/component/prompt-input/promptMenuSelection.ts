export interface PromptMenuTextSelection {
	text: string;
	cursor: number;
	replacement: string;
}

export interface VaultReferenceDraftState<Ref> {
	text: string;
	explicitRefs: Ref[];
}

interface VaultReferenceLike {
	kind: string;
	uri: string;
	title?: string;
}

/** Human-readable label for a Vault path. The shelf keeps the full URI. */
export function vaultReferenceDisplayName(value: string): string {
	const normalized = value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
	return normalized.split('/').pop() || normalized;
}

/** Replace a live `[[query` trigger with a readable filename-only wikilink. */
export function buildVaultReferenceSelection(
	docText: string,
	from: number,
	to: number,
	value: string,
): PromptMenuTextSelection {
	const replacement = ` [[${vaultReferenceDisplayName(value)}]] `;
	return {
		text: docText.slice(0, from) + replacement + docText.slice(to),
		cursor: from + replacement.length,
		replacement,
	};
}

/**
 * Migrate persisted full-path wikilinks to the filename-only Composer form.
 * The paired explicit ref remains the source of truth for the real Vault URI.
 */
export function normalizeVaultReferenceDisplayText<Ref extends VaultReferenceLike>(
	text: string,
	explicitRefs: Ref[],
): string {
	let normalized = text;
	for (const ref of explicitRefs) {
		if (ref.kind !== 'vault-file') continue;
		const displayName = vaultReferenceDisplayName(ref.uri);
		const readable = `[[${displayName}]]`;
		normalized = normalized.split(`[[${ref.uri}]]`).join(readable);
		normalized = normalized.split(`[[${ref.uri}|${displayName}]]`).join(readable);
	}
	return normalized;
}

/**
 * Keep selected Vault refs coupled to their authored inline wikilinks.
 * Uploads, URLs and folders are independent attachments and are never pruned
 * by normal prose edits.
 */
export function reconcileVaultReferencesWithText<Ref extends VaultReferenceLike>(
	text: string,
	explicitRefs: Ref[],
): Ref[] {
	const availableTargets = new Map<string, number>();
	for (const match of text.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
		const target = match[1].split('|', 1)[0].trim();
		availableTargets.set(target, (availableTargets.get(target) ?? 0) + 1);
	}

	function consume(target: string): boolean {
		const count = availableTargets.get(target) ?? 0;
		if (count === 0) return false;
		if (count === 1) availableTargets.delete(target);
		else availableTargets.set(target, count - 1);
		return true;
	}

	return explicitRefs.filter((ref) => {
		if (ref.kind !== 'vault-file') return true;
		if (consume(ref.uri)) return true;
		const displayName = vaultReferenceDisplayName(ref.uri);
		if (consume(displayName)) return true;
		if (ref.title && ref.title !== displayName && consume(ref.title)) return true;
		return false;
	});
}

/**
 * Commit the authored wikilink and its context-shelf ref atomically.
 *
 * `current.text` may be stale because CodeMirror, PromptInput and the Composer
 * store render on different schedules. The resolved editor text is therefore
 * authoritative for this selection; the existing draft only contributes its
 * already-committed refs.
 */
export function mergeVaultReferenceDraft<Ref extends { id: string; kind: string; uri: string }>(
	current: VaultReferenceDraftState<Ref>,
	resolvedText: string,
	ref: Ref,
): VaultReferenceDraftState<Ref> {
	const exists = current.explicitRefs.some((candidate) =>
		candidate.id === ref.id || (candidate.kind === ref.kind && candidate.uri === ref.uri));
	return {
		text: resolvedText,
		explicitRefs: exists ? current.explicitRefs : [...current.explicitRefs, ref],
	};
}
