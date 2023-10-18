import { inject, injectable } from "tsyringe";

import { IAsyncQueue } from "@spt-aki/models/spt/utils/IAsyncQueue";
import { IUUidGenerator } from "@spt-aki/models/spt/utils/IUuidGenerator";
import { AbstractWinstonLogger } from "@spt-aki/utils/logging/AbstractWinstonLogger";

@injectable()
export class WinstonRequestLogger extends AbstractWinstonLogger 
{
    constructor(
        @inject("AsyncQueue") protected asyncQueue: IAsyncQueue,
        @inject("UUidGenerator") protected uuidGenerator: IUUidGenerator
    )
    {
        super(asyncQueue, uuidGenerator);
    }

    protected isLogExceptions(): boolean 
    {
        return false;
    }

    protected isLogToFile(): boolean 
    {
        return true;
    }

    protected isLogToConsole(): boolean 
    {
        return false;
    }

    protected getFilePath(): string 
    {
        return "./user/logs/requests/";
    }

    protected getFileName(): string 
    {
        return "requests-%DATE%.log";
    }

    protected override getLogMaxSize(): string
    {
        return "80mb";
    }
}
