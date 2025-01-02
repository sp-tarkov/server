import path from "node:path";
import { FileSystem } from "@spt/utils/FileSystem";
import { FileSystemSync } from "@spt/utils/FileSystemSync";
import { AbstractWinstonLogger } from "@spt/utils/logging/AbstractWinstonLogger";
import { inject, injectable } from "tsyringe";

@injectable()
export class WinstonMainLogger extends AbstractWinstonLogger {
    constructor(
        @inject("FileSystem") fileSystem: FileSystem,
        @inject("FileSystemSync") fileSystemSync: FileSystemSync,
    ) {
        super(fileSystem, fileSystemSync);
    }

    protected isLogExceptions(): boolean {
        return true;
    }

    protected isLogToFile(): boolean {
        return true;
    }

    protected isLogToConsole(): boolean {
        return true;
    }

    protected getFilePath(): string {
        return path.join("user", "logs");
    }

    protected getFileName(): string {
        return "server-%DATE%.log";
    }
}
