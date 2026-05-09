import type { FunctionalTagEntry } from '@/core/document/helper/TagService';
import type { FunctionalTagId } from '@/core/schemas/agents/search-agent-schemas';

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

	private static readonly PREFIXES: Array<{ key: string; label: string }> = [
		{ key: 'tag:', label: 'tag' },
		{ key: 'functional:', label: 'functional' },
		{ key: 'keyword:', label: 'keyword' },
	];
	private static readonly OPERATORS: Array<{ key: string; len: number }> = [
		{ key: 'AND', len: 3 }, { key: 'OR', len: 2 }, { key: 'NOT', len: 3 },
	];

	private tokenize(input: string): string[] {
		const tokens: string[] = [];
		const lower = input.toLowerCase();
		let i = 0;

		while (i < input.length) {
			if (/\s/.test(input[i])) { i++; continue; }
			if (input[i] === '(' || input[i] === ')') { tokens.push(input[i++]); continue; }

			const op = BooleanExpressionParser.OPERATORS.find(o => lower.substring(i, i + o.len) === o.key.toLowerCase());
			if (op) { tokens.push(op.key); i += op.len; continue; }

			const prefix = BooleanExpressionParser.PREFIXES.find(p => lower.substring(i, i + p.key.length) === p.key);
			if (prefix) {
				const start = i;
				i += prefix.key.length;
				while (i < input.length && !/\s/.test(input[i]) && input[i] !== ')' && input[i] !== '(') i++;
				const value = input.substring(start + prefix.key.length, i);
				if (!value) throw new Error(`Invalid ${prefix.label} expression: missing value after ${prefix.key}`);
				tokens.push(prefix.key + value);
				continue;
			}

			throw new Error(`Invalid character at position ${i}: ${input[i]}`);
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
