#!/usr/bin/env node

/**
 * Universal Test Runner for TypeScript Test Files
 *
 * This script automates the testing process for TypeScript test files:
 * 1. Uses esbuild to compile TypeScript test files into CommonJS format
 * 2. Runs the compiled JavaScript test files using Node.js
 * 3. Automatically cleans up temporary files
 * 4. Displays detailed test results with pass/fail indicators
 *
 * Usage:
 *   node run-test.js                           # Run all .test.ts files in src/
 *   node run-test.js path/to/specific.test.ts   # Run specific test file
 *   npm run test                               # Run all tests (alias)
 *   npm run test -- path/to/specific.test.ts    # Run specific test file
 *
 * Examples:
 *   npm run test
 *   npm run test -- src/service/tools/search-graph-inspector/boolean-expression-parser.test.ts
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get command line arguments (skip 'node' and script name)
const args = process.argv.slice(2);
let testFiles = [];

// Determine which test files to run
if (args.length > 0) {
    // Specific test file(s) provided
    testFiles = args.map(arg => {
        // Ensure .test.ts extension if not provided
        return arg.endsWith('.test.ts') ? arg : `${arg}.test.ts`;
    });
} else {
    // Find all .test.ts files in src/ directory
    function findTestFiles(dir) {
        const files = [];
        const items = fs.readdirSync(dir);

        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                files.push(...findTestFiles(fullPath));
            } else if (item.endsWith('.test.ts')) {
                files.push(fullPath);
            }
        }

        return files;
    }

    testFiles = findTestFiles('src');
}

if (testFiles.length === 0) {
    console.log('❌ No test files found!');
    process.exit(1);
}

console.log(`Running ${testFiles.length} test file(s)...\n`);

let totalPassed = 0;
let totalFailed = 0;

for (const testFile of testFiles) {
    const testName = path.basename(testFile, '.test.ts');
    console.log(`📋 Running tests for: ${testName}`);

    try {
        // Step 1: Compile TypeScript test file using esbuild
        // - Bundle the test file and its dependencies
        // - Output as CommonJS format for Node.js compatibility
        // - Target Node.js platform for proper module resolution
        execSync(`npx esbuild ${testFile} --bundle --format=cjs --outfile=temp-test.js --platform=node`, {
            stdio: 'inherit',
            cwd: process.cwd()
        });

        // Step 2: Execute the compiled test file
        // - Runs all test cases defined in the test file
        // - Displays detailed results for each test
        execSync('node temp-test.js', {
            stdio: 'inherit',
            cwd: process.cwd()
        });

        console.log(`✅ ${testName} tests completed successfully!\n`);

    } catch (error) {
        console.error(`❌ ${testName} tests failed:`, error.message);
        totalFailed++;
        // Continue to next test file instead of exiting immediately
    } finally {
        // Step 3: Clean up temporary files
        // - Remove the compiled test file to keep the workspace clean
        // - Ignore any cleanup errors that might occur
        try {
            execSync('rm -f temp-test.js');
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

if (totalFailed === 0) {
    console.log(`🎉 All ${testFiles.length} test file(s) completed successfully!`);
} else {
    console.log(`⚠️  ${totalFailed} test file(s) failed out of ${testFiles.length}`);
    process.exit(1);
}