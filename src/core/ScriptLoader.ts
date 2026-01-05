/**
 * Load all scripts from specified directory. Supported formats:
 * 1. md files. Code blocks. All code blocks will be executed
 * 2. js,ts files, entire file will be executed
 * 3. python files, entire file will be executed
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export type Callback<T = any> = (context: T) => void;

// Load all script files from specified directory and register callback functions based on events
export function loadScriptsForEvent(directoryPath: string): Map<string, Callback[]> {
  // console.log('directoryPath: ', directoryPath);

  const handlerMap = new Map<string, Callback[]>();
  const files = getAllFiles(directoryPath);
  // console.log("scriptFolder files: ", files);

  files.forEach((file) => {
    const filePath = file;
    const fileExtension = path.extname(file).toLowerCase();

    switch (fileExtension) {
      case '.md':
        mergeHandlerMaps(handlerMap, registerMarkdownCallback(filePath));
        break;
      case '.js':
      case '.ts':
      case '.py':
        mergeHandlerMaps(handlerMap, registerScriptCallback(filePath));
        break;
      default:
        console.log(`Unsupported file format: ${fileExtension}, file: ${file}`);
    }
  });

  return handlerMap;
}

function getAllFiles(directoryPath: string): string[] {
  let files: string[] = [];
  const items = fs.readdirSync(directoryPath);

  items.forEach((item) => {
    const itemPath = path.join(directoryPath, item);
    const itemStat = fs.statSync(itemPath);

    if (itemStat.isDirectory()) {
      // If it's a folder, recurse
      files = files.concat(getAllFiles(itemPath));
    } else {
      // If it's a file, add to file list
      files.push(itemPath);
    }
  });

  return files;
}

// Merge new handlerMap into total handlerMap
function mergeHandlerMaps(targetMap: Map<string, Callback[]>, sourceMap: Map<string, Callback[]>): void {
  sourceMap.forEach((callbacks, eventName) => {
    const existingCallbacks = targetMap.get(eventName) || [];
    targetMap.set(eventName, existingCallbacks.concat(callbacks));
  });
}

// Detect if event type is specified from first line of code block
function extractEventMatchFromCodeFirstLine(lineStr:string) {
  return lineStr.match(/PeakAssistantEvent:\s*(\S+)/i);
}

// Register callback for qualified Markdown files
function registerMarkdownCallback(filePath: string): Map<string, Callback[]> {
  let handlerMap = new Map<string, Callback[]>();
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const yamlMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);

  if (!yamlMatch) {
    return handlerMap
  }

  const yamlContent = yaml.load(yamlMatch[1]) as { PeakAssistantEvent?: string };
  if (yamlContent.PeakAssistantEvent) {
    handlerMap = allMarkdownCodeBlocksExecutableScripts(fileContent)
  }

  return handlerMap;
}

// Register callback for qualified script files
function registerScriptCallback(filePath: string): Map<string, Callback[]> {
  const handlerMap = new Map<string, Callback[]>();
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const firstLine = fileContent.split('\n')[0].trim();
  const eventMatch = extractEventMatchFromCodeFirstLine(firstLine);
  // console.log(filePath);
  // console.log(eventMatch);

  if (!eventMatch) {
    return handlerMap
  }

  const eventName = eventMatch[1];
  const callbacks = handlerMap.get(eventName) || [];
  callbacks.push((context) => executeScriptFile(filePath, context));
  handlerMap.set(eventName, callbacks);

  return handlerMap;
}

// Execute code blocks in Markdown file
function allMarkdownCodeBlocksExecutableScripts(fileContent: string): Map<string, Callback[]> {
  const handlerMap = new Map<string, Callback[]>();
  // Match code blocks in Markdown file
  const codeBlocks = fileContent.match(/```([\s\S]*?)```|<%[\s\S]*?-%>/g);

  if (!codeBlocks) {
    return handlerMap
  }

  // console.log('executeMarkdownCodeBlocks: ', codeBlocks);

  codeBlocks.forEach((codeBlock) => {
    let code: string | null = null;

    // Handle Obsidian Templater syntax
    if (codeBlock.startsWith('<%*')) {
      code = codeBlock.replace(/^<%\*[\s\S]*?\n?/, '').replace(/-%>$/, '').trim();
    } else {
      // Remove ``` and language type from Markdown code block
      code = codeBlock.replace(/```[\s\S]*?\n/, '').replace(/```/g, '').trim();
    }
    // console.log(code);

    if (!code) {
      return
    }

    // Only execute JavaScript code blocks
    // Can add further checks for code language type as needed
    // For example, check if it's JavaScript code
    const isJavaScript = /```[\s\S]*?(javascript|js|typescript|ts)[\s\S]*?\n/.test(codeBlock) || codeBlock.startsWith('<%*');
    if (!isJavaScript) {
      return
    }

    const firstLine = fileContent.split('\n')[0].trim();
    const eventMatch = extractEventMatchFromCodeFirstLine(firstLine);
    if (!eventMatch) {
      return
    }
    const eventName = eventMatch[1];
    const callbacks = handlerMap.get(eventName) || [];
    // callbacks.push((context) => executeJavaScriptCode(code, context));
    handlerMap.set(eventName, callbacks);
  });

  return handlerMap
}


// Execute JavaScript, TypeScript files
function executeScriptFile(filePath: string, context: any) {
  if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
    const script = require(filePath);
    if (typeof script === 'function') {
      script(context);
    }
  } else if (filePath.endsWith('.py')) {
    executePythonFile(filePath, context);
  }
}

// Execute Python file
function executePythonFile(filePath: string, context: any) {
  const { execSync } = require('child_process');
  try {
    const contextString = JSON.stringify(context);
    const result = execSync(`python ${filePath} '${contextString}'`, { stdio: 'pipe' });
    console.log(`executePythonFile: ${filePath}, result: `, result.toString());
  } catch (error) {
    console.error(`Python script execution failed: `, error);
  }
}

// Execute JavaScript code in code blocks
function executeJavaScriptCode(code: string, context: any) {
  try {
    const func = new Function('context', code);
    func(context);
  } catch (error) {
    console.error(`JavaScript code block execution failed:`, error);
  }
}
