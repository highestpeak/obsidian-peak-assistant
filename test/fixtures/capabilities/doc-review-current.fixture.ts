// Fixture: the T4 / T9 pilot capability contract.
//
// This is the design anchor for Wave 3.B ("Pilot Capability"). It is
// intentionally NOT wired to any runtime — it exists so that the
// CapabilityManifest shape can be validated end-to-end via
// test/capability-manifest-shape.test.ts, and so that the T4
// CapabilityRunner design has a concrete example to converge on.
//
// See docs/superpowers/specs/2026-07-02-architecture-modernization-completion-plan.md
// §Wave 3.B for the rationale on why doc.review.current was picked as the
// pilot capability.

import type { CapabilityManifest } from '@/core/types/capability';

export const DOC_REVIEW_CURRENT_FIXTURE: CapabilityManifest = {
	id: 'doc.review.current',
	title: 'Review current document',
	description:
		'Runs a scoped review pass over the currently open document, producing findings and suggested edits as an artifact for the Copilot review panel.',

	inputContract: {
		kind: 'object',
		description: 'The active file path plus optional user focus prompt.',
		fields: {
			activeFilePath: 'string (absolute path within the vault)',
			focusPrompt: 'string | undefined (user-provided emphasis)',
		},
	},
	outputContract: {
		kind: 'object',
		description:
			'A ReviewArtifact reference + summary, delivered as an ArtifactRef event on the RunEnvelope.',
		fields: {
			artifactId: 'string',
			summary: 'string (short human-readable overview)',
			findingCount: 'number',
		},
	},

	permissionKind: 'read',
	costTier: 'deep',
	backendPolicy: {
		preferred: 'hermes-harness',
		fallback: ['provider-direct'],
	},

	skillRef: 'doc-review.v1',
	surfaceBinding: ['copilot'],
};
