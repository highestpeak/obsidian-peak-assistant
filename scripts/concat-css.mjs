import fs from "fs";
import path from "path";

/**
 * Concatenate CSS assets into the final `styles.css`.
 *
 * OVERALL STRATEGY:
 * =================
 * We build three separate CSS outputs and merge them:
 *
 * 1. Plugin UI Styles (`styles.tailwind.css`):
 *    - Prefixed Tailwind utilities (`pktw-*`)
 *    - Used for our plugin's UI components (buttons, modals, etc.)
 *    - Built from `src/styles/tailwind.css`
 *
 * 2. Streamdown Styles (`styles.streamdown.css`):
 *    - Scoped Tailwind utilities (`[data-streamdown-root] .*`)
 *    - Used for markdown rendering (code blocks, tables, math, etc.)
 *    - Built from `src/styles/streamdown.css` with `tailwind.streamdown.config.js`
 *    - Completely isolated from Obsidian's global styles
 *
 * 3. KaTeX Styles (`node_modules/katex/dist/katex.min.css`):
 *    - Required for proper math formula rendering
 *    - Hides MathML fallback, provides correct layout
 *    - Without this, formulas show raw LaTeX alongside rendered output
 *
 * WHY MERGE:
 * ==========
 * - Obsidian plugins load a single `styles.css` file
 * - We need all three stylesheets to work together
 * - Order matters: plugin UI → streamdown → KaTeX
 *
 * NOTES:
 * ======
 * - This script is non-opinionated about minification; it just concatenates
 * - All comments in code must be English (project convention)
 * - Supports watch mode for development (`node concat-css.mjs watch`)
 */

const root = process.cwd();
const outFile = path.join(root, "styles.css");
const tailwindFile = path.join(root, "styles.tailwind.css");
const streamdownFile = path.join(root, "styles.streamdown.css");
const katexFile = path.join(root, "node_modules/katex/dist/katex.min.css");
const katexFontsDir = path.join(root, "node_modules/katex/dist/fonts");
const pluginFontsDir = path.join(root, "fonts");

/**
 * Copy KaTeX font files to plugin directory and fix CSS paths.
 *
 * Why:
 * - KaTeX CSS uses relative paths like `fonts/KaTeX_*.woff2`
 * - Obsidian plugins need fonts in a location accessible via the plugin's base path
 * - We copy fonts to `fonts/` in plugin root and update CSS paths
 */
function setupKatexFonts() {
  // Create fonts directory if it doesn't exist
  if (!fs.existsSync(pluginFontsDir)) {
    fs.mkdirSync(pluginFontsDir, { recursive: true });
  }

  // Copy all KaTeX font files
  if (fs.existsSync(katexFontsDir)) {
    const fontFiles = fs.readdirSync(katexFontsDir);
    for (const file of fontFiles) {
      if (file.endsWith(".woff2") || file.endsWith(".woff") || file.endsWith(".ttf")) {
        const src = path.join(katexFontsDir, file);
        const dest = path.join(pluginFontsDir, file);
        fs.copyFileSync(src, dest);
      }
    }
  }
}

/**
 * Fix KaTeX CSS font paths by converting fonts to base64 data URIs.
 *
 * Why:
 * - Obsidian plugins have issues with relative font paths in CSS
 * - The browser tries to load fonts from `app://obsidian.md/fonts/` instead of plugin directory
 * - Base64 data URIs work reliably in all contexts and don't require separate file requests
 *
 * Implementation:
 * - Converts all font files (woff2, woff, ttf) to base64 data URIs
 * - Replaces all `url(fonts/KaTeX_*.woff2)` patterns in CSS
 * - This increases CSS file size (~1.5MB) but ensures fonts always load
 *
 * Note:
 * - woff2 is preferred (smallest, best browser support)
 * - woff and ttf are included as fallbacks in @font-face rules
 */
function fixKatexPaths(css) {
  if (!fs.existsSync(pluginFontsDir)) {
    return css;
  }

  const fontFiles = fs.readdirSync(pluginFontsDir);
  const fontMap = new Map();

  // Read all font files and convert to base64
  // Priority: woff2 (smallest, best support) > woff > ttf
  for (const file of fontFiles) {
    if (file.endsWith(".woff2") || file.endsWith(".woff") || file.endsWith(".ttf")) {
      const fontPath = path.join(pluginFontsDir, file);
      try {
        const fontData = fs.readFileSync(fontPath);
        const base64 = fontData.toString("base64");
        let mimeType = "font/woff2";
        if (file.endsWith(".woff")) {
          mimeType = "font/woff";
        } else if (file.endsWith(".ttf")) {
          mimeType = "font/truetype";
        }
        const dataUri = `data:${mimeType};base64,${base64}`;
        fontMap.set(file, dataUri);
      } catch (err) {
        console.warn(`Failed to read font ${file}:`, err.message);
      }
    }
  }

  // Replace font URLs in CSS with data URIs
  let fixedCss = css;
  for (const [filename, dataUri] of fontMap.entries()) {
    // Match patterns like: url(fonts/KaTeX_AMS-Regular.woff2)
    const pattern = new RegExp(`url\\(fonts/${filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`, "g");
    fixedCss = fixedCss.replace(pattern, `url(${dataUri})`);
  }

  return fixedCss;
}

function safeRead(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function writeCombined() {
  // Setup fonts first
  setupKatexFonts();

  const tailwind = safeRead(tailwindFile);
  const streamdown = safeRead(streamdownFile);
  let katex = safeRead(katexFile);

  // Fix KaTeX font paths (they should work as-is since fonts are in plugin root)
  // But we ensure they're correct
  katex = fixKatexPaths(katex);

  const parts = [
    "/* Generated file: do not edit directly. */",
    "/* Tailwind (plugin UI) */",
    tailwind,
    "/* Tailwind (streamdown scoped) */",
    streamdown,
    "/* KaTeX (math rendering) */",
    katex,
    "",
  ];

  fs.writeFileSync(outFile, parts.join("\n"), "utf8");
}

function watch(files) {
  const existing = files.filter((f) => fs.existsSync(f));
  if (existing.length === 0) {
    writeCombined();
    return;
  }
  for (const f of existing) {
    fs.watch(f, { persistent: true }, () => {
      writeCombined();
    });
  }
  writeCombined();
}

const mode = process.argv[2] || "once";
if (mode === "watch") {
  watch([tailwindFile, streamdownFile, katexFile]);
} else {
  writeCombined();
}


