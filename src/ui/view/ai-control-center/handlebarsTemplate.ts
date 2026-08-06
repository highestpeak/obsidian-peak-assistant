export interface HandlebarsTemplateSegment {
	value: string;
	isHandlebars: boolean;
}

const HANDLEBARS_EXPRESSION = /(\{\{\{[\s\S]*?\}\}\}|\{\{[\s\S]*?\}\})/g;

/** Splits a template without changing any executable Handlebars source. */
export function splitHandlebarsTemplate(template: string): readonly HandlebarsTemplateSegment[] {
	return template
		.split(HANDLEBARS_EXPRESSION)
		.filter((value) => value.length > 0)
		.map((value) => ({ value, isHandlebars: value.startsWith('{{') }));
}

/** A safe handoff users can paste into Chat to ask for a revision. */
export function buildPromptRevisionRequest(template: string): string {
	return [
		'Rewrite or polish this Handlebars prompt template for clarity and effectiveness.',
		'Keep every Handlebars expression exactly unchanged, including {{variables}}, conditionals, loops, helpers, and triple braces.',
		'Return only the revised template.',
		'',
		template,
	].join('\n');
}
