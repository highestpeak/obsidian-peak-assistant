
import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';

export type ActivityRecordType = string;

export interface ActivityRecord {
    // record type name. eg: OpenEditor. OpenFile
    type: ActivityRecordType;
    // eg: which file for OpenFile recordType
    value?: string;
    // record desc.
    desc?: string;
}

export interface ActivityRecordAchieved {
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

    // Convert each record to JSON string and add newline, then concatenate into final string
    const recordString = records
        .map(record => JSON.stringify(convertToAchieved(record)) + '\n') // Convert and add newline for each record
        .join(''); // Concatenate into final string

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

export function loadMetricEntries(data_store: string): ActivityRecordAchieved[] {
    // Ensure the data_store file exists
    if (!fs.existsSync(data_store)) {
        console.error(`Data store file does not exist: ${data_store}`);
        return [];
    }

    // Read the file and parse each line as JSON
    const fileContent = fs.readFileSync(data_store, 'utf-8');
    const entries: ActivityRecordAchieved[] = fileContent
        .split('\n') // Split the content by new lines
        .filter(line => line.trim() !== '') // Remove empty lines
        .map(line => {
            try {
                return JSON.parse(line) as ActivityRecordAchieved; // Parse each line
            } catch (error) {
                console.error(`Error parsing line: ${line}`, error);
                return null; // Return null for invalid lines
            }
        })
        .filter(entry => entry !== null) as ActivityRecordAchieved[]; // Filter out null entries

    return entries; // Return the array of parsed entries
}