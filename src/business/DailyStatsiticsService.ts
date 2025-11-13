import * as fs from 'fs';
import * as path from 'path';
import { simpleGit, SimpleGit, CleanOptions } from 'simple-git';
import moment from 'moment';
import { isCloseAction, isFileAction, LogMetricType } from './LogMetricRegister';
import { ActivityRecordAchieved, loadMetricEntries } from 'src/service/ActivityService';

// --------------------------------------------------------------------------------
// date functions

const dateTimeFormat = 'YYYYMMDD-HH:mm:ss';
const dateFormat = 'YYYYMMDD';

/**
 * 根据格式 %Y%m%d 解析字符串到日期，并获取这一天的0点到24点时间。
 * @param dateStr 日期字符串，格式为 %Y%m%d
 * @returns (start_of_day, end_of_day) 元组，分别表示这一天的0点时间和24点时间
 */
function getDayStartEnd(dateStr: string): [Date, Date] {
    const date = moment(dateStr, dateFormat).toDate();
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    return [startOfDay, endOfDay];
}

/**
 * 获取两个日期字符串之间的所有日期，并在每个日期上执行一个函数。
 * @param startDateStr 起始日期字符串，格式为 %Y%m%d
 * @param endDateStr 结束日期字符串，格式为 %Y%m%d
 * @param func 要在每个日期上执行的函数，接收一个日期字符串参数，格式为 %Y%m%d
 */
function iterateDatesBetween(startDateStr: string, endDateStr: string, func: (dateStr: string) => void) {
    const startDate = moment(startDateStr, dateFormat);
    const endDate = moment(endDateStr, dateFormat);

    if (startDate.isAfter(endDate)) {
        throw new Error("起始日期不能大于结束日期");
    }

    let currentDate = startDate.clone();

    while (currentDate.isSameOrBefore(endDate)) {
        func(currentDate.format(dateFormat));
        currentDate.add(1, 'days');
    }
}

// --------------------------------------------------------------------------------
// organize file process functions

/**
 * 整理 data 文件.
 */
function organizeDataFile(filePath: string, processFunc: (dateStr: string) => any) {
    const dateDict: Record<string, any> = {};

    // 读取文件并处理重复日期
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
        const [dateStr, jsonStr] = line.split(',', 2);
        if (dateStr in dateDict) {
            // 发现重复日期，调用处理函数
            dateDict[dateStr] = processFunc(dateStr);
        } else {
            dateDict[dateStr] = JSON.parse(jsonStr);
        }
    }

    // 按日期排序
    const sortedDates = Object.keys(dateDict).sort((a, b) => moment(a, dateFormat).unix() - moment(b, dateFormat).unix());

    // 写回原文件
    const output = sortedDates.map(date => `${date},${JSON.stringify(dateDict[date])}`).join('\n');
    fs.writeFileSync(filePath, output);
}

// --------------------------------------------------------------------------------
// one day git process functions

/**
 * 定义一个正则表达式来检测 Obsidian 双链格式的图片链接
 */
const imagePattern = /!\[\[.*?\.(png|jpg|jpeg|gif)\]\]|\[\[.*?\.(png|jpg|jpeg|gif)\]\]/;
const todoPattern = /\b(TODO:|todo:|\[ \]|\[x\])/i;

/**
 * 每次append到文件末尾一行 
 */
function appendToJsonFile(dayStr: string, filePath: string, newData: any) {
    const newDataStr = `${dayStr},${JSON.stringify(newData)}`;
    // 打开文件以追加模式写入
    fs.appendFileSync(filePath, newDataStr + '\n');
}

async function getCommitStats(repoPath: string, since: Date, until: Date, ignoreFunc?: (filePath: string) => boolean): Promise<GitAnalysisResult> {
    const git: SimpleGit = simpleGit(repoPath);
    const commits = await git.log({ since: since.toISOString(), until: until.toISOString() });

    let charsAdded = 0;
    let charsRemoved = 0;
    let imagesAdded = 0;
    const filesModifiedSet = new Set<string>();
    let todoAddedCount = 0;
    let todoDoneCount = 0;
    let todoDeletedCount = 0;
    const todos = {
        added: [] as Array<TodoItem>,
        done: [] as Array<TodoItem>,
        deleted: [] as Array<TodoItem>
    };

    for (const commit of commits.all) {
        if (!commit.diff || !commit.diff.files) {
            continue;
        }

        // 这里使用 commit.stats.files 来获取每个提交的文件
        const files = Object.keys(commit.diff.files);

        for (const file of files) {
            const cleanFile = file.replace(/"/g, '').replace(/\\/g, '');

            // 如果忽略函数存在且文件路径匹配，则跳过该文件
            if (ignoreFunc && ignoreFunc(cleanFile)) {
                continue;
            }
            filesModifiedSet.add(cleanFile);

            // Load the entire file content and create a header context map
            const fileContent = await git.show([`${commit.hash}:${cleanFile}`]);
            const headerContextMap = buildHeaderContextMap(fileContent);

            // Get diff for each file between current and previous commit
            const diff = await git.diff([`${commit.hash}~1`, commit.hash, '--', cleanFile]);

            let fileLine = 0;
            diff.split('\n').forEach((line: string) => {
                if (line.startsWith('@@')) {
                    // Handle @@ -oldLine,+newLine @@ metadata to sync fileLine
                    const match = line.match(/@@ -\d+,\d+ \+(\d+),/);
                    if (match) {
                        fileLine = parseInt(match[1]) - 1;
                    }
                } else if (line.startsWith('+') && !line.startsWith('+++')) {
                    charsAdded += line.length - 1; // 计算添加的字符数，去掉开头的 '+'
                    if (imagePattern.test(cleanFile)) {
                        imagesAdded += 1;
                    }
                    // Increment file line only if the line is an addition
                    if (todoPattern.test(line)) {
                        todos.added.push({
                            file_path: cleanFile,
                            headers: headerContextMap[fileLine] || '', // Use header context from map
                            line: line.trim()
                        });
                        todoAddedCount += 1;
                    }
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                    charsRemoved += line.length - 1; // 计算删除的字符数，去掉开头的 '-'
                    // Detect deleted TODO items
                    if (todoPattern.test(line)) {
                        todos.deleted.push({
                            file_path: cleanFile,
                            headers: headerContextMap[fileLine] || '',
                            line: line.trim()
                        });
                        todoDeletedCount += 1;
                    }
                } else {
                    // Regular line; increment `fileLine` if it’s context
                    fileLine += 1;
                }
            });
        }
    }

    return {
        charsAdded,
        charsRemoved,
        imagesAdded,
        filesModified: filesModifiedSet.size,
        todoAddedCount,
        todoDoneCount,
        todoDeletedCount,
        todos
    };
}

// Build header context map by parsing the entire file content
function buildHeaderContextMap(content: string) {
    const headerContextMap: Record<number, string> = {};
    const headerStack: string[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
        const headerMatch = line.match(/^(#+)\s+(.*)/);
        if (headerMatch) {
            const level = headerMatch[1].length;
            const headerText = headerMatch[2];

            // Adjust the header stack to reflect current level
            headerStack.length = level - 1;
            headerStack[level - 1] = headerText;

            // Update header context for the current line in the map
            headerContextMap[index] = headerStack.join(' > ');
        }
    });

    return headerContextMap;
}

/**
 * 这些文件不处理
 * 被 gitIgnore 的文件会自动不被处理.
 */
function ignoreFile(filePath: string, dataStore: string) {
    // ignore_files = ['.DS_store']
    return filePath.startsWith(dataStore);
}

// --------------------------------------------------------------------------------
// one day log file process functions

function analyzeLogEntries(logEntries: ActivityRecordAchieved[]): AnalysisResult {
    const appActivity: AppActivity = {
        totalStayDuration: 0,
        activeTimePeriods: []
    };
    const documentActivities: Record<string, DocumentActivity> = {};

    // Sort log entries by complete timestamp (YYYYMMDD-HH:mm:ss)
    logEntries.sort((a, b) => {
        return new Date(a.time).getTime() - new Date(b.time).getTime();
    });

    let appStartTime: string | null = null;

    for (let index = 0; index < logEntries.length; index++) {
        const entry = logEntries[index];
        const preEntry = index > 0 ? logEntries[index - 1] : null; // Prevent out-of-bounds access

        // Handle App Activity
        if (entry.type === LogMetricType.WINDOW_ACTIVE) {
            // 防止连续 active 事件
            appStartTime = appStartTime === null ? entry.time : appStartTime;
        } else if (entry.type === LogMetricType.WINDOW_LOSE && appStartTime) {
            appActivity.activeTimePeriods.push({ start: appStartTime, end: entry.time });
            const startTime = new Date(appStartTime).getTime();
            const endTime = new Date(entry.time).getTime();
            appActivity.totalStayDuration += (endTime - startTime) / 1000; // Convert milliseconds to seconds
            appStartTime = null; // Reset the start time
        }

        // Handle Document Activity
        if (preEntry) {
            handleDocumentActivity(preEntry, entry, documentActivities);
        }
    }

    // Calculate stay durations for each document
    for (const docActivity of Object.values(documentActivities)) {
        docActivity.stayDuration = calculateStayDuration(docActivity.timePeriods);
    }

    // Final result
    return {
        appActivity,
        documentActivities: Object.values(documentActivities)
    };
}

function handleDocumentActivity(preEntry: ActivityRecordAchieved, entry: ActivityRecordAchieved, documentActivities: Record<string, DocumentActivity>) {
    if (!preEntry.value) {
        return
    }
    // Initialize document activity if not already done
    if (!documentActivities[preEntry.value]) {
        documentActivities[preEntry.value] = {
            document: preEntry.value,
            timePeriods: [],
            stayDuration: 0
        };
    }

    const docActivity = documentActivities[preEntry.value];
    const lastPeriod = docActivity.timePeriods[docActivity.timePeriods.length - 1];

    // Case 1: Same document is being edited or opened
    if (entry.value === preEntry.value && isFileAction(entry.type)) {
        // Extend the last time period for the same document
        if (lastPeriod) {
            lastPeriod.end = entry.time; // Update end time of the last period
        } else {
            docActivity.timePeriods.push({ start: entry.time, end: entry.time }); // Start new period
        }
        return; // Exit after handling the same document
    }

    // Case 2: Transition from a document event to a closing or losing focus event
    if (isFileAction(preEntry.type) && isCloseAction(entry.type)) {
        // End the last period for the previous document
        if (lastPeriod) {
            lastPeriod.end = entry.time; // End the last period
        }
        return; // Exit after handling the close or lose focus
    }

    // Case 3: A new document is opened
    if (isFileAction(entry.type)) {
        // Start new time period for the new document
        docActivity.timePeriods.push({ start: entry.time, end: entry.time });
    }
}

function calculateStayDuration(timePeriods: TimePeriod[]): number {
    return timePeriods.reduce((total, period) => {
        const startTime = new Date(period.start).getTime();
        const endTime = new Date(period.end).getTime();
        return total + (endTime - startTime) / 1000; // Convert milliseconds to seconds
    }, 0);
}

// --------------------------------------------------------------------------------
// main process

interface TodoItem {
    file_path: string;
    headers: string;
    line: string
}

interface GitAnalysisResult {
    charsAdded: number;
    charsRemoved: number;
    imagesAdded: number;
    filesModified: number;
    todoAddedCount: number;
    todoDoneCount: number;
    todoDeletedCount: number;
    todos: {
        added: Array<TodoItem>;
        done: Array<TodoItem>;
        deleted: Array<TodoItem>;
    };
}

interface TimePeriod {
    start: string; // "YYYYMMDD-HH:mm:ss"
    end: string;   // "YYYYMMDD-HH:mm:ss"
}

interface DocumentActivity {
    document: string;
    timePeriods: TimePeriod[];
    stayDuration: number; // Total stay duration in seconds
}

interface AppActivity {
    totalStayDuration: number; // Total stay duration in seconds
    activeTimePeriods: TimePeriod[]; // Time periods of active usage
}

interface AnalysisResult {
    appActivity: AppActivity;
    documentActivities: DocumentActivity[];
}

type ProcessOneDayResult = {
    calcTime: string;   // Time of calculation in specified format
} & GitAnalysisResult & AnalysisResult; // Merging results from Git analysis and log analysis

type ProcessOneDayParams = {
    dayStr: string;     // The date string in the format 'YYYYMMDD' or similar
    repoPath: string;   // The path to the Git repository
    dataStore?: string; // Optional path to the data store file
    returnData?: boolean; // Flag to indicate whether to return data or log it
};

async function processOneDay(params: ProcessOneDayParams): Promise<ProcessOneDayResult> {
    const { dayStr, repoPath, dataStore = '', returnData = false } = params;
    const [since, until] = getDayStartEnd(dayStr);

    // 直接将返回值解构赋值给 result
    const result = {
        calcTime: moment().format(dateTimeFormat),
        ...(await getCommitStats(
            repoPath,
            since,
            until,
            (filePath) => ignoreFile(filePath, dataStore)
        )),
        ...analyzeLogEntries(
            loadMetricEntries(dataStore)
        )
    };

    if (returnData) {
        return result;
    } else if (dataStore.length === 0) {
        console.log(result);
    } else {
        appendToJsonFile(dayStr, dataStore, result);
    }

    return result; // Ensure the result is returned at the end of the function
}

export async function dailyStatisticsProcess(repoPath: string, processMode: string, ...args: string[]) {
    if (processMode === 'batch') {
        const [since, until, dataStore] = args;
        iterateDatesBetween(
            since,
            until,
            async (targetDay) => await processOneDay({
                dayStr: targetDay,
                repoPath: repoPath,
                dataStore: dataStore,
            })
        );
    } else if (processMode === 'item') {
        const [targetDay, dataStore] = args;
        await processOneDay({
            dayStr: targetDay,
            repoPath: repoPath,
            dataStore: dataStore,
        });
    } else if (processMode === 'organize') {
        const [dataStore] = args;
        organizeDataFile(
            dataStore,
            (targetDay) => processOneDay({
                dayStr: targetDay,
                repoPath: repoPath,
                dataStore: dataStore,
                returnData: true, // assuming you want to return data here
            })
        );
    }
}
