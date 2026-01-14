import { CompiledQuery } from 'kysely';

/**
 * Execute a Kysely compiled query using raw SQL
 * This allows us to use Kysely as a type-safe query builder while controlling execution ourselves
 * Returns results in the format expected by Kysely's driver interface
 */
export async function executeCompiledQuery(compiledQuery: CompiledQuery, rawDb: any): Promise<any> {
	// The query is already compiled, it has sql and parameters properties
	const { sql, parameters } = compiledQuery;

	// Prepare and execute the query using raw better-sqlite3
	const stmt = rawDb.prepare(sql);
	let result: any;

	if (parameters && parameters.length > 0) {
		// Check if it's a SELECT query (returns array) or mutation (returns run result)
		const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
		if (isSelect) {
			result = stmt.all(...parameters);
		} else {
			result = stmt.run(...parameters);
		}
	} else {
		const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
		if (isSelect) {
			result = stmt.all();
		} else {
			result = stmt.run();
		}
	}

	// Format result according to Kysely's driver interface expectations
	if (Array.isArray(result)) {
		// SELECT query result - return rows array
		return {
			rows: result,
			insertId: undefined,
			numAffectedRows: undefined
		};
	} else {
		// Mutation query result - return metadata
		return {
			rows: [],
			insertId: result.lastInsertRowid ? BigInt(result.lastInsertRowid) : undefined,
			numAffectedRows: result.changes ? BigInt(result.changes) : undefined
		};
	}
}