import * as fs from 'fs';
import * as path from 'path';
import { simpleGit, SimpleGit, CleanOptions } from 'simple-git';
import * as moment from 'moment';

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
// one day process functions

/**
 * 定义一个正则表达式来检测 Obsidian 双链格式的图片链接
 */
const imagePattern = /!\[\[.*?\.(png|jpg|jpeg|gif)\]\]|\[\[.*?\.(png|jpg|jpeg|gif)\]\]/;

/**
 * 每次append到文件末尾一行 
 */
function appendToJsonFile(dayStr: string, filePath: string, newData: any) {
    const newDataStr = `${dayStr},${JSON.stringify(newData)}`;
    // 打开文件以追加模式写入
    fs.appendFileSync(filePath, newDataStr + '\n');
}

async function getCommitStats(repoPath: string, since: Date, until: Date, ignoreFunc?: (filePath: string) => boolean) {
    const git: SimpleGit = simpleGit(repoPath);
    const commits = await git.log({ since: since.toISOString(), until: until.toISOString() });

    let charsAdded = 0;
    let charsRemoved = 0;
    let imagesAdded = 0;
    const filesModifiedSet = new Set<string>();

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

            // 获取该文件的差异
            const diff = await git.diff([`${commit.hash}~1`, commit.hash, '--', cleanFile]);
            diff.split('\n').forEach((line: string) => {
                if (line.startsWith('+') && !line.startsWith('+++')) {
                    charsAdded += line.length - 1; // 计算添加的字符数，去掉开头的 '+'
                    if (imagePattern.test(cleanFile)) {
                        imagesAdded += 1;
                    }
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                    charsRemoved += line.length - 1; // 计算删除的字符数，去掉开头的 '-'
                }
            });
        }
    }

    return {
        charsAdded,
        charsRemoved,
        imagesAdded,
        filesModified: filesModifiedSet.size,
    };
}

/**
 * 这些文件不处理
 * 被 gitIgnore 的文件会自动不被处理.
 */
function ignoreFile(filePath: string, dataStore: string) {
    // ignore_files = ['.DS_store']
    return filePath.startsWith(dataStore);
}

async function processOneDay(dayStr: string, repoPath: string, dataStore: string = '', returnData: boolean = false) {
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
    };

    if (returnData) {
        return result;
    } else if (dataStore.length === 0) {
        console.log(result);
    } else {
        appendToJsonFile(dayStr, dataStore, result);
    }
}

// --------------------------------------------------------------------------------
// main process

async function mainProcess(repoPath: string, processMode: string, ...args: string[]) {
    if (processMode === 'batch') {
        const [since, until, dataStore] = args;
        iterateDatesBetween(
            since,
            until,
            async (targetDay) => await processOneDay(targetDay, repoPath, dataStore)
        );
    } else if (processMode === 'item') {
        const [targetDay, dataStore] = args;
        await processOneDay(targetDay, repoPath, dataStore);
    } else if (processMode === 'organize') {
        const [dataStore] = args;
        organizeDataFile(
            dataStore,
            (targetDay) => processOneDay(targetDay, repoPath, dataStore, true)
        );
    }
}
