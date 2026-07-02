// Read-only index status snapshot. Extracted to core so
// `core/ports/IndexReaderPort.ts` can reference it without inverting
// the layering. The full IndexService writer surface stays in
// `service/search/index/indexService.ts` — this file only carries the
// tiny status shape.

/**
 * What the Settings pane / startup check sees when it asks "is the
 * index ready?"
 *   - `indexBuiltAt`: epoch ms the current index was built, or null
 *     when no index has been created yet.
 *   - `indexedDocs`: total documents currently indexed, or null when
 *     unknown / not-yet-built.
 *   - `isReady`: true when the index exists and can answer queries.
 */
export interface GetIndexStatusResponse {
	indexBuiltAt: number | null;
	indexedDocs: number | null;
	isReady: boolean;
}
