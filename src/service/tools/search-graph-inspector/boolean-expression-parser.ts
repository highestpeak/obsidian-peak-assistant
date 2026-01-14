/**
 * Boolean expression parser for complex dimension filtering.
 * Supports AND, OR, NOT operators with parentheses.
 * Examples: "tag:javascript AND category:programming"
 *          "(tag:react OR tag:vue) AND category:frontend"
 */

export interface BooleanExpression {
    // todo category should be an array of strings. this affects many places. we should refactor this later
    type: 'and' | 'or' | 'not' | 'tag' | 'category';
    left?: BooleanExpression;
    right?: BooleanExpression;
    value?: string;
}

export class BooleanExpressionParser {
    public readonly expression: string;
    public readonly ast: BooleanExpression | null = null;
    private pos: number = 0;
    private tokens: string[] = [];

    constructor(expression: string) {
        this.expression = expression;
        this.ast = this.parse(expression);
    }

    /**
     * Parse a boolean expression string into an AST
     */
    parse(expression: string): BooleanExpression {
        this.pos = 0;
        this.tokens = this.tokenize(expression.trim());
        const result = this.parseExpression();
        // Check for unmatched parentheses or extra tokens
        if (this.pos < this.tokens.length) {
            throw new Error(`Unexpected token at end of expression: ${this.tokens[this.pos]}`);
        }
        return result;
    }

    /**
     * Extract all tag and category values from a boolean expression
     */
    extractDimensions(): { tags: string[], categories: string[] } {
        const tags: string[] = [];
        const categories: string[] = [];

        const traverse = (expr: BooleanExpression) => {
            switch (expr.type) {
                case 'tag':
                    if (expr.value && !tags.includes(expr.value)) {
                        tags.push(expr.value);
                    }
                    break;
                case 'category':
                    if (expr.value && !categories.includes(expr.value)) {
                        categories.push(expr.value);
                    }
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

        traverse(this.ast!);
        return { tags, categories };
    }

    /**
     * Build SQL WHERE conditions for edges based on boolean expression
     */
    buildEdgeConditions(
        tagLookup: Map<string, string>,
        categoryLookup: Map<string, string>
    ): string {
        const buildConditions = (expr: BooleanExpression): string[] => {
            switch (expr.type) {
                case 'tag':
                    if (!expr.value) return [];
                    const tagId = tagLookup.get(expr.value);
                    return tagId ? [`(type = 'tagged' AND to_node_id = '${tagId}')`] : [];
                case 'category':
                    if (!expr.value) return [];
                    const categoryId = categoryLookup.get(expr.value);
                    return categoryId ? [`(type = 'categorized' AND to_node_id = '${categoryId}')`] : [];
                case 'and':
                    if (!expr.left || !expr.right) return [];
                    const leftAnd = buildConditions(expr.left);
                    const rightAnd = buildConditions(expr.right);
                    if (leftAnd.length === 0 || rightAnd.length === 0) return [];
                    return [`(${leftAnd.join(' OR ')}) AND (${rightAnd.join(' OR ')})`];
                case 'or':
                    if (!expr.left || !expr.right) return [];
                    const leftOr = buildConditions(expr.left);
                    const rightOr = buildConditions(expr.right);
                    return [...leftOr, ...rightOr];
                case 'not':
                    // todo For NOT operations, we need to handle this differently
                    // Since we can't easily do NOT in this context, we'll skip NOT for now
                    return expr.left ? buildConditions(expr.left) : [];
                default:
                    return [];
            }
        };

        const conditions = buildConditions(this.ast!);
        return conditions.join(' OR ');
    }

    rootEvaluate(note: { tags?: string[], category?: string }): boolean {
        return this.evaluate(this.ast!, note);
    }

    /**
     * Evaluate a boolean expression against a note's dimensions
     */
    private evaluate(expression: BooleanExpression, note: { tags?: string[], category?: string }): boolean {
        switch (expression.type) {
            case 'tag':
                return note.tags?.includes(expression.value!) ?? false;
            case 'category':
                return note.category === expression.value;
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
        let i = 0;

        while (i < input.length) {
            const char = input[i];

            if (char === ' ') {
                i++;
                continue;
            }

            if (char === '(' || char === ')') {
                tokens.push(char);
                i++;
                continue;
            }

            if (char === 'A' && input.substring(i, i + 3) === 'AND') {
                tokens.push('AND');
                i += 3;
                continue;
            }

            if (char === 'O' && input.substring(i, i + 2) === 'OR') {
                tokens.push('OR');
                i += 2;
                continue;
            }

            if (char === 'N' && input.substring(i, i + 3) === 'NOT') {
                tokens.push('NOT');
                i += 3;
                continue;
            }

            // Parse tag: or category: expressions
            if (char === 't' && input.substring(i, i + 4) === 'tag:') {
                const start = i;
                i += 4;
                const valueStart = i;
                while (i < input.length && !/\s/.test(input[i]) && input[i] !== ')' && input[i] !== '(') {
                    i++;
                }
                const token = input.substring(start, i);
                // Check if there's an actual value after "tag:"
                if (token.length === 4) { // Just "tag:" with no value
                    throw new Error(`Invalid tag expression: ${token} (missing value after tag:)`);
                }
                tokens.push(token);
                continue;
            }

            if (char === 'c' && input.substring(i, i + 9) === 'category:') {
                const start = i;
                i += 9;
                const valueStart = i;
                while (i < input.length && !/\s/.test(input[i]) && input[i] !== ')' && input[i] !== '(') {
                    i++;
                }
                const token = input.substring(start, i);
                // Check if there's an actual value after "category:"
                if (token.length === 9) { // Just "category:" with no value
                    throw new Error(`Invalid category expression: ${token} (missing value after category:)`);
                }
                tokens.push(token);
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
                right: right
            };
        }

        return result;
    }

    private parseTerm(): BooleanExpression {
        if (this.tokens[this.pos] === 'NOT') {
            this.pos++;
            return {
                type: 'not',
                left: this.parseTerm()
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

        if (this.tokens[this.pos].startsWith('category:')) {
            const value = this.tokens[this.pos++].substring(9);
            return { type: 'category', value };
        }

        throw new Error(`Unexpected token: ${this.tokens[this.pos]}`);
    }
}