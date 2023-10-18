import readline from "readline";

import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { AsyncQueue } from "@spt-aki/utils/AsyncQueue";
import { UUidGenerator } from "@spt-aki/utils/UUidGenerator";
import { WinstonMainLogger } from "@spt-aki/utils/logging/WinstonMainLogger";

export class ErrorHandler
{
    private logger:ILogger;
    private readLine: readline.Interface;

    constructor()
    {
        this.logger = new WinstonMainLogger(new AsyncQueue(), new UUidGenerator());
        this.readLine = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    public handleCriticalError(err: any): void
    {
        this.logger.error("The application had a critical error and failed to run");
        this.logger.error(`Exception produced: ${err}`);
        if (err.stack)
            this.logger.error(`\nStacktrace:\n ${err.stack}`);
            
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        this.readLine.question("Press Enter to close the window", (_ans) => this.readLine.close());
        this.readLine.on("close", () => process.exit(0));
    }
}