import { inject, injectable } from "tsyringe";
import { RawData, WebSocket } from "ws";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ISptWebSocketMessageHandler } from "@spt/servers/ws/message/ISptWebSocketMessageHandler";

@injectable()
export class DefaultSptWebSocketMessageHandler implements ISptWebSocketMessageHandler
{
    constructor(@inject("WinstonLogger") protected logger: ILogger)
    {}

    public onSptMessage(sessionId: string, client: WebSocket, message: RawData): void
    {
        this.logger.debug(`[${sessionId}] SPT message received: ${message}`);
    }
}
