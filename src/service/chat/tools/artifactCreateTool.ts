/**
 * `artifact_create` Chat tool (Chat Studio zero-gap Track D, 2026-07-21).
 *
 * Wires the app-owned `ArtifactProducerService` into the Chat harness so
 * the model can request 5 structured artifact producers via a single
 * ToolDef. Availability is decided by `resolveToolAvailability`; execution
 * runs through the producer's validate → save → receipt pipeline.
 *
 * Contract highlights:
 *   • `kind: 'edit'` — every call writes a vault file, so PermissionGuard's
 *     ask path fires under the B1 UI.
 *   • On success we return a payload citing the vault path + receipt id so
 *     the model can reference the artifact by artifactId (feeds the same
 *     `resolveAllowedReference` allow-list `media_generate` uses).
 *   • On failure we still persist a `failed` ChatArtifactReceipt (with the
 *     raw content preserved in preview.text) so the UI shows a retry card
 *     and the model gets a structured error string it can relay.
 */

import { ok } from '@/service/agents/harness/tool/types';
import type { ToolDef } from '@/service/agents/harness/tool/types';
import { artifactCreateInputSchema } from '@/core/schemas/tools/artifactCreate';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';
import type { ArtifactProducerService } from '@/service/chat/artifacts/artifactProducers';

export interface ArtifactCreateToolDeps {
	producer: ArtifactProducerService;
	/** Conversation the chat turn belongs to — anchors every persisted receipt. */
	conversationId?: string;
	/** Assistant message id being streamed — anchors every persisted receipt. */
	messageId?: string;
	/** Optional project id override. */
	projectId?: string;
	/**
	 * Optional receipt observer — the harness runner uses this to accumulate
	 * per-turn artifact ids for the TurnExecutionReceipt.artifactIds field.
	 * Absent = no accumulation (the receipt is still persisted by the producer).
	 */
	onReceipt?: (receipt: ChatArtifactReceipt) => void;
}

export function buildArtifactCreateTool(deps: ArtifactCreateToolDeps): ToolDef {
	return {
		name: 'artifact_create',
		description:
			'Create a structured artifact in the vault: a Dataview query note, an Excalidraw drawing, ' +
			'a draw.io diagram, an extract (highlights/notes/snippet), or a reminder. Use when the user ' +
			'explicitly asks for one of these five artifact types AND the content is well-formed enough ' +
			'to persist. The tool records a ChatArtifactReceipt so the message thread renders the ' +
			'artifact card and the Resources tab lists it — do NOT re-describe the output as raw text.',
		inputSchema: artifactCreateInputSchema,
		source: 'local',
		kind: 'edit',
		async execute(args, ctx) {
			const outcome = await deps.producer.produce(args, {
				runId: ctx.loopId,
				conversationId: deps.conversationId ?? '',
				messageId: deps.messageId ?? '',
				projectId: deps.projectId,
			});
			deps.onReceipt?.(outcome.receipt);
			if (outcome.receipt.state === 'failed') {
				const err = outcome.receipt.error;
				return ok(
					`artifact_create failed (${err?.code ?? 'unknown'}): ${err?.message ?? 'no message'}\n`
					+ `The failed receipt (id: ${outcome.receipt.artifactId}) preserves the original ` +
					'content — the user can hit retry to replay.',
				);
			}
			return ok(
				`Created ${outcome.receipt.kind} artifact "${outcome.receipt.title}" at `
				+ `${outcome.vaultPath}. receiptId: ${outcome.receipt.artifactId}. `
				+ 'The user sees the artifact card in the message; do not repeat the body verbatim.',
			);
		},
	};
}
