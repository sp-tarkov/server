import readline from "node:readline";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { WinstonMainLogger } from "@spt/utils/logging/WinstonMainLogger";
import { FileSystem } from "./utils/FileSystem";
import { FileSystemSync } from "./utils/FileSystemSync";

export class ErrorHandler {
    private logger: ILogger;
    private readLine: readline.Interface;

    constructor() {
        const fileSystem = new FileSystem();
        const fileSystemSync = new FileSystemSync();
        this.logger = new WinstonMainLogger(fileSystem, fileSystemSync);
        this.readLine = readline.createInterface({ input: process.stdin, output: process.stdout });
    }

    public handleCriticalError(err: Error): void {
        this.logger.error("The application had a critical error and failed to run");
        this.logger.error(`Exception produced: ${err.name}`);
        if (err.stack) {
            this.logger.error(`\nStacktrace:\n${err.stack}`);
        }

        this.readLine.question("Press Enter to close the window", (_ans) => this.readLine.close());
        this.readLine.on("close", () => process.exit(1));
    }
}
