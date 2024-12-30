import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ISptWebSocketMessageHandler } from "@spt/servers/ws/message/ISptWebSocketMessageHandler";
import { inject, injectable } from "tsyringe";
import { RawData } from "ws";
import { SPTWebSocket } from "../SPTWebsocket";

@injectable()
export class DefaultSptWebSocketMessageHandler implements ISptWebSocketMessageHandler {
    constructor(@inject("PrimaryLogger") protected logger: ILogger) {}

    public async onSptMessage(sessionId: string, client: SPTWebSocket, message: RawData): Promise<void> {
        this.logger.debug(`[${sessionId}] SPT message received: ${message}`);
    }
}
