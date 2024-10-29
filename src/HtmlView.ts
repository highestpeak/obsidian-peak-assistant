import { PaneType, Plugin } from 'obsidian';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';

const VIEW_TYPE_HTML = "html-view";

export interface HTMLViewConfig {
    viewName: string;
    filePath: string;
    iconName: string;
    iconTitle: string;
    // 是否在左侧侧边栏添加入口
    sideBar: boolean;
    // 触发命令名称
    command?: string;
    leafType?: string | boolean;
}

type LeafType = PaneType | boolean;

class HtmlView extends ItemView {
    constructor(leaf: WorkspaceLeaf, private viewConfig: HTMLViewConfig) {
        super(leaf);
    }

    getViewType(): string {
        return VIEW_TYPE_HTML;
    }

    getDisplayText(): string {
        return "HTML View";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        // const exampleHtmlContent = `<div>
        //     <h1>Hello, this is rendered HTML!</h1>
        //     <p>This content is dynamically rendered in a custom view.</p>
        // </div>`;
        const basePath = (this.app.vault.adapter as any).basePath
        const htmlContent = fs.readFileSync(
            path.join(basePath, this.viewConfig.filePath), 'utf-8'
        );
        container.innerHTML = htmlContent;
    }

    async onClose() {
        // Nothing to clean up
    }
}

export function registerHTMLViews(congfigFilePath: string, plugin: Plugin) {
    // 读取内容
    const basePath = (plugin.app.vault.adapter as any).basePath
    const configFileContent = fs.readFileSync(
        path.join(basePath, congfigFilePath), 'utf-8'
    );
    // 解析为 JSON 对象
    let configArray: HTMLViewConfig[] = [];
    try {
        configArray = JSON.parse(configFileContent);
        if (!Array.isArray(configArray)) {
            throw new Error("配置文件内容不是数组");
        }

        // 验证每个配置项是否符合 HTMLViewConfig 接口
        configArray.forEach(item => {
            if (typeof item.viewName !== 'string' ||
                typeof item.filePath !== 'string' ||
                typeof item.iconName !== 'string' ||
                typeof item.iconTitle !== 'string' ||
                typeof item.sideBar !== 'boolean' ||
                (item.command && typeof item.command !== 'string')) {
                throw new Error("配置文件中的某些项不符合 HTMLViewConfig 接口");
            }
        });
    } catch (error) {
        console.error("解析配置文件内容时发生错误:", error.message);
    }

    // 注册 view
    configArray.forEach(item => registerHTMLView(item, plugin))
}

/**
 * 
 * @param viewConfig eg:{
                viewName: 'Home',
                filePath: '/tmp.html',
                iconName: 'dice',
                iconTitle: 'Open Home Page.',
                sideBar: true,
            }
 * @param plugin 
 */
export function registerHTMLView(viewConfig: HTMLViewConfig, plugin: Plugin) {
    // register home view
    plugin.registerView(
        VIEW_TYPE_HTML,
        (leaf: WorkspaceLeaf) => new HtmlView(leaf, viewConfig)
    );
    const newLeafType = (viewConfig.leafType ?? true) as LeafType
    // 如果指定按钮触发,则在侧边栏添加按钮,否则注册命令
    if (viewConfig.sideBar) {
        plugin.addRibbonIcon(viewConfig.iconName, viewConfig.iconTitle, async () => {
            activateView(plugin, newLeafType);
        });
    } else {
        const viewCommandName = 'PeakAssistant-OpenHtml-' + viewConfig.viewName
        plugin.addCommand({
            id: viewCommandName,
            name: viewCommandName,
            callback: () => {
                activateView(plugin, newLeafType)
            }
        });
    }
}

async function activateView(plugin: Plugin, newLeaf?: LeafType) {
    plugin.app.workspace.detachLeavesOfType(VIEW_TYPE_HTML);
    await plugin.app.workspace.getLeaf(newLeaf).setViewState({
        type: VIEW_TYPE_HTML,
        active: true,
    });
    plugin.app.workspace.revealLeaf(
        plugin.app.workspace.getLeavesOfType(VIEW_TYPE_HTML)[0]
    );
}
