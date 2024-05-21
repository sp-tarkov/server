import { inject, injectable } from "tsyringe";
import { IAsyncQueue } from "@spt/models/spt/utils/IAsyncQueue";
import { AbstractWinstonLogger } from "@spt/utils/logging/AbstractWinstonLogger";

@injectable()
export class WinstonRequestLogger extends AbstractWinstonLogger
{
    constructor(@inject("AsyncQueue") protected asyncQueue: IAsyncQueue)
    {
        super(asyncQueue);
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
