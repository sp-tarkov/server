import path from "node:path";
import { FileSystem } from "@spt/utils/FileSystem";
import { FileSystemSync } from "@spt/utils/FileSystemSync";
import { AbstractWinstonLogger } from "@spt/utils/logging/AbstractWinstonLogger";
import { inject, injectable } from "tsyringe";

@injectable()
export class WinstonRequestLogger extends AbstractWinstonLogger {
    constructor(
        @inject("FileSystem") fileSystem: FileSystem,
        @inject("FileSystemSync") fileSystemSync: FileSystemSync,
    ) {
        super(fileSystem, fileSystemSync);
    }

    protected isLogExceptions(): boolean {
        return false;
    }

    protected isLogToFile(): boolean {
        return true;
    }

    protected isLogToConsole(): boolean {
        return false;
    }

    protected getFilePath(): string {
        return path.join("user", "logs", "requests");
    }

    protected getFileName(): string {
        return "requests-%DATE%.log";
    }

    protected override getLogMaxSize(): string {
        return "80mb";
    }
}
