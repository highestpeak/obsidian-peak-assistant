import type { FunctionalTagEntry } from '@/core/document/helper/TagService';
import type { FunctionalTagId } from '@/core/schemas/agents/search-agent-schemas';
import { GraphEdgeType } from '@/core/po/graph.po';

/**
 * Boolean expression parser for graph tag filters.
 * Supports AND, OR, NOT with parentheses.
 * Tokens: tag: (topic), functional: (functional tag id), keyword: (hashtag-style keyword).
 * Examples: "tag:javascript AND functional:idea_candidate"
 */

export interface BooleanExpression {
	type: 'and' | 'or' | 'not' | 'tag' | 'functional' | 'keyword';
	left?: BooleanExpression;
	right?: BooleanExpression;
	value?: string;
}

export type NoteTagDimensions = {
	topicTags?: string[];
	functionalTagEntries?: FunctionalTagEntry[];
	keywordTags?: string[];
};

export class BooleanExpressionParser {
	public readonly expression: string;
	public readonly ast: BooleanExpression;
	private pos: number = 0;
	private tokens: string[] = [];

	constructor(expression: string) {
		this.expression = expression == null ? '' : String(expression).trim();
		if (!this.expression) {
			throw new Error('Empty expression');
		}
		this.ast = this.parse(this.expression);
	}

	parse(expression: string): BooleanExpression {
		this.pos = 0;
		const input = expression == null ? '' : String(expression).trim();
		this.tokens = this.tokenize(input);
		const result = this.parseExpression();
		if (this.pos < this.tokens.length) {
			throw new Error(`Unexpected token at end of expression: ${this.tokens[this.pos]}`);
		}
		return result;
	}

	/** Extract topic, functional, and keyword values from the AST. */
	extractDimensions(): { tags: string[]; functionals: string[]; keywords: string[] } {
		const tags: string[] = [];
		const functionals: string[] = [];
		const keywords: string[] = [];
		const traverse = (expr: BooleanExpression) => {
			switch (expr.type) {
				case 'tag':
					if (expr.value && !tags.includes(expr.value)) tags.push(expr.value);
					break;
				case 'functional':
					if (expr.value && !functionals.includes(expr.value)) functionals.push(expr.value);
					break;
				case 'keyword':
					if (expr.value && !keywords.includes(expr.value)) keywords.push(expr.value);
					break;
				case 'and':
				case 'or':
					if (expr.left) traverse(expr.left);
					if (expr.right) traverse(expr.right);
					break;
				case 'not':
					if (expr.left) traverse(expr.left);
					break;
			}
		};

		traverse(this.ast);
		return { tags, functionals, keywords };
	}

	buildEdgeConditions(
		tagLookup: Map<string, string>,
		functionalLookup: Map<string, string>,
		keywordLookup: Map<string, string>,
	): string {
		const buildConditions = (expr: BooleanExpression): string[] => {
			switch (expr.type) {
				case 'tag': {
					if (!expr.value) return [];
					const id = tagLookup.get(expr.value);
					return id
						? [`(type = '${GraphEdgeType.TaggedTopic}' AND to_node_id = '${id}')`]
						: [];
				}
				case 'functional': {
					if (!expr.value) return [];
					const id = functionalLookup.get(expr.value);
					return id
						? [`(type = '${GraphEdgeType.TaggedFunctional}' AND to_node_id = '${id}')`]
						: [];
				}
				case 'keyword': {
					if (!expr.value) return [];
					const id = keywordLookup.get(expr.value);
					return id
						? [`(type = '${GraphEdgeType.TaggedKeyword}' AND to_node_id = '${id}')`]
						: [];
				}
				case 'and':
					if (!expr.left || !expr.right) return [];
					const leftAnd = buildConditions(expr.left);
					const rightAnd = buildConditions(expr.right);
					if (leftAnd.length === 0 || rightAnd.length === 0) return [];
					return [`(${leftAnd.join(' OR ')}) AND (${rightAnd.join(' OR ')})`];
				case 'or':
					if (!expr.left || !expr.right) return [];
					return [...buildConditions(expr.left), ...buildConditions(expr.right)];
				case 'not':
					return expr.left ? buildConditions(expr.left) : [];
				default:
					return [];
			}
		};

		return buildConditions(this.ast).join(' OR ');
	}

	rootEvaluate(note: NoteTagDimensions & { tags?: string[]; category?: string }): boolean {
		const topic = note.topicTags ?? note.tags ?? [];
		const functionalTagEntries: FunctionalTagEntry[] =
			note.functionalTagEntries?.length
				? note.functionalTagEntries
				: note.category
					? [{ id: note.category as FunctionalTagId }]
					: [];
		const keyword = note.keywordTags ?? [];
		const normalized: NoteTagDimensions = { topicTags: topic, functionalTagEntries, keywordTags: keyword };
		return this.evaluate(this.ast, normalized);
	}

	private evaluate(expression: BooleanExpression, note: NoteTagDimensions): boolean {
		switch (expression.type) {
			case 'tag':
				return note.topicTags?.includes(expression.value!) ?? false;
			case 'functional':
				return note.functionalTagEntries?.some((e) => e.id === expression.value) ?? false;
			case 'keyword':
				return note.keywordTags?.includes(expression.value!) ?? false;
			case 'and':
				return this.evaluate(expression.left!, note) && this.evaluate(expression.right!, note);
			case 'or':
				return this.evaluate(expression.left!, note) || this.evaluate(expression.right!, note);
			case 'not':
				return !this.evaluate(expression.left!, note);
			default:
				return false;
		}
	}

	private tokenize(input: string): string[] {
		const tokens: string[] = [];
		const lower = input.toLowerCase();
		let i = 0;

		while (i < input.length) {
			const char = input[i];

			if (/\s/.test(char)) {
				i++;
				continue;
			}

			if (char === '(' || char === ')') {
				tokens.push(char);
				i++;
				continue;
			}

			if (lower.substring(i, i + 3) === 'and') {
				tokens.push('AND');
				i += 3;
				continue;
			}
			if (lower.substring(i, i + 2) === 'or') {
				tokens.push('OR');
				i += 2;
				continue;
			}
			if (lower.substring(i, i + 3) === 'not') {
				tokens.push('NOT');
				i += 3;
				continue;
			}

			if (lower.substring(i, i + 4) === 'tag:') {
				const start = i;
				i += 4;
				while (i < input.length && !/\s/.test(input[i]) && input[i] !== ')' && input[i] !== '(') {
					i++;
				}
				const token = input.substring(start, i);
				if (token.length === 4) {
					throw new Error(`Invalid tag expression: ${token} (missing value after tag:)`);
				}
				tokens.push('tag:' + token.slice(4));
				continue;
			}

			if (lower.substring(i, i + 11) === 'functional:') {
				const start = i;
				i += 11;
				while (i < input.length && !/\s/.test(input[i]) && input[i] !== ')' && input[i] !== '(') {
					i++;
				}
				const token = input.substring(start, i);
				if (token.length === 11) {
					throw new Error(`Invalid functional expression: ${token} (missing value after functional:)`);
				}
				tokens.push('functional:' + token.slice(11));
				continue;
			}

			if (lower.substring(i, i + 8) === 'keyword:') {
				const start = i;
				i += 8;
				while (i < input.length && !/\s/.test(input[i]) && input[i] !== ')' && input[i] !== '(') {
					i++;
				}
				const token = input.substring(start, i);
				if (token.length === 8) {
					throw new Error(`Invalid keyword expression: ${token} (missing value after keyword:)`);
				}
				tokens.push('keyword:' + token.slice(8));
				continue;
			}

			throw new Error(`Invalid character at position ${i}: ${char}`);
		}

		return tokens;
	}

	private parseExpression(): BooleanExpression {
		let result = this.parseTerm();

		while (this.pos < this.tokens.length && (this.tokens[this.pos] === 'AND' || this.tokens[this.pos] === 'OR')) {
			const operator = this.tokens[this.pos++];
			const right = this.parseTerm();

			result = {
				type: operator === 'AND' ? 'and' : 'or',
				left: result,
				right: right,
			};
		}

		return result;
	}

	private parseTerm(): BooleanExpression {
		if (this.tokens[this.pos] === 'NOT') {
			this.pos++;
			return {
				type: 'not',
				left: this.parseTerm(),
			};
		}

		if (this.tokens[this.pos] === '(') {
			this.pos++;
			const expr = this.parseExpression();
			if (this.tokens[this.pos] !== ')') {
				throw new Error('Expected closing parenthesis');
			}
			this.pos++;
			return expr;
		}

		if (this.tokens[this.pos].startsWith('tag:')) {
			const value = this.tokens[this.pos++].substring(4);
			return { type: 'tag', value };
		}

		if (this.tokens[this.pos].startsWith('functional:')) {
			const value = this.tokens[this.pos++].substring(11);
			return { type: 'functional', value };
		}

		if (this.tokens[this.pos].startsWith('keyword:')) {
			const value = this.tokens[this.pos++].substring(8);
			return { type: 'keyword', value };
		}

		throw new Error(`Unexpected token: ${this.tokens[this.pos]}`);
	}
}
