import { TAbstractFile, TFile } from "obsidian";
import * as path from "path";
import { Callback } from "src/core/ScriptLoader";
import { ActivityRecord, ActivityRecordType, logMetrics } from "src/service/ActivityService";

// --------------------------------------------------------------------------------
// LogMetricType

export enum LogMetricType {
    FILE_OPEN = "FileOpen",
    FILE_EDIT = "FileEdit", 
    FILE_CLOSE = "FileClose",
    WINDOW_ACTIVE = "WindowActive",
    WINDOW_LOSE = "WindowLose",
}

// 检查事件类型是否为文件操作
export function isFileAction(type: string): boolean {
    const fileActions = [
        LogMetricType.FILE_EDIT,
        LogMetricType.FILE_OPEN,
        LogMetricType.FILE_CLOSE
    ];
    return fileActions.includes(type as LogMetricType);
}

// 检查事件类型是否为关闭操作
export function isCloseAction(type: string): boolean {
    const closeActions = [
        LogMetricType.FILE_CLOSE,
        LogMetricType.WINDOW_LOSE
    ];
    return closeActions.includes(type as LogMetricType);
}

// --------------------------------------------------------------------------------
// 事件处理器

interface EventHandlers {
    handleFileEvent: (files: TAbstractFile[], type: LogMetricType) => void;
    handleWindowEvent: (type: LogMetricType) => void;
}

function createEventHandlers(dataStore: string): EventHandlers {
    return {
        handleFileEvent: (files: TAbstractFile[], type: LogMetricType) => {
            const processedFiles = new Set<string>();
            const records: ActivityRecord[] = files
                .map(file => buildFileAbsolutePath(file))
                .filter(filePath => {
                    if (processedFiles.has(filePath)) return false;
                    processedFiles.add(filePath);
                    return true;
                })
                .map(filePath => ({ type, value: filePath }));

            logMetrics(records, dataStore);
        },

        handleWindowEvent: (type: LogMetricType) => {
            logMetrics([{ type }], dataStore);
        }
    };
}

// --------------------------------------------------------------------------------
// 事件监听器构建

/**
 * 构建日志指标监听器
 * 用于监听和记录用户在 Obsidian 中的各种活动，包括文件操作和窗口状态变化
 * 
 * @param dataStore 数据存储路径，用于保存记录的活动日志
 * @returns 返回一个Map，key为事件名称，value为对应的回调处理函数
 */
export function buildLogMetricListener(dataStore: string): Map<string, Callback> {
    const handlers = createEventHandlers(dataStore);
    const eventMap = new Map<string, Callback>();

    // 注册文件事件
    eventMap.set("workspace-file-open", 
        (params: any) => handlers.handleFileEvent(params as TFile[], LogMetricType.FILE_OPEN));
    
    eventMap.set("vault-modify",
        (params: any) => handlers.handleFileEvent(params as TAbstractFile[], LogMetricType.FILE_EDIT));
    
    eventMap.set("workspace-file-close",
        (params: any) => handlers.handleFileEvent(params as TFile[], LogMetricType.FILE_CLOSE));

    // 注册窗口事件
    eventMap.set("window-focus",
        () => handlers.handleWindowEvent(LogMetricType.WINDOW_ACTIVE));
    
    eventMap.set("window-blur", 
        () => handlers.handleWindowEvent(LogMetricType.WINDOW_LOSE));

    return eventMap;
}

function buildFileAbsolutePath(file: TAbstractFile): string {
    return path.join(file.path, file.name);
}