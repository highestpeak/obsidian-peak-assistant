import type { Database } from './database';

type SqlJsDatabase = any;

/**
 * Type-safe query builder for sql.js.
 * Provides a fluent API for building SQL queries without string concatenation.
 */
export class QueryBuilder {
	constructor(public readonly db: SqlJsDatabase) {}

	/**
	 * Build a SELECT query.
	 */
	select<T extends keyof Database>(table: T): SelectQuery<T> {
		return new SelectQuery(this.db, table);
	}

	/**
	 * Build an INSERT query.
	 */
	insertInto<T extends keyof Database>(table: T): InsertQuery<T> {
		return new InsertQuery(this.db, table);
	}

	/**
	 * Build an UPDATE query.
	 */
	update<T extends keyof Database>(table: T): UpdateQuery<T> {
		return new UpdateQuery(this.db, table);
	}

	/**
	 * Build a DELETE query.
	 */
	deleteFrom<T extends keyof Database>(table: T): DeleteQuery<T> {
		return new DeleteQuery(this.db, table);
	}
}

/**
 * SELECT query builder.
 */
class SelectQuery<T extends keyof Database> {
	private columns: string[] = ['*'];
	private whereClauses: Array<{ column: string; operator: string; value: unknown }> = [];
	private orderByClause: { column: string; direction: 'ASC' | 'DESC' } | null = null;
	private limitValue: number | null = null;

	constructor(
		private readonly db: SqlJsDatabase,
		private readonly table: T,
	) {}

	selectColumns(cols: Array<keyof Database[T]>): this {
		this.columns = cols as string[];
		return this;
	}

	where(column: keyof Database[T], operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'IN', value: unknown): this {
		this.whereClauses.push({ column: column as string, operator, value });
		return this;
	}

	orderBy(column: keyof Database[T], direction: 'ASC' | 'DESC' = 'ASC'): this {
		this.orderByClause = { column: column as string, direction };
		return this;
	}

	limit(count: number): this {
		this.limitValue = count;
		return this;
	}

	/**
	 * Execute the query and return all rows.
	 */
	execute(): Database[T][] {
		const sql = this.buildSQL();
		const params = this.buildParams();
		const stmt = this.db.prepare(sql, params);
		const rows: Database[T][] = [];

		try {
			while (stmt.step()) {
				rows.push(stmt.getAsObject() as Database[T]);
			}
		} finally {
			stmt.free();
		}

		return rows;
	}

	private buildSQL(): string {
		const cols = this.columns.join(', ');
		let sql = `SELECT ${cols} FROM ${this.table as string}`;

		if (this.whereClauses.length > 0) {
			const conditions = this.whereClauses.map((clause, idx) => {
				if (clause.operator === 'IN') {
					const placeholders = Array.isArray(clause.value)
						? clause.value.map(() => '?').join(', ')
						: '?';
					return `${clause.column} IN (${placeholders})`;
				}
				return `${clause.column} ${clause.operator} ?`;
			});
			sql += ` WHERE ${conditions.join(' AND ')}`;
		}

		if (this.orderByClause) {
			sql += ` ORDER BY ${this.orderByClause.column} ${this.orderByClause.direction}`;
		}

		if (this.limitValue !== null) {
			sql += ` LIMIT ?`;
		}

		return sql;
	}

	private buildParams(): unknown[] {
		const params: unknown[] = [];

		for (const clause of this.whereClauses) {
			if (clause.operator === 'IN' && Array.isArray(clause.value)) {
				params.push(...clause.value);
			} else {
				params.push(clause.value);
			}
		}

		if (this.limitValue !== null) {
			params.push(this.limitValue);
		}

		return params;
	}
}

/**
 * INSERT query builder.
 */
class InsertQuery<T extends keyof Database> {
	constructor(
		private readonly db: SqlJsDatabase,
		private readonly table: T,
	) {}

	values(data: Partial<Database[T]>): void {
		const columns = Object.keys(data);
		const values = Object.values(data);
		const placeholders = columns.map(() => '?').join(', ');

		const sql = `INSERT INTO ${this.table as string} (${columns.join(', ')}) VALUES (${placeholders})`;
		this.db.run(sql, values);
	}

	/**
	 * INSERT ... ON CONFLICT DO UPDATE (UPSERT).
	 * @param updateExpressions Optional map of column to update expression (e.g., 'open_count + 1')
	 */
	onConflictUpdate(
		data: Partial<Database[T]>,
		conflictColumn: keyof Database[T],
		updateExpressions?: Partial<Record<keyof Database[T], string>>,
	): void {
		const columns = Object.keys(data);
		const values = Object.values(data);
		const placeholders = columns.map(() => '?').join(', ');

		// Build update clause: use expressions if provided, otherwise use excluded.column
		const updateClause = columns
			.filter((col) => col !== conflictColumn)
			.map((col) => {
				if (updateExpressions && updateExpressions[col as keyof Database[T]]) {
					return `${col} = ${updateExpressions[col as keyof Database[T]]}`;
				}
				return `${col} = excluded.${col}`;
			})
			.join(', ');

		const sql = `INSERT INTO ${this.table as string} (${columns.join(', ')}) VALUES (${placeholders})
			ON CONFLICT(${conflictColumn as string}) DO UPDATE SET ${updateClause}`;
		this.db.run(sql, values);
	}
}

/**
 * UPDATE query builder.
 */
class UpdateQuery<T extends keyof Database> {
	private setClause: Array<{ column: string; value: unknown }> = [];
	private whereClauses: Array<{ column: string; operator: string; value: unknown }> = [];

	constructor(
		private readonly db: SqlJsDatabase,
		private readonly table: T,
	) {}

	set(column: keyof Database[T], value: unknown): this {
		this.setClause.push({ column: column as string, value });
		return this;
	}

	where(column: keyof Database[T], operator: '=' | '!=' | '>' | '<' | '>=' | '<=', value: unknown): this {
		this.whereClauses.push({ column: column as string, operator, value });
		return this;
	}

	execute(): void {
		const sql = this.buildSQL();
		const params = this.buildParams();
		this.db.run(sql, params);
	}

	private buildSQL(): string {
		const setParts = this.setClause.map((clause) => `${clause.column} = ?`).join(', ');
		let sql = `UPDATE ${this.table as string} SET ${setParts}`;

		if (this.whereClauses.length > 0) {
			const conditions = this.whereClauses.map((clause) => `${clause.column} ${clause.operator} ?`).join(' AND ');
			sql += ` WHERE ${conditions}`;
		}

		return sql;
	}

	private buildParams(): unknown[] {
		const params: unknown[] = [];
		params.push(...this.setClause.map((clause) => clause.value));
		params.push(...this.whereClauses.map((clause) => clause.value));
		return params;
	}
}

/**
 * DELETE query builder.
 */
class DeleteQuery<T extends keyof Database> {
	private whereClauses: Array<{ column: string; operator: string; value: unknown }> = [];

	constructor(
		private readonly db: SqlJsDatabase,
		private readonly table: T,
	) {}

	where(column: keyof Database[T], operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'IN', value: unknown): this {
		this.whereClauses.push({ column: column as string, operator, value });
		return this;
	}

	execute(): void {
		const sql = this.buildSQL();
		const params = this.buildParams();
		this.db.run(sql, params);
	}

	private buildSQL(): string {
		let sql = `DELETE FROM ${this.table as string}`;

		if (this.whereClauses.length > 0) {
			const conditions = this.whereClauses.map((clause) => {
				if (clause.operator === 'IN') {
					const placeholders = Array.isArray(clause.value)
						? clause.value.map(() => '?').join(', ')
						: '?';
					return `${clause.column} IN (${placeholders})`;
				}
				return `${clause.column} ${clause.operator} ?`;
			}).join(' AND ');
			sql += ` WHERE ${conditions}`;
		}

		return sql;
	}

	private buildParams(): unknown[] {
		const params: unknown[] = [];
		for (const clause of this.whereClauses) {
			if (clause.operator === 'IN' && Array.isArray(clause.value)) {
				params.push(...clause.value);
			} else {
				params.push(clause.value);
			}
		}
		return params;
	}
}

