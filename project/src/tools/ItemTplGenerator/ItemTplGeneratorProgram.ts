import "reflect-metadata";
import "source-map-support/register";

import { ErrorHandler } from "@spt/ErrorHandler";
import { Container } from "@spt/di/Container";
import { ItemTplGenerator } from "@spt/tools/ItemTplGenerator/ItemTplGenerator";
import { Lifecycle, container } from "tsyringe";

export class ItemTplGeneratorProgram {
    private errorHandler: ErrorHandler;
    constructor() {
        // set window properties
        process.stdout.setEncoding("utf8");
        process.title = "SPT ItemTplGenerator";
        this.errorHandler = new ErrorHandler();
    }

    public async start(): Promise<void> {
        try {
            Container.registerTypes(container);
            const childContainer = container.createChildContainer();
            childContainer.register<ItemTplGenerator>("ItemTplGenerator", ItemTplGenerator, {
                lifecycle: Lifecycle.Singleton,
            });
            Container.registerListTypes(childContainer);
            Container.registerPostLoadTypes(container, childContainer);
            await childContainer.resolve<ItemTplGenerator>("ItemTplGenerator").run();
        } catch (err: any) {
            this.errorHandler.handleCriticalError(err instanceof Error ? err : new Error(err));
        }

        // Kill the process, something holds it open so we need to manually kill it
        process.exit();
    }
}

const program = new ItemTplGeneratorProgram();
program.start();
