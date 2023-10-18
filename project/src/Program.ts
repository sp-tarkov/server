import { container } from "tsyringe";

import { ErrorHandler } from "@spt-aki/ErrorHandler";
import { Container } from "@spt-aki/di/Container";
import type { PreAkiModLoader } from "@spt-aki/loaders/PreAkiModLoader";
import { App } from "@spt-aki/utils/App";
import { Watermark } from "@spt-aki/utils/Watermark";

export class Program
{

    private errorHandler: ErrorHandler;
    constructor() 
    {
        // set window properties
        process.stdout.setEncoding("utf8");
        process.title = "SPT-AKI Server";
        this.errorHandler = new ErrorHandler();
    }
    
    public start(): void 
    {
        try
        {
            Container.registerTypes(container);
            const childContainer = container.createChildContainer();
            childContainer.resolve<Watermark>("Watermark");
            const preAkiModLoader = childContainer.resolve<PreAkiModLoader>("PreAkiModLoader");
            Container.registerListTypes(childContainer);
            preAkiModLoader.load(childContainer)
                .then(() => 
                {
                    Container.registerPostLoadTypes(container, childContainer);
                    childContainer.resolve<App>("App").load();
                }).catch(rej => this.errorHandler.handleCriticalError(rej));
            
        }
        catch (e)
        {
            this.errorHandler.handleCriticalError(e);
        }
    }
}
