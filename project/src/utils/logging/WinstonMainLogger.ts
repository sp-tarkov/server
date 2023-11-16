import { inject, injectable } from "tsyringe";

import { IAsyncQueue } from "@spt-aki/models/spt/utils/IAsyncQueue";
import { IUUidGenerator } from "@spt-aki/models/spt/utils/IUuidGenerator";
import { AbstractWinstonLogger } from "@spt-aki/utils/logging/AbstractWinstonLogger";

@injectable()
export class WinstonMainLogger extends AbstractWinstonLogger
{
    constructor(
        @inject("AsyncQueue") protected asyncQueue: IAsyncQueue,
        @inject("UUidGenerator") protected uuidGenerator: IUUidGenerator,
    )
    {
        super(asyncQueue, uuidGenerator);
    }

    protected isLogExceptions(): boolean
    {
        return true;
    }

    protected isLogToFile(): boolean
    {
        return true;
    }

    protected isLogToConsole(): boolean
    {
        return true;
    }

    protected getFilePath(): string
    {
        return "./user/logs/";
    }

    protected getFileName(): string
    {
        return "server-%DATE%.log";
    }
}
