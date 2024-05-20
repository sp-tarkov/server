import { inject, injectable } from "tsyringe";
import { RawData, WebSocket } from "ws";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { IAkiWebSocketMessageHandler } from "@spt-aki/servers/ws/message/IAkiWebSocketMessageHandler";

@injectable()
export class DefaultAkiWebSocketMessageHandler implements IAkiWebSocketMessageHandler
{
    constructor(@inject("WinstonLogger") protected logger: ILogger)
    {}

    public onAkiMessage(sessionId: string, client: WebSocket, message: RawData): void
    {
        this.logger.debug(`[${sessionId}] AKI message received: ${message}`);
    }
}
