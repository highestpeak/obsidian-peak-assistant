import { BooleanExpressionParser } from './boolean-expression-parser';

/**
 * Test cases for the BooleanExpressionParser
 */
function runTests() {
    // Test data
    const testNote = {
        tags: ['javascript', 'react', 'frontend'],
        category: 'programming'
    };

    const testCases = [
        {
            expression: 'tag:javascript',
            expected: true,
            description: 'Simple tag match'
        },
        {
            expression: 'tag:python',
            expected: false,
            description: 'Simple tag non-match'
        },
        {
            expression: 'category:programming',
            expected: true,
            description: 'Simple category match'
        },
        {
            expression: 'category:design',
            expected: false,
            description: 'Simple category non-match'
        },
        {
            expression: 'tag:javascript AND tag:react',
            expected: true,
            description: 'AND operation with both tags present'
        },
        {
            expression: 'tag:javascript AND tag:python',
            expected: false,
            description: 'AND operation with one tag missing'
        },
        {
            expression: 'tag:javascript OR tag:python',
            expected: true,
            description: 'OR operation with one tag present'
        },
        {
            expression: 'tag:python OR tag:vue',
            expected: false,
            description: 'OR operation with both tags missing'
        },
        {
            expression: 'NOT tag:python',
            expected: true,
            description: 'NOT operation with tag absent'
        },
        {
            expression: 'NOT tag:javascript',
            expected: false,
            description: 'NOT operation with tag present'
        },
        {
            expression: '(tag:javascript OR tag:python) AND category:programming',
            expected: true,
            description: 'Complex expression with parentheses'
        },
        {
            expression: 'tag:javascript AND (tag:react OR tag:vue)',
            expected: true,
            description: 'Complex expression with nested conditions'
        },
        {
            expression: 'NOT (tag:python OR tag:vue)',
            expected: true,
            description: 'NOT with complex expression'
        },
        {
            expression: '(tag:javascript AND tag:react) OR (tag:vue AND category:frontend)',
            expected: true,
            description: 'Multiple nested expressions'
        },
        {
            expression: 'tag:javascript',
            expected: true,
            description: 'Single tag (repeated for consistency)'
        },
        {
            expression: 'category:programming',
            expected: true,
            description: 'Single category (repeated for consistency)'
        },
        {
            expression: 'tag:javascript   AND   tag:react',
            expected: true,
            description: 'Extra whitespace handling'
        },
        {
            expression: '( tag:javascript OR tag:python ) AND category:programming',
            expected: true,
            description: 'Whitespace around parentheses'
        },
        {
            expression: 'NOT tag:javascript',
            expected: false,
            description: 'NOT with present tag'
        },
        {
            expression: 'NOT (tag:javascript AND tag:missing)',
            expected: true,
            description: 'NOT with AND expression (one false)'
        },
        {
            expression: 'tag:react AND NOT tag:vue',
            expected: true,
            description: 'AND with NOT operation'
        }
    ];

    // Test extractDimensions
    console.log('Testing extractDimensions...\n');
    let passed = 0;
    let failed = 0;
    const dimensionTests = [
        {
            expression: 'tag:javascript',
            expected: { tags: ['javascript'], categories: [] }
        },
        {
            expression: 'category:programming',
            expected: { tags: [], categories: ['programming'] }
        },
        {
            expression: 'tag:javascript AND category:programming',
            expected: { tags: ['javascript'], categories: ['programming'] }
        },
        {
            expression: '(tag:react OR tag:vue) AND category:frontend',
            expected: { tags: ['react', 'vue'], categories: ['frontend'] }
        },
        {
            expression: 'NOT tag:javascript',
            expected: { tags: ['javascript'], categories: [] }
        },
        {
            expression: 'tag:javascript AND tag:react AND category:programming',
            expected: { tags: ['javascript', 'react'], categories: ['programming'] }
        },
        {
            expression: '(tag:typescript OR tag:python) AND (category:backend OR category:programming)',
            expected: { tags: ['typescript', 'python'], categories: ['backend', 'programming'] }
        },
        {
            expression: 'tag:single-tag',
            expected: { tags: ['single-tag'], categories: [] }
        },
        {
            expression: 'category:single-category',
            expected: { tags: [], categories: ['single-category'] }
        }
    ];

    for (const test of dimensionTests) {
        try {
            const parser = new BooleanExpressionParser(test.expression);
            const ast = parser.ast!;
            const result = parser.extractDimensions();
            const success = JSON.stringify(result) === JSON.stringify(test.expected);
            if (success) {
                console.log(`✅ PASS: extractDimensions("${test.expression}")`);
                passed++;
            } else {
                console.log(`❌ FAIL: extractDimensions("${test.expression}")`);
                console.log(`   Expected: ${JSON.stringify(test.expected)}`);
                console.log(`   Got: ${JSON.stringify(result)}`);
                failed++;
            }
        } catch (error) {
            console.log(`❌ ERROR: extractDimensions("${test.expression}") - ${error.message}`);
            failed++;
        }
    }

    // Test buildEdgeConditions
    console.log('\nTesting buildEdgeConditions...');
    const tagLookup = new Map([
        ['javascript', 'tag:javascript'],
        ['react', 'tag:react'],
        ['vue', 'tag:vue']
    ]);
    const categoryLookup = new Map([
        ['programming', 'category:programming'],
        ['frontend', 'category:frontend']
    ]);

    const edgeConditionTests = [
        {
            expression: 'tag:javascript',
            expected: "(type = 'tagged' AND to_node_id = 'tag:javascript')"
        },
        {
            expression: 'category:programming',
            expected: "(type = 'categorized' AND to_node_id = 'category:programming')"
        },
        {
            expression: 'tag:javascript AND category:programming',
            expected: "((type = 'tagged' AND to_node_id = 'tag:javascript')) AND ((type = 'categorized' AND to_node_id = 'category:programming'))"
        },
        {
            expression: 'tag:javascript OR tag:react',
            expected: "(type = 'tagged' AND to_node_id = 'tag:javascript') OR (type = 'tagged' AND to_node_id = 'tag:react')"
        },
        {
            expression: 'NOT tag:javascript',
            expected: "(type = 'tagged' AND to_node_id = 'tag:javascript')"
        },
        {
            expression: '(tag:javascript OR tag:react) AND category:programming',
            expected: "((type = 'tagged' AND to_node_id = 'tag:javascript') OR (type = 'tagged' AND to_node_id = 'tag:react')) AND ((type = 'categorized' AND to_node_id = 'category:programming'))"
        },
        {
            expression: 'tag:javascript AND tag:react AND tag:vue',
            expected: "(((type = 'tagged' AND to_node_id = 'tag:javascript')) AND ((type = 'tagged' AND to_node_id = 'tag:react'))) AND ((type = 'tagged' AND to_node_id = 'tag:vue'))"
        }
    ];

    for (const test of edgeConditionTests) {
        try {
            const parser = new BooleanExpressionParser(test.expression);
            const result = parser.buildEdgeConditions(tagLookup, categoryLookup);
            const success = result === test.expected;
            if (success) {
                console.log(`✅ PASS: buildEdgeConditions("${test.expression}")`);
                passed++;
            } else {
                console.log(`❌ FAIL: buildEdgeConditions("${test.expression}")`);
                console.log(`   Expected: ${test.expected}`);
                console.log(`   Got: ${result}`);
                failed++;
            }
        } catch (error) {
            console.log(`❌ ERROR: buildEdgeConditions("${test.expression}") - ${error.message}`);
            failed++;
        }
    }

    console.log('\nRunning BooleanExpressionParser tests...\n');

    for (const testCase of testCases) {
        try {
            const parser = new BooleanExpressionParser(testCase.expression);
            const result = parser.rootEvaluate(testNote);

            if (result === testCase.expected) {
                console.log(`✅ PASS: ${testCase.description}`);
                console.log(`   Expression: ${testCase.expression}`);
                console.log(`   Result: ${result}\n`);
                passed++;
            } else {
                console.log(`❌ FAIL: ${testCase.description}`);
                console.log(`   Expression: ${testCase.expression}`);
                console.log(`   Expected: ${testCase.expected}, Got: ${result}\n`);
                failed++;
            }
        } catch (error) {
            console.log(`❌ ERROR: ${testCase.description}`);
            console.log(`   Expression: ${testCase.expression}`);
            console.log(`   Error: ${error.message}\n`);
            failed++;
        }
    }

    console.log(`\nTest Results: ${passed} passed, ${failed} failed`);

    // Test parsing errors
    console.log('\nTesting parsing errors...');
    const errorCases = [
        'tag:', // Incomplete tag
        'category:', // Incomplete category
        'invalid:value', // Invalid dimension type
        'tag:javascript AND', // Incomplete AND
        '(tag:javascript', // Unclosed parenthesis
        'tag:javascript)', // Unmatched parenthesis
        'AND tag:javascript', // Leading operator
        'tag:javascript OR', // Incomplete OR
        'NOT', // NOT without operand
        'tag:javascript tag:react', // Missing operator
        '(tag:javascript AND)', // Empty right operand
        '((tag:javascript)', // Unclosed nested parentheses
        'tag:javascript))', // Extra closing parenthesis
        '', // Empty expression
        '   ', // Only whitespace
        'tag:javascript AND (tag:react OR)', // Incomplete OR in parentheses
        'NOT (tag:javascript AND)', // NOT with incomplete expression
    ];

    for (const errorCase of errorCases) {
        try {
            const parser = new BooleanExpressionParser(errorCase);
            console.log(`❌ FAIL: Should have thrown error for: ${errorCase}`);
            failed++;
        } catch (error) {
            console.log(`✅ PASS: Correctly threw error for: ${errorCase}`);
            passed++;
        }
    }

    console.log(`\nFinal Results: ${passed} passed, ${failed} failed`);
    return failed === 0;
}

// Export for potential use in other test runners
export { runTests };

// Run tests if this file is executed directly
if (typeof window === 'undefined') {
    // Node.js environment
    runTests();
}