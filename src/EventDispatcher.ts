import { EventRef, Plugin, App, TAbstractFile, TFile, CachedMetadata, WorkspaceLeaf, WorkspaceWindow, Menu, Editor, MarkdownView, MarkdownFileInfo, Tasks } from "obsidian";

type EventHandler<T = any> = (data: T) => void;
/**
 * 1. obsidian 触发事件 => 寻找所有 handler => 分发给对应 handler
 * 2. 初始化 EventDispatcher => 监听所有 obsidian 事件 => 注册默认 dispatch 分发器.
 * 3. addNewHandler => 修改 dispatch 分发器
 * 4. 卸载所有监听事件
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
     */
    private handlers: { [key: string]: EventHandler[] } = {};

    /**
     * bufferTrigger
     * 事件太多了. 降低处理的量. 提高性能.
     */
    private eventBuffer: { [key: string]: any[] } = {};
    private timeoutIds: { [key: string]: NodeJS.Timeout | null } = {};

    constructor(private app: App, private plugin: Plugin) {
        this.init();
    }

    private async init() {
        // 注册 Obsidian 事件
        this.registerVaultEvents();
        this.registerMetadataCacheEvents();
        this.registerWorkspaceEvents();

    }

    /**
     * @param eventName eg: "click"
     */
    private registerDomEvents(eventName: string) {
        const validEventName = eventName as keyof DocumentEventMap;
        this.plugin.registerDomEvent(document, validEventName, (evt) => {
            this.bufferDispatch('dom-' + eventName, evt)
        })
    }

    private registerVaultEvents() {
        // This is also called when the vault is first loaded for each existing file.
        // => which means there will trigger too many events after first load.
        // => so we do not process this event
        // "https://docs.obsidian.md/Reference/TypeScript+API/Vault/on('create')"
        this.app.workspace.onLayoutReady(() => {
            this.vaultEventRefs.push(
                this.app.vault.on('create', (file: TAbstractFile) => this.bufferDispatch('create', file))
            );
        })
        this.vaultEventRefs.push(
            this.app.vault.on('modify', (file: TAbstractFile) => this.bufferDispatch('modify', file))
        );
        this.vaultEventRefs.push(
            this.app.vault.on('delete', (file: TAbstractFile) => this.bufferDispatch('delete', file))
        );
        this.vaultEventRefs.push(
            this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => this.bufferDispatch('rename', { file, oldPath }))
        );
    }

    private registerMetadataCacheEvents() {
        this.metadataCacheEventRefs.push(
            this.app.metadataCache.on('changed', (file: TFile) => this.bufferDispatch('changed', file))
        );
        this.metadataCacheEventRefs.push(
            this.app.metadataCache.on('deleted', (file: TFile, prevCache: CachedMetadata | null) => this.bufferDispatch('deleted', { file, prevCache }))
        );
        // // 不知道两个事件的用处. resolve 会在一开始启动的时候大量调用.
        // // "https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/on('resolve')"
        // this.metadataCacheEventRefs.push(
        //     this.app.metadataCache.on('resolve', (file: TFile) => this.bufferDispatch('resolve', file))
        // );
        // this.metadataCacheEventRefs.push(
        //     this.app.metadataCache.on('resolved', () => this.bufferDispatch('resolved', {}))
        // );
    }

    private registerWorkspaceEvents() {
        this.workspaceEventRefs.push(
            this.app.workspace.on('quick-preview', (file: TFile, data: string) => this.bufferDispatch('quick-preview', { file, data }))
        );
        this.workspaceEventRefs.push(
            this.app.workspace.on('resize', () => this.bufferDispatch('resize', {}))
        );
        this.workspaceEventRefs.push(
            this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => this.bufferDispatch('active-leaf-change', leaf))
        );
        this.workspaceEventRefs.push(
            this.app.workspace.on('file-open', (file: TFile | null) => this.bufferDispatch('file-open', file))
        );
        this.workspaceEventRefs.push(
            this.app.workspace.on('layout-change', () => this.bufferDispatch('layout-change', {}))
        );
        this.workspaceEventRefs.push(
            this.app.workspace.on('window-open', (win: WorkspaceWindow, window: Window) => this.bufferDispatch('window-open', { win, window }))
        );
        this.workspaceEventRefs.push(
            this.app.workspace.on('window-close', (win: WorkspaceWindow, window: Window) => this.bufferDispatch('window-close', { win, window }))
        );
        this.workspaceEventRefs.push(
            this.app.workspace.on('css-change', () => this.bufferDispatch('css-change', {}))
        );
        this.workspaceEventRefs.push(
            this.app.workspace.on('file-menu',
                (menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf) =>
                    this.bufferDispatch('file-menu', { menu, file, source, leaf })
            )
        );
        this.workspaceEventRefs.push(
            this.app.workspace.on('files-menu',
                (menu: Menu, files: TAbstractFile[], source: string, leaf?: WorkspaceLeaf) =>
                    this.bufferDispatch('files-menu', { menu, files, source, leaf }))
        );
        this.workspaceEventRefs.push(
            this.app.workspace.on('url-menu', (menu: Menu, url: string) => this.bufferDispatch('url-menu', { menu, url }))
        );
        this.workspaceEventRefs.push(
            this.app.workspace.on('editor-menu',
                (menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo) =>
                    this.bufferDispatch('editor-menu', { menu, editor, info }))
        );
        this.workspaceEventRefs.push(
            this.app.workspace.on('editor-change',
                (editor: Editor, info: MarkdownView | MarkdownFileInfo) =>
                    this.bufferDispatch('editor-change', { editor, info }))
        );
        this.workspaceEventRefs.push(
            this.app.workspace.on('editor-paste',
                (evt: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) =>
                    this.bufferDispatch('editor-paste', { evt, editor, info }))
        );
        this.workspaceEventRefs.push(
            this.app.workspace.on('editor-drop',
                (evt: DragEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) =>
                    this.bufferDispatch('editor-drop', { evt, editor, info }))
        );
        this.workspaceEventRefs.push(
            this.app.workspace.on('quit', (tasks: Tasks) => this.bufferDispatch('quit', tasks))
        );
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
        const eventData = this.eventBuffer[event];
        console.log(`Triggering ${event} with data:`, eventData);

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

    public addNewHandler<T>(event: string, handler: EventHandler<T>) {
        if (!this.handlers[event]) {
            this.handlers[event] = [];
        }
        this.handlers[event].push(handler);
    }

    public removeHandler<T>(event: string, handler: EventHandler<T>) {
        const eventHandlers = this.handlers[event];
        if (eventHandlers) {
            this.handlers[event] = eventHandlers.filter(h => h !== handler);
        }
    }

    public unload() {
        this.handlers = {};
        this.vaultEventRefs.forEach(ref => this.app.vault.offref(ref));
        this.metadataCacheEventRefs.forEach(ref => this.app.metadataCache.offref(ref));
        this.workspaceEventRefs.forEach(ref => this.app.workspace.offref(ref));
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