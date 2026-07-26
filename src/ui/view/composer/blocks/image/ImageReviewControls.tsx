/**
 * Peak Composer — shared image candidate review controls (WP7).
 *
 * The constant-geometry footer every image candidate card shares: an optional
 * targeted-instruction field, segmented variant navigation (only when ≥2
 * variants — no dead disabled arrows), and the accept / regenerate / discard
 * triad. Mutates nothing itself — every action routes through the
 * {@link ComposerCandidateRuntimePort} (accept → transaction hub → History/Undo).
 * Geometry follows the component-consistency contract (30px controls, radius-md).
 */

import * as React from 'react';
import { Check, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import type { ComposerCandidate, ComposerCandidateRuntimePort } from '@/core/composer';
import { Button } from '@/ui/components/primitives';
import {
	DEFAULT_IMAGE_UI_STRINGS,
	formatImageVariantCounter,
	loadImageUiStrings,
	type ImageCandidateUiStrings,
} from './imageUiConfig';

const CONTROL = 'h-[30px] rounded-[var(--pk-radius-md)]';

export interface ImageReviewControlsProps {
	candidate: ComposerCandidate;
	runtime: ComposerCandidateRuntimePort;
	strings: ImageCandidateUiStrings;
	streaming: boolean;
	/** Instruction field placeholder + aria (omit to hide the field). */
	instruction?: { value: string; onChange: (v: string) => void; placeholder: string; aria: string };
	/** Enter / regenerate handler (defaults to runtime.regenerate with the instruction). */
	onRegenerate: () => void;
	acceptable: boolean;
	regenerable: boolean;
}

function VariantNav(props: ImageReviewControlsProps): React.ReactElement | null {
	const { candidate, runtime, strings, streaming } = props;
	if (candidate.variants.length < 2) return null;
	const index = candidate.variants.findIndex((v) => v.variantId === candidate.activeVariantId);
	const goTo = (next: number): void => {
		const variant = candidate.variants[next];
		if (variant) runtime.setActiveVariant(candidate.candidateId, variant.variantId);
	};
	return (
		<span className={`inline-flex items-center border border-[var(--background-modifier-border)] overflow-hidden ${CONTROL}`}>
			<Button variant="ghost" className={`${CONTROL} rounded-none px-1`} aria-label={strings.prevVariant} disabled={streaming || index <= 0} onClick={() => goTo(index - 1)}>
				<ChevronLeft size={14} />
			</Button>
			<span className="px-1.5 text-xs text-[var(--text-muted)] tabular-nums select-none">
				{formatImageVariantCounter(strings.variantCounter, index + 1, candidate.variants.length)}
			</span>
			<Button variant="ghost" className={`${CONTROL} rounded-none px-1`} aria-label={strings.nextVariant} disabled={streaming || index >= candidate.variants.length - 1} onClick={() => goTo(index + 1)}>
				<ChevronRight size={14} />
			</Button>
		</span>
	);
}

export function ImageReviewControls(props: ImageReviewControlsProps): React.ReactElement {
	const { candidate, runtime, strings, streaming, instruction, acceptable, regenerable } = props;
	const handleDiscard = (): void => runtime.discard(candidate.candidateId);
	return (
		<span className="flex items-center gap-1.5 px-3 flex-wrap">
			{instruction ? (
				<input
					type="text"
					value={instruction.value}
					aria-label={instruction.aria}
					placeholder={instruction.placeholder}
					className={`flex-1 min-w-[140px] px-2 text-sm bg-transparent border border-[var(--background-modifier-border)] text-[var(--text-normal)] ${CONTROL}`}
					onChange={(e) => instruction.onChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key !== 'Enter') return;
						e.preventDefault();
						props.onRegenerate();
					}}
				/>
			) : null}
			<VariantNav {...props} />
			<Button variant="secondary" className={`${CONTROL} px-2 gap-1`} disabled={!regenerable} onClick={props.onRegenerate}>
				<RotateCcw size={14} />
				{candidate.status === 'failed' ? strings.retry : strings.regenerate}
			</Button>
			<Button variant="primary" className={`${CONTROL} px-2 gap-1`} disabled={!acceptable} onClick={() => void runtime.accept(candidate.candidateId)}>
				<Check size={14} />
				{strings.accept}
			</Button>
			<Button variant="ghost" className={`${CONTROL} px-2 gap-1`} onClick={handleDiscard}>
				<X size={14} />
				{streaming ? strings.cancel : strings.discard}
			</Button>
		</span>
	);
}

/** Hook: load the image UI strings, honouring an injected override (tests). */
export function useImageStrings(injected?: ImageCandidateUiStrings): ImageCandidateUiStrings {
	const [strings, setStrings] = React.useState<ImageCandidateUiStrings>(injected ?? DEFAULT_IMAGE_UI_STRINGS);
	React.useEffect(() => {
		if (injected) return;
		let cancelled = false;
		void loadImageUiStrings().then((s) => {
			if (!cancelled) setStrings(s);
		});
		return () => {
			cancelled = true;
		};
	}, [injected]);
	return injected ?? strings;
}
