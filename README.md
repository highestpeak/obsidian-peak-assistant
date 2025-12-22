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
