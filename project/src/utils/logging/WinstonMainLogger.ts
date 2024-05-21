import { inject, injectable } from "tsyringe";
import { IAsyncQueue } from "@spt/models/spt/utils/IAsyncQueue";
import { AbstractWinstonLogger } from "@spt/utils/logging/AbstractWinstonLogger";

@injectable()
export class WinstonMainLogger extends AbstractWinstonLogger
{
    constructor(@inject("AsyncQueue") protected asyncQueue: IAsyncQueue)
    {
        super(asyncQueue);
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
