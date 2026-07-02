# Desktop Development Environment

A standalone desktop development environment for rapidly developing and testing UI components in the browser without requiring the Obsidian environment.

## Features

- ✅ Standalone web development environment (based on Vite + React)
- ✅ Mock service layer, no real Obsidian API required
- ✅ Support for developing and testing all major UI components
- ✅ Fast hot reload for improved development efficiency

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev:desktop
```

The development server will start at `http://localhost:3000` and automatically open the browser.

### 3. Develop UI Components

Add new routes and pages in `src/desktop/DesktopRouter.tsx`, or directly modify existing UI components.

## Directory Structure

```
src/desktop/
├── mocks/                    # Mock service layer
│   ├── services/             # Our own service mocks
│   │   ├── MockApp.ts        # Mock Obsidian App
│   │   ├── MockEventBus.ts   # Mock EventBus
│   │   ├── MockAIServiceManager.ts  # Mock AI Service Manager
│   │   ├── MockViewManager.ts       # Mock View Manager
│   │   ├── MockSearchClient.ts      # Mock Search Client
│   │   └── MockPlugin.ts            # Mock Plugin
│   ├── libs/                  # Third-party library mocks
│   │   ├── obsidian-mock.ts   # Mock Obsidian package
│   │   ├── crypto-mock.ts     # Mock Node.js crypto module
│   │   ├── mammoth-mock.ts    # Mock mammoth library
│   │   ├── officeparser-mock.ts  # Mock officeparser library
│   │   ├── playwright-mock.ts    # Mock playwright library
│   │   └── langchain-playwright-mock.ts  # Mock langchain playwright loader
│   └── index.ts              # Export all service mocks
├── App.tsx                   # Main application component
├── DesktopRouter.tsx         # Router component
├── main.tsx                  # Entry file
└── index.html                # HTML template
```

## Mock Services

Mock services are organized into two categories:

### Service Mocks (`mocks/services/`)

Our own service layer mocks:

- **MockApp**: Mocks Obsidian's App object, provides basic vault, workspace APIs, etc.
- **MockEventBus**: Mocks event bus, supports event subscription and dispatch
- **MockAIServiceManager**: Mocks AI service manager, returns mock conversation and project data
- **MockViewManager**: Mocks view manager
- **MockSearchClient**: Mocks search client
- **MockPlugin**: Mocks plugin instance for settings page

### Library Mocks (`mocks/libs/`)

Third-party library mocks for browser compatibility:

- **obsidian-mock.ts**: Mocks Obsidian package (only exists in Obsidian environment)
- **crypto-mock.ts**: Mocks Node.js crypto module (browser has different Web Crypto API)
- **mammoth-mock.ts**: Mocks mammoth library (Node.js library, depends on Buffer)
- **officeparser-mock.ts**: Mocks officeparser library (Node.js library)
- **playwright-mock.ts**: Mocks playwright library (browser automation tool)
- **langchain-playwright-mock.ts**: Mocks langchain playwright loader

## Mock Design Principles

### Why Do We Need Mocks?

The Obsidian plugin runs in **two different environments**:

1. **Obsidian Environment (Electron)**
   - Based on Electron (Chromium + Node.js)
   - Has full Node.js runtime available
   - Can use Node.js APIs like `crypto`, `fs`, `Buffer`, etc.
   - Has Obsidian-specific APIs

2. **Browser Environment (Desktop Dev)**
   - Pure browser environment (Chrome/Firefox/Safari)
   - Only has Web APIs (DOM, Web Crypto API, etc.)
   - **No Node.js runtime**
   - **No Obsidian APIs**

### How Mocks Work

We use **Vite alias configuration** to automatically redirect imports:

```typescript
// Same code works in both environments
import { createHash } from 'crypto';

// In Obsidian (esbuild):
//   → Uses real Node.js crypto module ✅

// In Browser (Vite):
//   → Vite alias redirects to crypto-mock.ts ✅
```

### Mock Categories

#### 1. **Must Mock** (Cannot run in browser)

These libraries **cannot** run in browser and must be mocked:

- **`obsidian`** - Only exists in Obsidian environment
- **`playwright`** - Browser automation tool, cannot run in browser
- **`crypto`** - Node.js crypto module (browser has different Web Crypto API)
- **`mammoth`** - Node.js library, depends on `Buffer` and Node.js APIs
- **`officeparser`** - Node.js library, depends on Node.js APIs

#### 2. **Use Real Library** (Can run in browser)

These libraries **can** run in browser and should use real implementations:

- **`@antv/g2`** - Browser charting library (installed in package.json)
- Other browser-compatible libraries

### Implementation Details

#### Vite Configuration

The `vite.config.ts` uses alias to redirect Node.js-only modules to library mocks:

```typescript
resolve: {
  alias: {
    'crypto': path.resolve(__dirname, 'src/desktop/mocks/libs/crypto-mock.ts'),
    'obsidian': path.resolve(__dirname, 'src/desktop/mocks/libs/obsidian-mock.ts'),
    'mammoth': path.resolve(__dirname, 'src/desktop/mocks/libs/mammoth-mock.ts'),
    // ... other library mocks
  }
}
```

**Note**: Service mocks (in `mocks/services/`) are imported directly in code, not via Vite alias.

#### Mock Implementation Pattern

Mocks should:
1. **Match the API** - Provide the same interface as the real library
2. **Be functional** - Return reasonable mock data instead of throwing errors
3. **Log warnings** - Inform developers that mock is being used
4. **Support both types and values** - Export both TypeScript types and runtime values

Example:
```typescript
// obsidian-mock.ts
export class TFile {}  // Can be used as both type and value
export type App = any; // TypeScript type
```

### Code Compatibility

The same source code works in both environments:

```typescript
// src/core/utils/hash-utils.ts
import { createHash } from 'crypto';  // Same import

export function hashMD5(str: string): string {
  // In Obsidian: uses real Node.js crypto
  // In Browser: uses crypto-mock via Vite alias
  return createHash('md5').update(str).digest('hex');
}
```

**Build Systems:**
- **Obsidian**: `esbuild` bundles for Electron (Node.js available)
- **Browser**: `Vite` bundles for browser (uses mocks via alias)

## Adding New Pages

1. Add a new route button in `DesktopRouter.tsx`
2. Add corresponding rendering logic in the `renderView()` function
3. Create additional mock data in `DesktopRouter.tsx` if needed

## Notes

- This environment is for UI development only, does not involve file I/O or other Obsidian operations
- Service layer uses mock implementations that return simulated data
- For testing real data interactions, test in the Obsidian environment

## Building for Production

```bash
npm run build:desktop
```

Build output will be written to the `dist-desktop/` directory.

## Ensuring Style Consistency

To ensure that the desktop development environment uses the same styles as the Obsidian plugin:

### 1. Style Files Loading

The desktop environment loads the same style files as Obsidian:
- `@/styles/tailwind.css` - Tailwind CSS with `pktw-` prefix (plugin UI styles)
- `@/styles/streamdown.css` - Streamdown scoped styles (markdown rendering)

These are imported in `src/desktop/main.tsx`:
```typescript
import '@/styles/tailwind.css';
import '@/styles/streamdown.css';
```

### 2. CSS Variables

The `index.html` file defines Obsidian CSS variables that are used by custom CSS classes (e.g., `.peak-settings-tab-item`). These variables match Obsidian's default light theme values:

```css
:root {
  --background-primary: var(--background-primary, #ffffff);
  --background-secondary: var(--background-secondary, #f7f6f3);
  --background-modifier-border: var(--background-modifier-border, rgba(0, 0, 0, 0.08));
  /* ... */
}
```

**Note**: Tailwind classes (`pktw-*`) use colors from `tailwind.config.js` and are completely isolated from Obsidian CSS variables.

### 3. Tailwind Configuration

All Tailwind utilities use the `pktw-` prefix and are configured in `tailwind.config.js`:
- Colors: `border: 'rgba(128, 128, 128, 0.15)'`
- Important: All utilities have `!important` to override Obsidian's global styles
- Preflight: Disabled to avoid conflicts with Obsidian

### 4. Verifying Style Consistency

To verify that styles match between environments:

1. **Check Style Files Are Loaded**:
   - Open browser DevTools (F12)
   - Go to Network tab
   - Reload the page
   - Verify `tailwind.css` and `streamdown.css` are loaded

2. **Compare CSS Variables**:
   - In Obsidian: Open DevTools → Elements → Check `:root` CSS variables
   - In Desktop: Open DevTools → Elements → Check `:root` CSS variables
   - Compare values (they should match for light theme)

3. **Inspect Element Styles**:
   - Select an element in both environments
   - Compare computed styles
   - Tailwind classes should have the same values (e.g., `pktw-border-border` → `border-color: hsla(0,0%,50%,.15)`)

4. **Rebuild Styles** (if needed):
   ```bash
   npm run build:tailwind
   npm run build:streamdown
   ```

### 5. Common Issues

- **Styles not updating**: Hard refresh browser (`Ctrl+Shift+R` or `Cmd+Shift+R`)
- **Border colors different**: Check `tailwind.config.js` → `colors.border` value
- **Background colors different**: Check `tailwind.config.js` → `colors.background` value
- **Custom CSS classes not working**: Verify CSS variables are defined in `index.html`

