/** Defines the structure of a section in a markdown document. */
export type SectionDef = {
	title: string;
	optional?: boolean;
};

/** Defines the structure of a markdown document. */
export type MarkdownDocSchemaDef = {
	/** Ordered list of sections in the document. */
	sections: SectionDef[];
};
