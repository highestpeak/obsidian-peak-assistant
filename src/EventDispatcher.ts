import { EventRef, Plugin, App, TAbstractFile, TFile, CachedMetadata, WorkspaceLeaf, WorkspaceWindow, Menu, Editor, MarkdownView, MarkdownFileInfo, Tasks, Notice } from "obsidian";
import * as path from "path";
import { Callback, loadScriptsForEvent } from "./ScriptLoader";

type EventHandler<T = any> = (data: T) => void;
/**
 * 1. obsidian 触发事件 => 寻找所有 handler => 分发给对应 handler
 * 2. 初始化 EventDispatcher => 监听所有 obsidian 事件 => 注册默认 dispatch 分发器.
 * 3. addNewHandler => 修改 dispatch 分发器
 * 4. 卸载所有监听事件
 * todo 后续应该可以 push 事件，然后别人可以订阅，不一定只需要处理 obsidian 内部的事件，自己可以新建的，和 kafka 一样，这样就写代码写起来很方便了，插件扩展性很强。
 */
export class EventDispatcher {
    /**
     * 便于卸载事件
     */
    private vaultEventRefs: EventRef[] = [];
    private metadataCacheEventRefs: EventRef[] = [];
    private workspaceEventRefs: EventRef[] = [];

    /**
     * handler
     * key: eg: "dom-click" "workspace-editor-change"
     */
    private handlers: { [key: string]: EventHandler[] } = {};

    /**
     * bufferTrigger
     * 事件太多了. 降低处理的量. 提高性能.
     */
    private eventBuffer: { [key: string]: any[] } = {};
    private timeoutIds: { [key: string]: NodeJS.Timeout | null } = {};

    constructor(private app: App, private plugin: Plugin) {
    }

    private async init() {
        // // 批量注册太损耗性能了 改为增量注册
        // // 注册 Obsidian 事件
        // this.registerVaultEvents();
        // this.registerMetadataCacheEvents();
        // this.registerWorkspaceEvents();
    }

    public addScriptFolderListener(scriptFolderPath: string) {
        this.loadFromScriptFolder(scriptFolderPath)
        this.addNewHandler("vault-modify", (data) => {
            this.onScriptFolderChange(data, scriptFolderPath)
        })
        this.addNewHandler("vault-create", (data) => {
            this.onScriptFolderChange(data, scriptFolderPath)
        })
        this.addNewHandler("vault-delete", (data) => {
            this.onScriptFolderChange(data, scriptFolderPath)
        })
    }

    private async onScriptFolderChange(changedFileParam: any, scriptFolderPath: string) {
        // console.log(`文件已变动1: `, changedFileParam, scriptFolderPath);

        let changedFileArray = changedFileParam as TAbstractFile[]
        changedFileArray = changedFileArray.filter(changedFile =>
            changedFile.path.startsWith(scriptFolderPath)
        );
        if (changedFileArray.length <= 0) {
            return
        }

        // console.log(`文件已变动2:`, changedFileArray);
        // 这里可以添加您需要的逻辑
        this.unload()
        this.addScriptFolderListener(scriptFolderPath)
        // make a notice to let user know event listener had been registered
        new Notice('Peak Assistant. Event Scripts Reload!');
    }

    private loadFromScriptFolder(scriptFolderPath: string) {
        const basePath = (this.app.vault.adapter as any).basePath
        // load events
        let eventScripts: Map<string, Callback[]> = loadScriptsForEvent(
            path.join(basePath, scriptFolderPath)
        )
        // console.log(eventScripts);
        eventScripts.forEach((callbacks, event) => {
            callbacks.forEach((callback, index) => {
                this.addNewHandler(event, callback)
            })
        })
    }

    /**
     * @param eventName eg:  "dom-click" "workspace-editor-change"
     */
    public addNewHandler<T>(eventName: string, handler: EventHandler<T>) {
        if (!this.handlers[eventName]) {
            this.handlers[eventName] = [];
        }
        this.handlers[eventName].push(handler);
        const [firstPart, secondPart] = this.extractEventName(eventName)
        if (secondPart.length <= 0) {
            return
        }
        console.log("addNewHandler: ", firstPart, " - ", secondPart);
        switch (firstPart) {
            case 'dom':
                this.registerDomEvents(secondPart)
                break;
            case 'vault':
                this.registerVaultEvents(secondPart)
                break;
            case 'metadataCache':
                this.registerMetadataCacheEvents(secondPart)
                break;
            case 'workspace':
                this.registerWorkspaceEvents(secondPart)
                break;
            default:
                break;
        }
    }

    public removeHandler<T>(eventName: string, handler: EventHandler<T>) {
        // 写 remove 太麻烦了. 可以直接全部清空再重新 load 一遍
    }

    public unload() {
        // 将 handlers 置空同时会造成 dom events remove. 猜测是 dom 的 event handler 只要 handler 没有被持有就会被 vm 回收
        this.handlers = {};
        // obsidian 的 event handler 回收
        this.vaultEventRefs.forEach(ref => this.app.vault.offref(ref));
        this.metadataCacheEventRefs.forEach(ref => this.app.metadataCache.offref(ref));
        this.workspaceEventRefs.forEach(ref => this.app.workspace.offref(ref));
    }

    /**
     * js 单线程机制. 不需要处理并发更新问题. 即正在处理时又设置了 data 导致丢失事件的问题
     */
    private bufferDispatch(event: string, data: any) {
        // 没有对应事件处理器则直接返回
        if (!this.handlers[event]) {
            return
        }

        // 如果事件不存在，则初始化一个空数组
        if (!this.eventBuffer[event]) {
            this.eventBuffer[event] = [];
        }
        // 将数据推入事件缓冲区
        this.eventBuffer[event].push(data);

        // 如果尚未设置超时，则设置一个
        if (!this.timeoutIds[event]) {
            this.timeoutIds[event] = setTimeout(() => this.realDispatch(event), 1000);
        }
    }

    /**
     * js 单线程机制. 不需要处理并发更新问题. 即正在处理时又设置了 data 导致丢失事件的问题
     */
    private realDispatch(event: string) {
        // 处理特定事件
        // todo eventData 可能还是有点多 不应该全缓存的应该 应该允许每个不同事件自己去进行 merge 逻辑 但是考虑到1s也不好缓存太多 现在的情况也能handle很多情况了 先这样吧
        const eventData = this.eventBuffer[event];
        // console.log(`Triggering ${event} with data:`, eventData);

        try {
            const eventHandlers = this.handlers[event];
            if (eventHandlers) {
                eventHandlers.forEach(handler => handler(eventData));
            }
        } finally {
            // 确保清理总是执行
            delete this.eventBuffer[event];
            clearTimeout(this.timeoutIds[event]!);
            delete this.timeoutIds[event];
        }
    }

    /**
     * @param eventName eg: "click"
     */
    private registerDomEvents(eventName: string) {
        const validEventName = eventName as keyof DocumentEventMap;
        this.plugin.registerDomEvent(document, validEventName, (evt) => {
            this.domBufferDispatch(eventName, evt)
        })
    }

    private domBufferDispatch(eventName: string, evt: any) {
        this.bufferDispatch('dom-' + eventName, evt)
    }

    private registerVaultEvents(eventName: string) {
        switch (eventName) {
            case 'create':
                // This is also called when the vault is first loaded for each existing file.
                // => which means there will trigger too many events after first load.
                // => so we do not process this event
                // "https://docs.obsidian.md/Reference/TypeScript+API/Vault/on('create')"
                this.app.workspace.onLayoutReady(() => {
                    this.vaultEventRefs.push(
                        this.app.vault.on('create', (file: TAbstractFile) => this.vaultBufferDispatch('create', file))
                    );
                })
                break;
            case 'modify':
                this.vaultEventRefs.push(
                    this.app.vault.on('modify', (file: TAbstractFile) => this.vaultBufferDispatch('modify', file))
                );
                break;
            case 'delete':
                this.vaultEventRefs.push(
                    this.app.vault.on('delete', (file: TAbstractFile) => this.vaultBufferDispatch('delete', file))
                );
                break;
            case 'rename':
                this.vaultEventRefs.push(
                    this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => this.vaultBufferDispatch('rename', { file, oldPath }))
                );
                break;
            default:
                break;
        }
    }

    private vaultBufferDispatch(eventName: string, evt: any) {
        this.bufferDispatch('vault-' + eventName, evt)
    }

    private registerMetadataCacheEvents(eventName: string) {
        switch (eventName) {
            case 'changed':
                this.metadataCacheEventRefs.push(
                    this.app.metadataCache.on('changed', (file: TFile) => this.metadataCacheBufferDispatch('changed', file))
                );
                break;
            case 'deleted':
                this.metadataCacheEventRefs.push(
                    this.app.metadataCache.on('deleted', (file: TFile, prevCache: CachedMetadata | null) => this.metadataCacheBufferDispatch('deleted', { file, prevCache }))
                );
                break;
            case 'resolve':
                // // 不知道两个事件的用处. resolve 会在一开始启动的时候大量调用.
                // // "https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/on('resolve')"
                // this.metadataCacheEventRefs.push(
                //     this.app.metadataCache.on('resolve', (file: TFile) => this.metadataCacheBufferDispatch('resolve', file))
                // );
                break;
            case 'resolved':
                // this.metadataCacheEventRefs.push(
                //     this.app.metadataCache.on('resolved', () => this.metadataCacheBufferDispatch('resolved', {}))
                // );
                break;
            default:
                break;
        }

    }

    private metadataCacheBufferDispatch(eventName: string, evt: any) {
        this.bufferDispatch('metadataCache-' + eventName, evt)
    }

    private registerWorkspaceEvents(eventName: string) {
        switch (eventName) {
            case 'quick-preview':
                this.workspaceEventRefs.push(
                    this.app.workspace.on('quick-preview', (file: TFile, data: string) => {
                        this.workspaceBufferDispatch('quick-preview', { file, data });
                    })
                );
                break;

            case 'resize':
                this.workspaceEventRefs.push(
                    this.app.workspace.on('resize', () => {
                        this.workspaceBufferDispatch('resize', {});
                    })
                );
                break;

            case 'active-leaf-change':
                this.workspaceEventRefs.push(
                    this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
                        this.workspaceBufferDispatch('active-leaf-change', leaf);
                    })
                );
                break;

            case 'file-open':
                this.workspaceEventRefs.push(
                    this.app.workspace.on('file-open', (file: TFile | null) => {
                        this.workspaceBufferDispatch('file-open', file);
                    })
                );
                break;

            case 'layout-change':
                this.workspaceEventRefs.push(
                    this.app.workspace.on('layout-change', () => {
                        this.workspaceBufferDispatch('layout-change', {});
                    })
                );
                break;

            case 'window-open':
                this.workspaceEventRefs.push(
                    this.app.workspace.on('window-open', (win: WorkspaceWindow, window: Window) => {
                        this.workspaceBufferDispatch('window-open', { win, window });
                    })
                );
                break;

            case 'window-close':
                this.workspaceEventRefs.push(
                    this.app.workspace.on('window-close', (win: WorkspaceWindow, window: Window) => {
                        this.workspaceBufferDispatch('window-close', { win, window });
                    })
                );
                break;

            case 'css-change':
                this.workspaceEventRefs.push(
                    this.app.workspace.on('css-change', () => {
                        this.workspaceBufferDispatch('css-change', {});
                    })
                );
                break;

            case 'file-menu':
                this.workspaceEventRefs.push(
                    this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf) => {
                        this.workspaceBufferDispatch('file-menu', { menu, file, source, leaf });
                    })
                );
                break;

            case 'files-menu':
                this.workspaceEventRefs.push(
                    this.app.workspace.on('files-menu', (menu: Menu, files: TAbstractFile[], source: string, leaf?: WorkspaceLeaf) => {
                        this.workspaceBufferDispatch('files-menu', { menu, files, source, leaf });
                    })
                );
                break;

            case 'url-menu':
                this.workspaceEventRefs.push(
                    this.app.workspace.on('url-menu', (menu: Menu, url: string) => {
                        this.workspaceBufferDispatch('url-menu', { menu, url });
                    })
                );
                break;

            case 'editor-menu':
                this.workspaceEventRefs.push(
                    this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
                        this.workspaceBufferDispatch('editor-menu', { menu, editor, info });
                    })
                );
                break;

            case 'editor-change':
                this.workspaceEventRefs.push(
                    this.app.workspace.on('editor-change', (editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
                        this.workspaceBufferDispatch('editor-change', { editor, info });
                    })
                );
                break;

            case 'editor-paste':
                this.workspaceEventRefs.push(
                    this.app.workspace.on('editor-paste', (evt: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
                        this.workspaceBufferDispatch('editor-paste', { evt, editor, info });
                    })
                );
                break;

            case 'editor-drop':
                this.workspaceEventRefs.push(
                    this.app.workspace.on('editor-drop', (evt: DragEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
                        this.workspaceBufferDispatch('editor-drop', { evt, editor, info });
                    })
                );
                break;

            case 'quit':
                this.workspaceEventRefs.push(
                    this.app.workspace.on('quit', (tasks: Tasks) => {
                        this.workspaceBufferDispatch('quit', tasks);
                    })
                );
                break;

            default:
                break;
        }
    }

    private workspaceBufferDispatch(eventName: string, evt: any) {
        this.bufferDispatch('workspace-' + eventName, evt)
    }

    /**
     * 
     * @param str eg: "dom-click" "workspace-editor-change"
     * @returns eg: ["dom", click] ["workspace", "editor-change"]
     */
    private extractEventName(str: string) {
        const hyphenIndex = str.indexOf('-');

        if (hyphenIndex === -1) {
            // If there is no hyphen, return the whole string as the first part and an empty string as the second part
            return [str, ''];
        }

        const beforeHyphen = str.slice(0, hyphenIndex);
        const afterHyphen = str.slice(hyphenIndex + 1); // +1 to exclude the hyphen itself

        return [beforeHyphen, afterHyphen];
    }
}