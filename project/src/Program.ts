import { ErrorHandler } from "@spt/ErrorHandler";
import { Container } from "@spt/di/Container";
import buildInfo from "@spt/entry/build.json" assert { type: "json" };
import type { PreSptModLoader } from "@spt/loaders/PreSptModLoader";
import { App } from "@spt/utils/App";
import { Watermark } from "@spt/utils/Watermark";
import { container } from "tsyringe";

export enum EntryType {
    LOCAL = "LOCAL",
    DEBUG = "DEBUG",
    RELEASE = "RELEASE",
    BLEEDING_EDGE = "BLEEDING_EDGE",
    BLEEDING_EDGE_MODS = "BLEEDING_EDGE_MODS",
}

export class Program {
    private static _ENTRY_TYPE: EntryType;

    private static _DEBUG: boolean;
    private static _COMPILED: boolean;
    private static _MODS: boolean;

    private static _SPT_VERSION: string;
    private static _COMMIT: string;
    private static _BUILD_TIME: number;

    private errorHandler: ErrorHandler;

    constructor() {
        process.stdout.setEncoding("utf8");
        process.title = "SPT Server";

        this.errorHandler = new ErrorHandler();
    }

    public async start(): Promise<void> {
        try {
            Container.registerTypes(container);
            const childContainer = container.createChildContainer();
            const watermark = childContainer.resolve<Watermark>("Watermark");
            watermark.initialize();

            const preSptModLoader = childContainer.resolve<PreSptModLoader>("PreSptModLoader");
            Container.registerListTypes(childContainer);
            await preSptModLoader.load(childContainer);

            Container.registerPostLoadTypes(container, childContainer);
            childContainer.resolve<App>("App").load();
        } catch (err: unknown) {
            this.errorHandler.handleCriticalError(err instanceof Error ? err : new Error(String(err)));
        }
    }

    public static initialize(): void {
        Program._ENTRY_TYPE = buildInfo.entryType as EntryType;
        Program._SPT_VERSION = buildInfo.sptVersion ?? "";
        Program._COMMIT = buildInfo.commit ?? "";
        Program._BUILD_TIME = buildInfo.buildTime ?? 0;

        switch (Program._ENTRY_TYPE) {
            case EntryType.RELEASE:
                Program._DEBUG = false;
                Program._COMPILED = true;
                Program._MODS = true;
                break;
            case EntryType.BLEEDING_EDGE:
                Program._DEBUG = true;
                Program._COMPILED = true;
                Program._MODS = false;
                break;
            case EntryType.DEBUG:
            case EntryType.BLEEDING_EDGE_MODS:
                Program._DEBUG = true;
                Program._COMPILED = true;
                Program._MODS = true;
                break;
            default: // EntryType.LOCAL
                Program._DEBUG = true;
                Program._COMPILED = false;
                Program._MODS = true;
                break;
        }
    }

    // Public Static Getters
    public static get ENTRY_TYPE(): EntryType {
        return Program._ENTRY_TYPE;
    }
    public static get DEBUG(): boolean {
        return Program._DEBUG;
    }
    public static get COMPILED(): boolean {
        return Program._COMPILED;
    }
    public static get MODS(): boolean {
        return Program._MODS;
    }
    public static get SPT_VERSION(): string {
        return Program._SPT_VERSION;
    }
    public static get COMMIT(): string {
        return Program._COMMIT;
    }
    public static get BUILD_TIME(): number {
        return Program._BUILD_TIME;
    }
}
