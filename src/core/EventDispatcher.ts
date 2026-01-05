import { EventRef, Plugin, App, TAbstractFile, TFile, CachedMetadata, WorkspaceLeaf, WorkspaceWindow, Menu, Editor, MarkdownView, MarkdownFileInfo, Tasks, Notice } from "obsidian";
import * as path from "path";
import { Callback, loadScriptsForEvent } from "./ScriptLoader";

type EventHandler<T = any> = (data: T) => void;

/**
 * Event dispatcher for handling Obsidian and custom events.
 *
 * Initially designed to avoid dependency on Obsidian's event system, but currently uses
 * Obsidian's event mechanism temporarily. This file is rarely used as a result.
 *
 * Design flow:
 * 1. Obsidian triggers events => find all handlers => dispatch to corresponding handlers
 * 2. Initialize EventDispatcher => listen to all Obsidian events => register default dispatch handlers
 * 3. addNewHandler => modify dispatch handlers
 * 4. Unload all event listeners
 *
 * TODO: Should support pushing custom events that others can subscribe to, not just handling
 * Obsidian's internal events. Custom events could be created like Kafka, making plugin
 * development more convenient and extensible.
 */
export class EventDispatcher {
    /**
     * Event references for easy cleanup
     */
    private vaultEventRefs: EventRef[] = [];
    private metadataCacheEventRefs: EventRef[] = [];
    private workspaceEventRefs: EventRef[] = [];
    private windowEventRefs: Map<string, EventListener> = new Map();
    private alreadyRegisteredEvents: Set<string> = new Set()

    /**
     * Event handlers
     * Key format: e.g., "dom-click", "workspace-editor-change"
     */
    private handlers: { [key: string]: EventHandler[] } = {};

    /**
     * Event buffering for performance optimization
     * Too many events occur, reduce processing load and improve performance.
     */
    private eventBuffer: { [key: string]: any[] } = {};
    private timeoutIds: { [key: string]: NodeJS.Timeout | null } = {};

    constructor(private app: App, private plugin: Plugin) {
    }

    private async init() {
        // // Batch registration consumes too much performance, changed to incremental registration
        // // Register Obsidian events
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
        // console.log(`File changed 1: `, changedFileParam, scriptFolderPath);

        let changedFileArray = changedFileParam as TAbstractFile[]
        changedFileArray = changedFileArray.filter(changedFile =>
            changedFile.path.startsWith(scriptFolderPath)
        );
        if (changedFileArray.length <= 0) {
            return
        }

        // console.log(`File changed 2:`, changedFileArray);
        // Add your logic here if needed
        this.unload()
        this.addScriptFolderListener(scriptFolderPath)
        // make a notice to let user know event listener had been registered
        new Notice('Peak Assistant. Event Scripts Reload!');
    }

    private loadFromScriptFolder(scriptFolderPath: string) {
        const basePath = (this.app.vault.adapter as any).basePath
        // load events
        const eventScripts: Map<string, Callback[]> = loadScriptsForEvent(
            path.join(basePath, scriptFolderPath)
        )
        // console.log(eventScripts);
        eventScripts.forEach((callbacks, event) => {
            callbacks.forEach((callback, index) => {
                this.addNewHandler(event, callback)
            })
        })
    }

    public addNewHandlers(eventHandlers: Map<string, EventHandler>) {
        eventHandlers.forEach((eventHandlerIter, eventNameIter)=> {
            this.addNewHandler(eventNameIter, eventHandlerIter)
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

        // Only register once. Because same events will go to dispatcher and find handlers there
        if (this.alreadyRegisteredEvents.has(eventName)) {
            return
        }
        this.alreadyRegisteredEvents.add(eventName)
        console.log("addNewHandler: ", firstPart, " - ", secondPart);
        switch (firstPart) {
            case 'window':
                this.registerWindowEvents(secondPart)
                break;
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
        // Writing remove is too complicated. Can just clear all and reload.
    }

    public unload() {
        // Clearing handlers will also cause DOM events to be removed.
        // Assumption: DOM event handlers will be garbage collected by VM if not held.
        this.handlers = {};
        // Cleanup Obsidian event handlers
        this.vaultEventRefs.forEach(ref => this.app.vault.offref(ref));
        this.metadataCacheEventRefs.forEach(ref => this.app.metadataCache.offref(ref));
        this.workspaceEventRefs.forEach(ref => this.app.workspace.offref(ref));
        this.windowEventRefs.forEach((eventListener, eventName) => window.removeEventListener(eventName, eventListener))
    }

    /**
     * JavaScript single-threaded mechanism. No need to handle concurrent update issues.
     * I.e., data loss when setting data while processing.
     */
    private bufferDispatch(event: string, data: any) {
        // Return directly if no corresponding event handler
        if (!this.handlers[event]) {
            return
        }

        // Initialize empty array if event doesn't exist
        if (!this.eventBuffer[event]) {
            this.eventBuffer[event] = [];
        }
        // Push data to event buffer
        this.eventBuffer[event].push(data);

        // Set timeout if not already set
        if (!this.timeoutIds[event]) {
            this.timeoutIds[event] = setTimeout(() => this.realDispatch(event), 1000);
        }
    }

    /**
     * JavaScript single-threaded mechanism. No need to handle concurrent update issues.
     * I.e., data loss when setting data while processing.
     */
    private realDispatch(event: string) {
        // Process specific event
        // TODO: eventData might be too much, shouldn't cache everything.
        // Should allow each different event to have its own merge logic.
        // But considering 1s won't cache too much, current situation handles many cases, leave it for now.
        const eventData = this.eventBuffer[event];
        // console.log(`Triggering ${event} with data:`, eventData);

        try {
            const eventHandlers = this.handlers[event];
            if (eventHandlers) {
                eventHandlers.forEach(handler => handler(eventData));
            }
        } finally {
            // Ensure cleanup always executes
            delete this.eventBuffer[event];
            clearTimeout(this.timeoutIds[event]!);
            delete this.timeoutIds[event];
        }
    }

    private registerWindowEvents(eventName: string) {
        const windowEventListener = (evt: Event) => {
            this.domBufferDispatch(eventName, evt)
        };
        const eventKey = eventName as keyof WindowEventMap
        this.windowEventRefs.set(
            eventKey,
            windowEventListener
        )
        window.addEventListener(eventKey, windowEventListener);
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
                // // Don't know the use of these two events. resolve will be called heavily at startup.
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