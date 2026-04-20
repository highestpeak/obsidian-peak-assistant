import { buildCoCitationQuery } from '../src/service/search/coCitationService';

console.log('=== buildCoCitationQuery ===');

// Produces SQL with correct table references
{
	const { sql } = buildCoCitationQuery('node-123', 10);
	const tables = ['mobius_edge', 'mobius_node'];
	for (const table of tables) {
		console.assert(sql.includes(table), `SQL should reference ${table}`);
	}
	console.log('PASS: SQL references correct tables');
}

// SQL references correct column names
{
	const { sql } = buildCoCitationQuery('node-123', 10);
	const expected = ['from_node_id', 'to_node_id', 'e1', 'e2', 'shared_citer_count'];
	for (const col of expected) {
		console.assert(sql.includes(col), `SQL should contain "${col}"`);
	}
	console.log('PASS: SQL contains expected columns and aliases');
}

// Source node ID appears in params (twice — for e1.to_node_id = ? AND e2.to_node_id != ?)
{
	const sourceId = 'src-node-abc';
	const { params } = buildCoCitationQuery(sourceId, 15);
	const srcOccurrences = params.filter((p) => p === sourceId).length;
	console.assert(srcOccurrences === 2, `Source node ID should appear twice in params, got ${srcOccurrences}`);
	console.log('PASS: source node ID appears twice in params');
}

// Limit value appears in params
{
	const { params } = buildCoCitationQuery('node-xyz', 7);
	console.assert(params[params.length - 1] === 7, 'Last param should be the limit');
	console.log('PASS: limit appears as last param');
}

// Different source IDs produce different queries
{
	const { params: p1 } = buildCoCitationQuery('id-one', 5);
	const { params: p2 } = buildCoCitationQuery('id-two', 5);
	console.assert(p1[0] !== p2[0], 'Different source IDs should yield different params');
	console.log('PASS: source node ID is correctly parameterized');
}

// SQL has HAVING clause for minimum shared citers
{
	const { sql } = buildCoCitationQuery('node-123', 10);
	console.assert(sql.includes('HAVING'), 'SQL should contain HAVING clause for minimum threshold');
	console.log('PASS: SQL includes HAVING clause');
}

// SQL has ORDER BY for relevance ranking
{
	const { sql } = buildCoCitationQuery('node-123', 10);
	console.assert(sql.includes('ORDER BY'), 'SQL should contain ORDER BY clause');
	console.log('PASS: SQL includes ORDER BY clause');
}

console.log('=== All buildCoCitationQuery tests passed ===');
