## Development

### Hot Reload Setup

This project supports hot reload for faster development. Follow these steps:

1. **Install obsidian-hot-reload plugin** (if not already installed):
   - Download from [GitHub](https://github.com/pjeby/hot-reload)
   - Extract to `.obsidian/plugins/hot-reload` in your test vault
   - Enable the plugin in Obsidian settings

2. **Enable hot reload for this plugin**:
   - The `.hotreload` file has been created in the plugin root directory
   - This file signals the hot-reload plugin to watch this plugin for changes

3. **Start development mode**:
   ```bash
   npm run dev
   ```
   This will:
   - Watch TypeScript files and rebuild `main.js` on changes (via esbuild watch mode)
   - Watch Tailwind CSS files and rebuild `styles.css` on changes
   - Run both watchers in parallel

4. **Development workflow**:
   - Make changes to your TypeScript/React code
   - Save the file
   - The build process will automatically compile changes
   - The hot-reload plugin will detect the new `main.js` or `styles.css`
   - Obsidian will automatically reload the plugin

**Note**: The `dev` script uses `npm-run-all` to run both TypeScript and Tailwind watchers in parallel. The esbuild watch mode is configured in `esbuild.config.mjs`.

### Build Scripts

- `npm run dev` - Start development mode with file watching (TypeScript + Tailwind)
- `npm run build` - Build for production (minified, no sourcemaps)
- `npm run build:css` - Build only CSS files

### Testing

The project includes unit tests for critical components to ensure code quality and prevent regressions.

**Running All Tests:**
```bash
npm run test
```

**Running Specific Test File:**
```bash
npm run test -- path/to/specific.test.ts
```

**Available Test Commands:**
- `npm run test` - Run all `.test.ts` files found in the `src/` directory
- `npm run test -- src/service/tools/search-graph-inspector/boolean-expression-parser.test.ts` - Run specific test file

**Current Test Coverage:**

**Boolean Expression Parser** (`boolean-expression-parser.test.ts` - 54 tests):
- Basic tag and category matching
- AND, OR, NOT logical operations
- Complex nested expressions with parentheses
- Whitespace handling
- Syntax error detection and proper error messages
- `extractDimensions` - Extracting tags and categories from expressions
- `buildEdgeConditions` - Building SQL WHERE conditions
- `evaluate` - Boolean expression evaluation against note data

**Chat Conversation Document** (`ChatConversationDoc.test.ts`):
- Markdown generation with different configurations
- Message deduplication and hash handling
- Content parsing and formatting

**Test Framework Features:**
- Automatic compilation of TypeScript test files using esbuild
- Detailed pass/fail reporting with test counts
- Error handling for missing test files
- Automatic cleanup of temporary build artifacts
- Support for running individual test files or all tests

All tests should pass before committing changes. The test runner will report the total number of passed/failed test files.

## Project Structure Explanation

This project is organized into logical modules that separate concerns for maintainability and extensibility. Below is a detailed explanation of the directory structure:

```
src/
|-- app/                          # Application layer - Obsidian plugin integration
|   |-- commands/                 # Command registration (Register.ts exports command builders)
|   |-- events/                   # Event registration (Register.ts handles workspace events)
|   |-- settings/                 # Plugin settings management
|   |-- view/                     # View management and lifecycle
|
|-- core/                         # Core layer - foundational abstractions and utilities
|   |-- document/                 # Document model and caching
|   |-- storage/                  # Storage abstraction layer
|   |-- utils/                    # Pure utility functions
|   |-- po/                       # model class for database table or file
|   |-- eventBus.ts               # Event bus for cross-view communication
|   |-- EventDispatcher.ts        # Event dispatching utilities
|   |-- HtmlView.ts               # HTML view rendering utilities
|   |-- ScriptLoader.ts           # Script loading utilities
|
|-- service/                      # Service layer - business logic
|   |-- chat/                     # Chat service
|   |-- search/                   # Search service
|   |-- tools/                    # Tool integrations for agent logic
|
|-- ui/                           # UI layer - React components and views
|   |-- store/                    # Global stores (shared across views)
|   |-- view/                     # View implementations
|   |   |-- chat-view/            # Chat view
|   |   |-- project-list-view/    # Project list view
|   |   |-- message-history-view/ # Message history view
|   |   |-- quick-search/         # Quick search modal
|   |   |-- settings/             # Settings view
|   |   |-- shared/               # Shared view utilities
|   |-- component/                # Reusable React components
|   |   |-- shared-ui/            # Shared UI components (button, dialog, input, etc.)
|   |-- context/                  # React context providers
|   |-- react/                    # React integration utilities
|   |   |-- ReactRenderer.tsx     # React rendering bridge
|   |   |-- ReactElementFactory.tsx  # React element factory
|   |   |-- lib/                  # React utilities (ErrorBoundary, etc.)
|   |-- utils/                    # UI utilities (toast, etc.)
|
|-- styles/                       # Styles
|   |-- tailwind.css              # Tailwind CSS styles
|
|-- types/                        # Type definitions
|   |-- pdfjs-dist.d.ts           # PDF.js type definitions
```

### Key Concepts

#### Directory Organization Principles

- **app/**: Application layer that integrates with Obsidian. Commands and events are registered here but follow a pattern where `Register.ts` files export builder functions that are called during plugin initialization. This keeps the integration layer thin and testable.

- **core/**: Core abstractions that are independent of Obsidian and business logic. This layer provides:
  - Document models that can be used across plugins
  - Storage abstractions that allow different backends (vault, SQLite, etc.)
  - Pure utility functions with no side effects
  - Event bus for decoupled communication

- **service/**: Business logic layer that implements features like chat and search. Services are organized by domain (chat, search) and contain:
  - Provider implementations (AI providers, storage backends)
  - Domain-specific logic
  - Data transformation and processing

- **ui/**: UI layer using React. Store organization follows a scope principle:
  - **Global stores** (`ui/store/`): Shared state across all views (e.g., `messageStore` for streaming, `projectStore` for project/conversation data)
  - **View-scoped stores** (`ui/view/*/store/`): State specific to a view (e.g., `chatViewStore` for chat view modes, search stores for search state)
  - This separation ensures views can be independent while sharing common data

### Design Principles

- **Separation of Concerns**: Each layer has a clear responsibility (app integration, core abstractions, business logic, UI)
- **Extensibility**: Adding new document types, storage backends, or AI providers requires minimal changes, confined to their respective modules
- **Store Scope**: Global stores for shared state, view-scoped stores for view-specific state
- **Event-Driven**: Uses event bus for cross-view communication, keeping components decoupled
- **Type Safety**: Strong TypeScript typing throughout, with shared type definitions

This structure enables the project to scale as new features, providers, or storage backends are added.
