import { TAbstractFile, TFile } from "obsidian";
import * as path from "path";
import { Callback } from "@/core/ScriptLoader";
import { ActivityRecord, ActivityRecordType, logMetrics } from "@/service/ActivityService";

// --------------------------------------------------------------------------------
// LogMetricType

export enum LogMetricType {
    FILE_OPEN = "FileOpen",
    FILE_EDIT = "FileEdit",
    FILE_CLOSE = "FileClose",
    WINDOW_ACTIVE = "WindowActive",
    WINDOW_LOSE = "WindowLose",
}

// Helper function to check if an entry is a file action
export function isFileAction(type: string) {
    return type === LogMetricType.FILE_EDIT || type === LogMetricType.FILE_OPEN || type === LogMetricType.FILE_CLOSE;
}

export function isCloseAction(type: string) {
    return type === LogMetricType.FILE_CLOSE || type === LogMetricType.WINDOW_LOSE;
}

// --------------------------------------------------------------------------------
// register

export function buildLogMetricListener(data_store: string): Map<string, Callback> {
    const handlerMap = new Map<string, Callback>();

    handlerMap.set("workspace-file-open", (params: any) => {
        let eventDataList = params as TFile[]
        const processedFiles = new Set<string>();
        const result: ActivityRecord[] = []
        eventDataList.forEach(file => {
            const fileFulePath = buildFileAbsolutePath(file)
            if (!(file instanceof TFile && !processedFiles.has(fileFulePath))) {
                return
            }

            result.push({
                type: LogMetricType.FILE_OPEN,
                value: fileFulePath,
            });
            processedFiles.add(fileFulePath);
        });
        logMetrics(result, data_store)

    });

    handlerMap.set("vault-modify", (params: any) => {
        let eventDataList = params as TAbstractFile[]
        const processedFiles = new Set<string>();
        const result: ActivityRecord[] = [];
        eventDataList.forEach(file => {
            const fileFulePath = buildFileAbsolutePath(file)
            if (!(file instanceof TAbstractFile && !processedFiles.has(fileFulePath))) {
                return;
            }

            result.push({
                type: LogMetricType.FILE_EDIT, // Change to FILE_EDIT
                value: fileFulePath,
            });
            processedFiles.add(fileFulePath);
        });
        logMetrics(result, data_store);
    });

    handlerMap.set("workspace-file-close", (params: any) => {
        let eventDataList = params as TFile[];
        const processedFiles = new Set<string>();
        const result: ActivityRecord[] = [];
        eventDataList.forEach(file => {
            const fileFulePath = buildFileAbsolutePath(file);
            if (!(file instanceof TFile && !processedFiles.has(fileFulePath))) {
                return;
            }

            result.push({
                type: LogMetricType.FILE_CLOSE,
                value: fileFulePath,
            });
            processedFiles.add(fileFulePath);
        });
        logMetrics(result, data_store);
    });

    handlerMap.set("window-focus", () => {
        const record: ActivityRecord = {
            type: LogMetricType.WINDOW_ACTIVE,
        };
        logMetrics([record], data_store);
    });

    handlerMap.set("window-blur", () => {
        const record: ActivityRecord = {
            type: LogMetricType.WINDOW_LOSE,
        };
        logMetrics([record], data_store);
    });

    return handlerMap
}

function buildFileAbsolutePath(file: TAbstractFile): string {
    return path.join(file.path, file.name)
}