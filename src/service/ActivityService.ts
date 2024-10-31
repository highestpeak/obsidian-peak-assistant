
import * as fs from 'fs';
import * as path from 'path';
import * as moment from 'moment';

export type ActivityRecordType = string;

export interface ActivityRecord {
    // record type name. eg: OpenEditor. OpenFile
    type: ActivityRecordType;
    // eg: which file for OpenFile recordType
    value?: string;
    // record desc.
    desc?: string;
}

interface ActivityRecordAchieved {
    // "YYYYMMDD-HH:mm:ss"
    time: string;
    // record type name. eg: OpenEditor
    type: string;
    // eg: which file for OpenFile recordType
    value?: string;
    // record desc.
    desc?: string;
}

export function logMetric(record: ActivityRecord, data_store: string) {
    logMetrics([record], data_store)
}


export function logMetrics(records: ActivityRecord[], data_store: string) {
    // Ensure the directory for the data store exists
    const directory = path.dirname(data_store);
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }

    // 将每个 record 转换为 JSON 字符串并添加换行符，然后拼接成一个最终的字符串
    const recordString = records
        .map(record => JSON.stringify(convertToAchieved(record)) + '\n') // 对每个 record 进行转换和换行
        .join(''); // 拼接成一个最终的字符串

    // Append the record to the specified file
    fs.appendFile(data_store, recordString, (err) => {
        if (err) {
            console.error(`Error writing to file ${data_store}:`, err);
        }
        else {
            console.log(`Record logged successfully to ${data_store}`);
        }
    });
}

function convertToAchieved(record: ActivityRecord): ActivityRecordAchieved {
    return {
        time: formatDate(new Date()),
        type: record.type,
        value: record.value,
        desc: record.desc,
    };
}

/**
 * Formats a Date object to a string in the "YYYYMMDD-HH:mm:ss" format
 * @param date - The date to format
 * @returns The formatted string
 */
function formatDate(date: Date): string {
    return moment(date).format('YYYYMMDD-HH:mm:ss');
}