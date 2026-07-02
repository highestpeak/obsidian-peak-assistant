// T2 Port Sketches — ArtifactPort.
//
// Body-storage counterpart to `ArtifactRef`. The RunEnvelope keeps
// artifact refs (pointers) inside the recorder; the *body* (the actual
// review markdown, JSON payload, diff bytes) needs a home somewhere.
// Today capabilities inline that responsibility ad-hoc (Copilot writes
// into vault, Vault Lint returns in-memory objects, chat streams into
// zustand). ArtifactPort is the narrow interface those callsites can
// depend on when they eventually share a real store.
//
// Scope:
//   - `putArtifact({ runId, kind, body, meta })` — persist a body and
//     mint a fresh `ArtifactRef` for it.
//   - `getArtifactBody(artifactId)` — round-trip the body when the UI
//     wants to render / diff / compare.
//   - `listByRun(runId)` — enumerate every artifact a run produced.
//
// Boundary discipline: this port MUST NOT import from `@/service/*`,
// `@/app/*`, `@/ui/*`, or `obsidian`. `ArtifactRef` lives in
// `service/run-envelope/types.ts` today (locked to zero imports by a
// hard test), so the port declares its own structural type that
// shape-matches `ArtifactRef`. A shape-guard test asserts the two
// stay in sync.

/**
 * Structural mirror of `ArtifactRef` from
 * `service/run-envelope/types.ts`. Duplicated here so ArtifactPort
 * stays inside the core layer without inverting layering. When
 * `ArtifactRef` is eventually lifted to `core/types/`, this alias
 * should switch to importing it and the shape-guard test can be
 * removed.
 */
export interface ArtifactRefShape {
	readonly artifactId: string;
	readonly runId: string;
	readonly kind: 'result' | 'report' | 'trace' | 'source' | 'diff' | 'file' | 'custom';
	readonly title?: string;
	readonly uri?: string;
	readonly contentType?: string;
	readonly createdAt: number;
}

/**
 * Input to `putArtifact`. The port mints `artifactId` + `createdAt` so
 * callers cannot accidentally produce non-deterministic refs.
 */
export interface PutArtifactInput<TBody = unknown> {
	readonly runId: string;
	readonly kind: ArtifactRefShape['kind'];
	readonly body: TBody;
	readonly title?: string;
	readonly uri?: string;
	readonly contentType?: string;
}

/**
 * Body-storage port. Implementations decide *where* bodies live —
 * in-memory (tests, tail buffers), vault markdown (Copilot review),
 * sqlite blob table (future), IndexedDB, etc.
 */
export interface ArtifactPort {
	putArtifact<TBody = unknown>(input: PutArtifactInput<TBody>): Promise<ArtifactRefShape>;
	getArtifactBody<TBody = unknown>(artifactId: string): Promise<TBody | undefined>;
	listByRun(runId: string): Promise<ArtifactRefShape[]>;
}
