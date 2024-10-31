import { TAbstractFile, TFile } from "obsidian";
import * as path from "path";
import { Callback } from "src/core/ScriptLoader";
import { ActivityRecord, ActivityRecordType, logMetrics } from "src/service/ActivityService";

enum StatisticsMetric {
    FILE_OPEN = "FileOpen",
    FILE_EDIT = "FileEdit",
    FILE_CLOSE = "FileClose",
    WINDOW_ACTIVE = "WindowActive",
    WINDOW_LOSE = "WindowLose",
}

export function buildStatisticsMetricListener(data_store: string): Map<string, Callback> {
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
                type: StatisticsMetric.FILE_OPEN,
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
                type: StatisticsMetric.FILE_EDIT, // Change to FILE_EDIT
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
                type: StatisticsMetric.FILE_CLOSE,
                value: fileFulePath,
            });
            processedFiles.add(fileFulePath);
        });
        logMetrics(result, data_store);
    });

    handlerMap.set("window-focus", () => {
        const record: ActivityRecord = {
            type: StatisticsMetric.WINDOW_ACTIVE,
        };
        logMetrics([record], data_store);
    });

    handlerMap.set("window-blur", () => {
        const record: ActivityRecord = {
            type: StatisticsMetric.WINDOW_LOSE,
        };
        logMetrics([record], data_store);
    });

    return handlerMap
}


function buildFileAbsolutePath(file: TAbstractFile): string {
    return path.join(file.path, file.name)
}