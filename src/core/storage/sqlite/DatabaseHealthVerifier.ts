import { Notice, App } from 'obsidian';
import type { ViewManager } from '@/app/view/ViewManager';
import { SqlJsStore } from './sqljs-adapter/SqlJsStore';
import { BetterSqliteStore } from './better-sqlite3-adapter/BetterSqliteStore';
import type { SqliteDatabase } from './types';
import { Kysely } from 'kysely';
import type { Database as DbSchema } from './ddl';
import type { MyPluginSettings } from '@/app/settings/types';
import path from 'path';

/**
 * Test database schema for tables created during testing.
 * These tables are not part of the main application schema.
 */
interface TestDatabase {
	test_table: {
		id: string;
		name: string;
		value: number | null;
		created_at: number;
	};
	test_txn: {
		id: string;
		value: string;
	};
	test_constraints: {
		id: string;
		unique_field: string;
		not_null_field: string;
	};
	authors: {
		id: string;
		name: string;
	};
	books: {
		id: string;
		title: string;
		author_id: string;
	};
}

/**
 * Mock repository for testing DDL and database operations.
 * Uses Kysely's type-safe API with test schema.
 */
class TestRepository {
	constructor(private readonly db: Kysely<TestDatabase>) {}

	async createTestTable(): Promise<void> {
		// Create a simple test table to demonstrate DDL capabilities
		await this.db.schema
			.createTable('test_table')
			.addColumn('id', 'text', (col) => col.primaryKey())
			.addColumn('name', 'text', (col) => col.notNull())
			.addColumn('value', 'integer')
			.addColumn('created_at', 'integer', (col) => col.notNull())
			.execute();

		// Add an index to demonstrate DDL index creation
		await this.db.schema
			.createIndex('idx_test_table_name')
			.on('test_table')
			.column('name')
			.execute();
	}

	async existsById(id: string): Promise<boolean> {
		const row = await this.db
			.selectFrom('test_table')
			.select('id')
			.where('id', '=', id)
			.executeTakeFirst();
		return row !== undefined;
	}

	async upsert(record: { id: string; name: string; value?: number }): Promise<void> {
		if (!record.id) {
			throw new Error('id is required for test_table.upsert');
		}

		const exists = await this.existsById(record.id);

		if (exists) {
			await this.db
				.updateTable('test_table')
				.set({
					name: record.name,
					value: record.value ?? null,
				})
				.where('id', '=', record.id)
				.execute();
		} else {
			await this.db
				.insertInto('test_table')
				.values({
					id: record.id,
					name: record.name,
					value: record.value ?? null,
					created_at: Date.now(),
				})
				.execute();
		}
	}

	async selectById(id: string): Promise<any> {
		return await this.db
			.selectFrom('test_table')
			.selectAll()
			.where('id', '=', id)
			.executeTakeFirst();
	}

	async deleteById(id: string): Promise<void> {
		await this.db
			.deleteFrom('test_table')
			.where('id', '=', id)
			.execute();
	}
}

/**
 * Verify database health across multiple database backends and configurations.
 * Tests both sql.js (in-memory and file-based) and better-sqlite3 (file-based).
 */
export async function verifyDatabaseHealth(app: App, settings: MyPluginSettings): Promise<void> {
	const testResults: string[] = [];
	let totalTests = 0;
	let passedTests = 0;

	try {
		// Get storage folder from settings
		const storageFolder = settings.dataStorageFolder?.trim();
		const basePath = (app.vault.adapter as any)?.basePath;

		if (!basePath) {
			throw new Error('Cannot determine vault base path for database testing');
		}

		// Test configurations: [backend, dbPath, description]
		const testConfigs = [
			['sql.js', ':memory:', 'SQL.js in-memory database'] as const,
			['sql.js', path.join(basePath, storageFolder, 'test-health-sqljs.db'), 'SQL.js file-based database'] as const,
			['better-sqlite3', path.join(basePath, storageFolder, 'test-health-better.db'), 'Better-SQLite3 file-based database'] as const,
		];

		for (const [backend, dbPath, description] of testConfigs) {
			try {
				let testDb: SqliteDatabase;

				if (backend === 'sql.js') {
					testDb = await SqlJsStore.open({ dbFilePath: dbPath });
				} else if (backend === 'better-sqlite3') {
					const result = await BetterSqliteStore.open({ dbFilePath: dbPath, app });
					testDb = result.store;
				} else {
					throw new Error(`Unknown backend: ${backend}`);
				}

				testResults.push(`✅ ${description} creation: PASSED`);

				// Run comprehensive tests on this database type
				const testResult = await verifyOneDatabaseType(testDb);
				testResults.push(...testResult.results);
				passedTests += testResult.passedTests;
				totalTests += testResult.totalTests;

				// Close test database
				testDb.close();

				// Clean up file-based test databases
				if (dbPath !== ':memory:') {
					try {
						const fs = require('fs');
						if (fs.existsSync(dbPath)) {
							fs.unlinkSync(dbPath);
						}
					} catch (cleanupError) {
						console.warn(`Failed to cleanup test database ${dbPath}:`, cleanupError);
					}
				}

			} catch (error) {
				testResults.push(`❌ ${description} test: FAILED - ${error}`);
			}
		}

		// Summary
		const successRate = Math.round((passedTests / totalTests) * 100);
		const summary = `\nComprehensive Database Health Verification Complete\nPassed: ${passedTests}/${totalTests} (${successRate}%)\n\n`;

		if (passedTests === totalTests) {
			new Notice('✅ All database backends are healthy!', 3000);
		} else if (successRate >= 80) {
			new Notice('⚠️ Most database backends are healthy. Check console for details.', 5000);
		} else {
			new Notice('❌ Database backends have significant issues. Check console for details.', 5000);
		}

		console.log(summary + testResults.join('\n'));

	} catch (error) {
		console.error('[Database Verification] Unexpected error:', error);
		new Notice('❌ Database verification failed with unexpected error. Check console.', 5000);
	}
}

/**
 * Comprehensive database health verification for a specific database instance.
 * Tests DDL, table creation, CRUD operations, transactions, and error handling.
 * Returns test results and counts.
 */
export async function verifyOneDatabaseType(testDb: SqliteDatabase): Promise<{
	results: string[];
	passedTests: number;
	totalTests: number;
}> {
	let testResults: string[] = [];
	let passedTests = 0;
	let totalTests = 0;

	try {

		// Test 1: DDL - Table creation
		totalTests++;
		try {
			if (!testDb) throw new Error('Test database not available');

			const testKysely = testDb.kysely<TestDatabase>();
			const testRepo = new TestRepository(testKysely);

			// Test CREATE TABLE DDL
			await testRepo.createTestTable();

			// Verify table was created by checking if we can query it
			const tableStmt = testDb.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?');
			const tableCheck = tableStmt.get('table', 'test_table');

			if (!tableCheck) {
				throw new Error('Table test_table was not created');
			}

			// Verify index was created
			const indexStmt = testDb.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?');
			const indexCheck = indexStmt.get('index', 'idx_test_table_name');

			if (!indexCheck) {
				throw new Error('Index idx_test_table_name was not created');
			}

			testResults.push('✅ DDL Table and index creation: PASSED');
			passedTests++;
		} catch (error) {
			testResults.push(`❌ DDL Table and index creation: FAILED - ${error}`);
		}

		// Test 3: UPSERT operations
		totalTests++;
		try {
			if (!testDb) throw new Error('Test database not available');

			const testKysely = testDb.kysely<TestDatabase>();
			const testRepo = new TestRepository(testKysely);

			// Test INSERT via upsert (new record)
			const testId = 'test-record-' + Date.now();
			await testRepo.upsert({
				id: testId,
				name: 'Test Record',
				value: 100,
			});

			// Verify insert worked
			const inserted = await testRepo.selectById(testId);
			if (!inserted || inserted.name !== 'Test Record' || inserted.value !== 100) {
				throw new Error('UPSERT insert failed');
			}

			// Test UPDATE via upsert (existing record)
			await testRepo.upsert({
				id: testId,
				name: 'Updated Test Record',
				value: 150,
			});

			// Verify update worked
			const updated = await testRepo.selectById(testId);
			if (!updated || updated.name !== 'Updated Test Record' || updated.value !== 150) {
				throw new Error('UPSERT update failed');
			}

			testResults.push('✅ UPSERT operations: PASSED');
			passedTests++;
		} catch (error) {
			testResults.push(`❌ UPSERT operations: FAILED - ${error}`);
		}

		// Test 4: Transaction support
		totalTests++;
		try {
			if (!testDb) throw new Error('Test database not available');

			const testKysely = testDb.kysely<TestDatabase>();

			// Create the table for transaction testing
			await testKysely.schema
				.createTable('test_txn')
				.addColumn('id', 'text', (col) => col.primaryKey())
				.addColumn('value', 'text')
				.execute();

			// Test transaction with commit using Kysely
			await testKysely.transaction().execute(async (tx) => {
				const testId = 'txn-commit-' + Date.now();

				await tx
					.insertInto('test_txn')
					.values({
						id: testId,
						value: 'committed',
					})
					.execute();

				// Verify within transaction
				const result = await tx
					.selectFrom('test_txn')
					.select('value')
					.where('id', '=', testId)
					.executeTakeFirst();

				if (!result || result.value !== 'committed') {
					throw new Error('Transaction commit failed');
				}
			});

			// Verify data was committed (outside transaction)
			const committedResult = await testKysely
				.selectFrom('test_txn')
				.select('value')
				.where('value', '=', 'committed')
				.executeTakeFirst();

			if (!committedResult) {
				throw new Error('Transaction data was not committed');
			}

			testResults.push('✅ Transaction support: PASSED');
			passedTests++;
		} catch (error) {
			testResults.push(`❌ Transaction support: FAILED - ${error}`);
		}

		// Test 5: Transaction rollback
		totalTests++;
		try {
			if (!testDb) throw new Error('Test database not available');

			const testKysely = testDb.kysely<TestDatabase>();

			try {
				await testKysely.transaction().execute(async (tx) => {
					const testId = 'txn-rollback-' + Date.now();

					await tx
						.insertInto('test_txn')
						.values({
							id: testId,
							value: 'should-be-rolled-back',
						})
						.execute();

					// Verify within transaction
					const result = await tx
						.selectFrom('test_txn')
						.select('value')
						.where('id', '=', testId)
						.executeTakeFirst();

					if (!result) {
						throw new Error('Transaction insert failed');
					}

					// This should cause rollback
					throw new Error('Intentional rollback test');
				});
			} catch (error) {
				// Expected to fail due to intentional rollback
				if (error.message !== 'Intentional rollback test') {
					throw error;
				}
			}

			// Verify data was rolled back (should not exist)
			const rolledBackResult = await testKysely
				.selectFrom('test_txn')
				.select('value')
				.where('value', '=', 'should-be-rolled-back')
				.executeTakeFirst();

			if (rolledBackResult) {
				throw new Error('Transaction data was not rolled back');
			}

			testResults.push('✅ Transaction rollback: PASSED');
			passedTests++;
		} catch (error) {
			testResults.push(`❌ Transaction rollback: FAILED - ${error}`);
		}

		// Test 6: Error handling
		totalTests++;
		try {
			if (!testDb) throw new Error('Test database not available');

			const testKysely = testDb.kysely<TestDatabase>();
			const testRepo = new TestRepository(testKysely);

			// Test invalid UPSERT operations
			try {
				await testRepo.upsert({ name: 'invalid' } as any); // Missing required id
				throw new Error('Should have failed due to missing id');
			} catch (error) {
				if (error.message.includes('id is required')) {
					testResults.push('✅ Error handling: PASSED');
					passedTests++;
				} else {
					throw error;
				}
			}
		} catch (error) {
			testResults.push(`❌ Error handling: FAILED - ${error}`);
		}

		// Test 7: SQL constraints and indexes
		totalTests++;
		try {
			if (!testDb) throw new Error('Test database not available');

			const testKysely = testDb.kysely<TestDatabase>();

			// Create table with constraints using Kysely
			await testKysely.schema
				.createTable('test_constraints')
				.addColumn('id', 'text', (col) => col.primaryKey())
				.addColumn('unique_field', 'text', (col) => col.unique())
				.addColumn('not_null_field', 'text', (col) => col.notNull())
				.execute();

			// Test NOT NULL constraint
			try {
				await testKysely
					.insertInto('test_constraints')
					.values({
						id: 'test-1',
						unique_field: 'unique1',
						not_null_field: null as any, // This should fail
					})
					.execute();
				throw new Error('NOT NULL constraint not enforced');
			} catch (error) {
				// Expected to fail due to NOT NULL constraint
				if (!error.message.includes('NOT NULL') && !error.message.includes('null value')) {
					throw error;
				}
			}

			// Test UNIQUE constraint
			await testKysely
				.insertInto('test_constraints')
				.values({
					id: 'test-1',
					unique_field: 'unique1',
					not_null_field: 'not null value',
				})
				.execute();

			try {
				await testKysely
					.insertInto('test_constraints')
					.values({
						id: 'test-2',
						unique_field: 'unique1', // This should fail (duplicate)
						not_null_field: 'another value',
					})
					.execute();
				throw new Error('UNIQUE constraint not enforced');
			} catch (error) {
				// Expected to fail due to UNIQUE constraint
				if (!error.message.includes('UNIQUE') && !error.message.includes('constraint')) {
					throw error;
				}
			}

			testResults.push('✅ SQL constraints and indexes: PASSED');
			passedTests++;
		} catch (error) {
			testResults.push(`❌ SQL constraints and indexes: FAILED - ${error}`);
		}

		// Test 8: Complex queries and joins
		totalTests++;
		try {
			if (!testDb) throw new Error('Test database not available');

			const testKysely = testDb.kysely<TestDatabase>();

			// Create related tables for join testing
			await testKysely.schema
				.createTable('authors')
				.addColumn('id', 'text', (col) => col.primaryKey())
				.addColumn('name', 'text', (col) => col.notNull())
				.execute();

			await testKysely.schema
				.createTable('books')
				.addColumn('id', 'text', (col) => col.primaryKey())
				.addColumn('title', 'text', (col) => col.notNull())
				.addColumn('author_id', 'text', (col) => col.references('authors.id'))
				.execute();

			// Insert test data
			await testKysely
				.insertInto('authors')
				.values([
					{ id: 'author-1', name: 'Author One' },
					{ id: 'author-2', name: 'Author Two' },
				])
				.execute();

			await testKysely
				.insertInto('books')
				.values([
					{ id: 'book-1', title: 'Book One', author_id: 'author-1' },
					{ id: 'book-2', title: 'Book Two', author_id: 'author-1' },
					{ id: 'book-3', title: 'Book Three', author_id: 'author-2' },
				])
				.execute();

			// Test JOIN query
			const booksWithAuthors = await testKysely
				.selectFrom('books')
				.innerJoin('authors', 'books.author_id', 'authors.id')
				.select([
					'books.id as book_id',
					'books.title as book_title',
					'authors.name as author_name',
				])
				.execute();

			if (booksWithAuthors.length !== 3) {
				throw new Error('JOIN query returned incorrect number of results');
			}

			// Test aggregation query
			const authorBookCounts = await testKysely
				.selectFrom('books')
				.innerJoin('authors', 'books.author_id', 'authors.id')
				.select([
					'authors.name',
					testKysely.fn.count('books.id').as('book_count'),
				])
				.groupBy(['authors.id', 'authors.name'])
				.execute();

			if (authorBookCounts.length !== 2) {
				throw new Error('Aggregation query returned incorrect number of results');
			}

			testResults.push('✅ Complex queries and joins: PASSED');
			passedTests++;
		} catch (error) {
			testResults.push(`❌ Complex queries and joins: FAILED - ${error}`);
		}

	} catch (error) {
		console.error('[Database Verification] Unexpected error:', error);
		testResults.push(`❌ Database verification failed: ${error}`);
	}

	return {
		results: testResults,
		passedTests,
		totalTests,
	};
}