import { RawData, WebSocket } from "ws";

export interface IAkiWebSocketMessageHandler
{
    onAkiMessage(sessionID: string, client: WebSocket, message: RawData): void
}
