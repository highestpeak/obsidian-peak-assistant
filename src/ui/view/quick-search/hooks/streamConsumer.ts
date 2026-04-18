import type { LLMStreamEvent } from '@/core/providers/types';
import { pushTimelineEvent } from './search-session-types';

export interface StreamConsumerContext {
	hasStartedStreaming: () => boolean;
	onStreamStart: () => void;
	signal: AbortSignal | undefined;
	routeEvent: (event: LLMStreamEvent) => void;
	timeline?: LLMStreamEvent[];
}

export async function consumeStream(
	gen: AsyncIterable<LLMStreamEvent>,
	ctx: StreamConsumerContext,
): Promise<void> {
	for await (const event of gen) {
		if (!ctx.hasStartedStreaming()) {
			console.debug('[useSearchSession] Starting streaming');
			ctx.onStreamStart();
		}
		if (ctx.signal?.aborted) {
			console.debug('[useSearchSession] Analysis cancelled by user');
			break;
		}
		if (ctx.timeline) {
			pushTimelineEvent(ctx.timeline, event);
		}
		ctx.routeEvent(event);
	}
}
