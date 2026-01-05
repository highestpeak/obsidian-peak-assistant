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
    // Whether to add entry in left sidebar
    sideBar: boolean;
    // Trigger command name
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
    // Read content
    const basePath = (plugin.app.vault.adapter as any).basePath
    const configFilePath = path.join(basePath, congfigFilePath);
    
    // Check if config file exists
    if (!fs.existsSync(configFilePath)) {
        console.warn(`HTML view config file not found: ${congfigFilePath}. Skipping HTML view registration.`);
        return;
    }
    
    let configFileContent: string;
    try {
        configFileContent = fs.readFileSync(configFilePath, 'utf-8');
    } catch (error) {
        console.error(`Failed to read HTML view config file: ${congfigFilePath}`, error);
        return;
    }
    
    // Parse as JSON object
    let configArray: HTMLViewConfig[] = [];
    try {
        configArray = JSON.parse(configFileContent);
        if (!Array.isArray(configArray)) {
            throw new Error("Config file content is not an array");
        }

        // Validate each config item matches HTMLViewConfig interface
        configArray.forEach(item => {
            if (typeof item.viewName !== 'string' ||
                typeof item.filePath !== 'string' ||
                typeof item.iconName !== 'string' ||
                typeof item.iconTitle !== 'string' ||
                typeof item.sideBar !== 'boolean' ||
                (item.command && typeof item.command !== 'string')) {
                throw new Error("Some items in config file do not match HTMLViewConfig interface");
            }
        });
    } catch (error) {
        console.error("Error parsing config file content:", error.message);
        return;
    }

    // Register view
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
    // Register home view
    plugin.registerView(
        VIEW_TYPE_HTML,
        (leaf: WorkspaceLeaf) => new HtmlView(leaf, viewConfig)
    );
    const newLeafType = (viewConfig.leafType ?? true) as LeafType
    // If sidebar button is specified, add button in sidebar, otherwise register command
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
