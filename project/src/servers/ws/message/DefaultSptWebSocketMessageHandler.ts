import type { ILogger } from "@spt/models/spt/utils/ILogger";
import type { ISptWebSocketMessageHandler } from "@spt/servers/ws/message/ISptWebSocketMessageHandler";
import { inject, injectable } from "tsyringe";
import { WebSocket } from "ws";
import type { RawData } from "ws";

@injectable()
export class DefaultSptWebSocketMessageHandler implements ISptWebSocketMessageHandler {
    constructor(@inject("PrimaryLogger") protected logger: ILogger) {}

    public onSptMessage(sessionId: string, client: WebSocket, message: RawData): void {
        this.logger.debug(`[${sessionId}] SPT message received: ${message}`);
    }
}
