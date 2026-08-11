export type BinaryDocumentKind = 'docx' | 'pptx';

/** Heavy Office parsers live behind this app-owned disposable-worker port. */
export interface BinaryDocumentTextExtractorPort {
	extract(kind: BinaryDocumentKind, buffer: ArrayBuffer): Promise<string>;
	dispose(): void;
}
