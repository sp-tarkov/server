import { ErrorHandler } from "@spt/ErrorHandler";
import { Container } from "@spt/di/Container";
import type { PreSptModLoader } from "@spt/loaders/PreSptModLoader";
import { App } from "@spt/utils/App";
import { DatabaseDecompressionUtil } from "@spt/utils/DatabaseDecompressionUtil";
import { Watermark } from "@spt/utils/Watermark";
import { container } from "tsyringe";

export class Program {
    private errorHandler: ErrorHandler;
    constructor() {
        // set window properties
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

            const databaseDecompressionUtil =
                childContainer.resolve<DatabaseDecompressionUtil>("DatabaseDecompressionUtil");
            await databaseDecompressionUtil.initialize();

            const preSptModLoader = childContainer.resolve<PreSptModLoader>("PreSptModLoader");
            Container.registerListTypes(childContainer);
            await preSptModLoader.load(childContainer);

            Container.registerPostLoadTypes(container, childContainer);
            childContainer.resolve<App>("App").load();
        } catch (err: any) {
            this.errorHandler.handleCriticalError(err instanceof Error ? err : new Error(err));
        }
    }
}
