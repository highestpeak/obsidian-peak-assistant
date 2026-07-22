/**
 * Pure resolver for attachment "understanding" badges (zero-gap C1).
 * Splits out of MessageAttachmentsList.tsx so tests can exercise the
 * mapping without pulling React / streamdown into the test runner.
 */

import type { ChatResourceRef } from '@/service/chat/types';
import type { ChatStudioStrings } from '../../chatStudioStrings';

/**
 * Return a one-line badge for `resource.understandingSource`, or `null`
 * when no badge should render (`none` / absent / unrecognised value).
 * `{model}` slots are filled from `understandingModel`; the
 * `attachment-only` variant honours `understandingReason` when set.
 */
export function resolveUnderstandingBadge(
	resource: Pick<ChatResourceRef, 'understandingSource' | 'understandingModel' | 'understandingReason'>,
	labels: ChatStudioStrings['messages'],
): string | null {
	const src = resource.understandingSource;
	if (!src || src === 'none') return null;
	const modelSlot = resource.understandingModel ?? '';
	if (src === 'native-video-input') return labels.understandingBadgeNativeVideo;
	if (src === 'transcript-from-audio') {
		return labels.understandingBadgeTranscribedAudio.replace('{model}', modelSlot);
	}
	if (src === 'transcript-from-extracted-audio') {
		return labels.understandingBadgeTranscribedExtractedAudio.replace('{model}', modelSlot);
	}
	if (src === 'attachment-only') {
		if (resource.understandingReason) {
			return labels.understandingBadgeAttachmentOnlyReason.replace('{reason}', resource.understandingReason);
		}
		return labels.understandingBadgeAttachmentOnly;
	}
	return null;
}
