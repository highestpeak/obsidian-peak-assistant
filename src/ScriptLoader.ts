/**
 * 加载指定目录的所有 script. 支持的格式:
 * 1. md文件. 代码块. 所有代码块均会执行
 * 2. js,ts文件, 整个文件会被执行
 * 3. python文件, 整个文件会被执行
 */

// todo 没有验证，只是超过来了从 gpt，匆匆去玩游戏了

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

interface Context {
  // 根据实际需要定义 context 的结构
  [key: string]: any;
}

type Callback = (context: Context) => void;
const handlerList: { [eventName: string]: Callback[] } = {};

// 加载指定目录的所有 script 文件，并根据事件注册回调函数
function loadScriptsForEvent(directoryPath: string, eventName: string, context: Context) {
  const files = fs.readdirSync(directoryPath);

  files.forEach((file) => {
    const filePath = path.join(directoryPath, file);
    const fileExtension = path.extname(file).toLowerCase();

    switch (fileExtension) {
      case '.md':
        registerMarkdownCallback(filePath, eventName, context);
        break;
      case '.js':
      case '.ts':
      case '.py':
        registerScriptCallback(filePath, eventName, context);
        break;
      default:
        console.log(`不支持的文件格式: ${file}`);
    }
  });
}

// 为符合条件的 Markdown 文件注册回调
function registerMarkdownCallback(filePath: string, eventName: string, context: Context) {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const yamlMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);

  if (yamlMatch) {
    const yamlContent = yaml.load(yamlMatch[1]) as { event?: string };
    if (yamlContent.event === eventName) {
      console.log(`注册事件 ${eventName} 的 Markdown 回调: ${filePath}`);
      handlerList[eventName] = handlerList[eventName] || [];
      handlerList[eventName].push(() => executeMarkdownCodeBlocks(fileContent, context));
    }
  }
}

// 为符合条件的脚本文件注册回调
function registerScriptCallback(filePath: string, eventName: string, context: Context) {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const firstLine = fileContent.split('\n')[0].trim();
  const eventMatch = firstLine.match(/^\/\/\s*event:\s*(\S+)/i);

  if (eventMatch && eventMatch[1] === eventName) {
    console.log(`注册事件 ${eventName} 的脚本回调: ${filePath}`);
    handlerList[eventName] = handlerList[eventName] || [];
    handlerList[eventName].push(() => executeScriptFile(filePath, context));
  }
}

// 执行 Markdown 文件中的代码块
function executeMarkdownCodeBlocks(fileContent: string, context: Context) {
  const codeBlocks = fileContent.match(/```([\s\S]*?)```/g);
  if (codeBlocks) {
    codeBlocks.forEach((codeBlock) => {
      const code = codeBlock.replace(/```/g, '').trim();
      executeJavaScriptCode(code, context);
    });
  }
}

// 执行 JavaScript、TypeScript 文件
function executeScriptFile(filePath: string, context: Context) {
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
function executePythonFile(filePath: string, context: Context) {
  const { execSync } = require('child_process');
  try {
    const contextString = JSON.stringify(context);
    execSync(`python ${filePath} '${contextString}'`, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Python 脚本执行失败: ${error}`);
  }
}

// 执行代码块中的 JavaScript 代码
function executeJavaScriptCode(code: string, context: Context) {
  try {
    const func = new Function('context', code);
    func(context);
  } catch (error) {
    console.error(`JavaScript 代码块执行失败: ${error}`);
  }
}

// 使用示例：传入目标目录路径、事件名称和 context 变量
const context: Context = {
  // Obsidian 的相关变量和自定义结构
};
const eventName = 'yourEventName';
loadScriptsForEvent('./scripts', eventName, context);

export { loadScriptsForEvent, handlerList };

