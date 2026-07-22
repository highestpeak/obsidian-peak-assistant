/**
 * composerEditImageStore — cross-component intent bridge for the Edit image
 * form (zero-gap §4 A1). When a user clicks "Insert as reference" on an
 * image receipt, we stash the receipt id here and open the Edit form; the
 * form reads and clears the intent on mount so subsequent opens (from the
 * slash palette) start empty.
 *
 * NOT persisted — this is an in-session UX bridge only. Separate from
 * composerStore.drafts because the base ref is a user pick, not a durable
 * draft field, and we do not want image-edit refs surviving reloads.
 */
import { create } from 'zustand';
import type { MediaReferenceInput } from '@/core/types/media-generation';

export interface ComposerEditImageIntent {
	base: MediaReferenceInput;
	/** Additional references (rare — set from Insert-as-reference only when
	 * the user picked multiple). */
	additional?: MediaReferenceInput[];
}

interface ComposerEditImageState {
	intent: ComposerEditImageIntent | null;
	/** Monotonic counter — Composer subscribes so a re-fire re-opens the panel. */
	openRequestId: number;
	requestOpen: (intent: ComposerEditImageIntent) => void;
	consumeIntent: () => ComposerEditImageIntent | null;
}

export const useComposerEditImageStore = create<ComposerEditImageState>((set, get) => ({
	intent: null,
	openRequestId: 0,
	requestOpen: (intent) => set((s) => ({
		intent,
		openRequestId: s.openRequestId + 1,
	})),
	consumeIntent: () => {
		const current = get().intent;
		set({ intent: null });
		return current;
	},
}));
