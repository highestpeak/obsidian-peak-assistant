/**
 * 加载指定目录的所有 script. 支持的格式:
 * 1. md文件. 代码块. 所有代码块均会执行
 * 2. js,ts文件, 整个文件会被执行
 * 3. python文件, 整个文件会被执行
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export type Callback<T = any> = (context: T) => void;

// 加载指定目录的所有 script 文件，并根据事件注册回调函数
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
        console.log(`不支持的文件格式: ${fileExtension}, file: ${file}`);
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
      // 如果是文件夹，递归调用
      files = files.concat(getAllFiles(itemPath));
    } else {
      // 如果是文件，添加到文件列表
      files.push(itemPath);
    }
  });

  return files;
}

// 合并新的 handlerMap 到总的 handlerMap
function mergeHandlerMaps(targetMap: Map<string, Callback[]>, sourceMap: Map<string, Callback[]>): void {
  sourceMap.forEach((callbacks, eventName) => {
    const existingCallbacks = targetMap.get(eventName) || [];
    targetMap.set(eventName, existingCallbacks.concat(callbacks));
  });
}

// 从代码块第一行检测是否存在 event 指定类型
function extractEventMatchFromCodeFirstLine(lineStr:string) {
  return lineStr.match(/PeakAssistantEvent:\s*(\S+)/i);
}

// 为符合条件的 Markdown 文件注册回调
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

// 为符合条件的脚本文件注册回调
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

// 执行 Markdown 文件中的代码块
function allMarkdownCodeBlocksExecutableScripts(fileContent: string): Map<string, Callback[]> {
  const handlerMap = new Map<string, Callback[]>();
  // 匹配 Markdown 文件中的代码块
  const codeBlocks = fileContent.match(/```([\s\S]*?)```|<%[\s\S]*?-%>/g);

  if (!codeBlocks) {
    return handlerMap
  }

  // console.log('executeMarkdownCodeBlocks: ', codeBlocks);

  codeBlocks.forEach((codeBlock) => {
    let code: string | null = null;

    // 处理 Obsidian Templater 语法
    if (codeBlock.startsWith('<%*')) {
      code = codeBlock.replace(/^<%\*[\s\S]*?\n?/, '').replace(/-%>$/, '').trim();
    } else {
      // 去掉 Markdown 代码块的 ``` 和语言类型
      code = codeBlock.replace(/```[\s\S]*?\n/, '').replace(/```/g, '').trim();
    }
    // console.log(code);

    if (!code) {
      return
    }

    // 只执行 JavaScript 代码块
    // 可以根据需要添加对代码的语言类型的进一步检查
    // 例如，检查是否为 JavaScript 代码
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
    callbacks.push((context) => executeJavaScriptCode(code, context));
    handlerMap.set(eventName, callbacks);
  });

  return handlerMap
}


// 执行 JavaScript、TypeScript 文件
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

// 执行 Python 文件
function executePythonFile(filePath: string, context: any) {
  const { execSync } = require('child_process');
  try {
    const contextString = JSON.stringify(context);
    const result = execSync(`python ${filePath} '${contextString}'`, { stdio: 'pipe' });
    console.log(`executePythonFile: ${filePath}, result: `, result.toString());    
  } catch (error) {
    console.error(`Python 脚本执行失败: `, error);
  }
}

// 执行代码块中的 JavaScript 代码
function executeJavaScriptCode(code: string, context: any) {
  try {
    const func = new Function('context', code);
    func(context);
  } catch (error) {
    console.error(`JavaScript 代码块执行失败:`, error);
  }
}
