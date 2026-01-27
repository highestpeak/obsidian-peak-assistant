# Graph Inspector DevTools Guide

This guide explains how to use the global testing interface in the Obsidian environment to individually test search-graph-inspector tools.

## Enabling DevTools

1. Open Obsidian
2. Go to plugin settings (Settings → Peak Assistant)
3. In the "General" tab, find the "Developer Tools" section
4. Enable the "Enable DevTools Graph Inspector" option
5. **Takes effect immediately** - No need to restart Obsidian, settings apply automatically

### Dynamic Switching

- **Enable**: After toggling the switch, `window.testGraphTools` becomes immediately available
- **Disable**: After toggling the switch, `window.testGraphTools` is immediately removed
- **Real-time response**: Settings changes reflect immediately without restarting the plugin

## Using in DevTools

### Opening DevTools

Press `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (Mac) in Obsidian to open developer tools, then switch to the Console tab.

### Available Methods

Once enabled, you can use the `window.testGraphTools` object in the console:

```javascript
// Check if tools are available
window.testGraphTools

// Get application info
await window.testGraphTools.getAppInfo()

// Inspect a note's context
await window.testGraphTools.inspectNote("path/to/your/note.md")

// Perform graph traversal (1 hop)
await window.testGraphTools.graphTraversal("path/to/note.md", 1, 20)

// Perform graph traversal (2 hops, including semantic paths)
await window.testGraphTools.graphTraversal("path/to/note.md", 2, 20)

// Find path between two notes
await window.testGraphTools.findPath("start/note.md", "end/note.md")

// Find key nodes (most influential notes)
await window.testGraphTools.findKeyNodes(10)

// Find orphan notes (unlinked notes)
await window.testGraphTools.findOrphans(10)

// Search by dimensions (using boolean expressions)
await window.testGraphTools.searchByDimensions("tag:important AND category:work")

// Explore folder
await window.testGraphTools.exploreFolder("my-folder", true, 2)

// Recent changes
await window.testGraphTools.getRecentChanges(10)

// Local search (fulltext search)
await window.testGraphTools.localSearch("machine learning", "fulltext", 10)

// Local search (vector search)
await window.testGraphTools.localSearch("machine learning", "vector", 10)

// Local search (hybrid search)
await window.testGraphTools.localSearch("machine learning", "hybrid", 10)

// Generic execute method (supports all parameters)
await window.testGraphTools.execute({
    mode: 'graph_traversal',
    start_note_path: 'note.md',
    hops: 2,
    include_semantic_paths: true,
    semantic_filter: { query: 'AI and machine learning', topK: 10 },
    limit: 20
})
```

## Batch Testing Script

You can copy and paste the following script into the console for batch testing:

```javascript
// Batch testing script
async function runGraphTests() {
    console.log('🚀 Starting Graph Inspector Tests...');

    try {
        // 1. Get application info
        const appInfo = await window.testGraphTools.getAppInfo();
        console.log('📊 App Info:', appInfo);

        // 2. List some files
        const files = await window.testGraphTools.listAllFiles(5);
        console.log('📁 Sample Files:', files);

        // 3. If there are files, test note inspection
        if (files.length > 0) {
            const firstNote = files.find(f => f.path.endsWith('.md'));
            if (firstNote) {
                console.log('🔍 Inspecting note:', firstNote.path);
                const noteInfo = await window.testGraphTools.inspectNote(firstNote.path);
                console.log('📝 Note Info:', noteInfo);
            }
        }

        // 4. Test orphan notes finding
        console.log('👻 Finding orphan notes...');
        const orphans = await window.testGraphTools.findOrphans(5);
        console.log('🧹 Orphan Notes:', orphans);

        // 5. Test key nodes finding
        console.log('⭐ Finding key nodes...');
        const keyNodes = await window.testGraphTools.findKeyNodes(5);
        console.log('🎯 Key Nodes:', keyNodes);

        console.log('✅ All tests completed!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run tests
runGraphTests();
```

## Method Descriptions

### inspectNote(notePath, includeSemantic = false)
- **Parameters**: notePath (string) - Note path, includeSemantic (boolean) - Whether to include semantic paths
- **Returns**: Detailed context information of the note

### graphTraversal(startPath, hops = 1, limit = 20)
- **Parameters**: startPath (string) - Starting note path, hops (number) - Number of traversal hops, limit (number) - Result limit
- **Returns**: Graph traversal results, containing related notes and their connections

### findPath(startPath, endPath)
- **Parameters**: startPath (string) - Starting note path, endPath (string) - Target note path
- **Returns**: Connection path between two notes

### findKeyNodes(limit = 20)
- **Parameters**: limit (number) - Maximum number of results to return
- **Returns**: List of most influential notes

### findOrphans(limit = 20)
- **Parameters**: limit (number) - Maximum number of results to return
- **Returns**: List of orphan notes (notes without connections)

### searchByDimensions(expression, limit = 20)
- **Parameters**: expression (string) - Boolean search expression, limit (number) - Maximum number of results to return
- **Returns**: List of notes matching the search criteria

### exploreFolder(folderPath = "/", recursive = true, maxDepth = 2)
- **Parameters**: folderPath (string) - Folder path, recursive (boolean) - Whether to recurse, maxDepth (number) - Maximum depth
- **Returns**: Folder structure and contents

### getRecentChanges(limit = 20)
- **Parameters**: limit (number) - Maximum number of results to return
- **Returns**: List of recently modified notes

### localSearch(query, searchMode = 'hybrid', limit = 20)
- **Parameters**: query (string) - Search query, searchMode ('fulltext'|'vector'|'hybrid') - Search mode, limit (number) - Maximum number of results to return
- **Returns**: Search results

### execute(params)
- **Parameters**: params (object) - Complete tool parameter object
- **Returns**: Tool execution result

## Important Notes

1. **Asynchronous operations**: All methods are asynchronous and require `await`
2. **Error handling**: Tools log detailed error information to the console
3. **Performance**: Some operations (like graph traversal) may take considerable time
4. **Data format**: Results are returned in different formats based on the `response_format` parameter
5. **Security**: Test tools are only loaded when the setting is enabled
6. **Dynamic switching**: Can be enabled/disabled at runtime without restarting Obsidian
7. **Real-time effect**: Settings changes take effect immediately without reloading the plugin

## Example Usage

```javascript
// Inspect a specific note
await window.testGraphTools.inspectNote("My Notes/Project Ideas.md");

// Find all notes related to a note (2 degrees of separation)
await window.testGraphTools.graphTraversal("My Notes/Project Ideas.md", 2);

// Search for all notes with "react" tag and "frontend" category
await window.testGraphTools.searchByDimensions("tag:react AND category:frontend");

// Explore the Documents folder
await window.testGraphTools.exploreFolder("Documents", true, 3);
```