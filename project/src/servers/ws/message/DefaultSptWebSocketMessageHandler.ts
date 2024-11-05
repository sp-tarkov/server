import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ISptWebSocketMessageHandler } from "@spt/servers/ws/message/ISptWebSocketMessageHandler";
import { inject, injectable } from "tsyringe";
import { RawData, WebSocket } from "ws";

@injectable()
export class DefaultSptWebSocketMessageHandler implements ISptWebSocketMessageHandler {
    constructor(@inject("PrimaryLogger") protected logger: ILogger) {}

    public onSptMessage(sessionId: string, client: WebSocket, message: RawData): void {
        this.logger.debug(`[${sessionId}] SPT message received: ${message}`);
    }
}
