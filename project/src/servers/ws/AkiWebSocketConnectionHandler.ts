import { IncomingMessage } from "http";
import { inject, injectAll, injectable } from "tsyringe";
import { WebSocket } from "ws";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { IWsNotificationEvent } from "@spt-aki/models/eft/ws/IWsNotificationEvent";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { NotificationEventType } from "@spt-aki/models/enums/NotificationEventType";
import { IHttpConfig } from "@spt-aki/models/spt/config/IHttpConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { IWebSocketConnectionHandler } from "@spt-aki/servers/ws/IWebSocketConnectionHandler";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { IAkiWebSocketMessageHandler } from "./message/IAkiWebSocketMessageHandler";

@injectable()
export class AkiWebSocketConnectionHandler implements IWebSocketConnectionHandler
{
    protected httpConfig: IHttpConfig;
    protected webSockets: Map<string, WebSocket> = new Map<string, WebSocket>();
    protected defaultNotification: IWsNotificationEvent = { type: NotificationEventType.PING, eventId: "ping" };

    protected websocketPingHandler = null;
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @injectAll("AkiWebSocketMessageHandler") protected akiWebSocketMessageHandlers: IAkiWebSocketMessageHandler[],
    )
    {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
    }

    public getSocketId(): string
    {
        return "AKI WebSocket Handler";
    }

    public getHookUrl(): string
    {
        return "/notifierServer/getwebsocket/";
    }

    public onConnection(ws: WebSocket, req: IncomingMessage): void
    {
        // Strip request and break it into sections
        const splitUrl = req.url.substring(0, req.url.indexOf("?")).split("/");
        const sessionID = splitUrl.pop();
        const playerProfile = this.profileHelper.getFullProfile(sessionID);
        const playerInfoText = `${playerProfile.info.username} (${sessionID})`;

        this.logger.info(this.localisationService.getText("websocket-player_connected", playerInfoText));

        // throw new Error("Method not implemented.");
        this.webSockets.set(sessionID, ws);

        if (this.websocketPingHandler)
        {
            clearInterval(this.websocketPingHandler);
        }

        ws.on("message", (msg) => this.akiWebSocketMessageHandlers.forEach((wsmh) => wsmh.onAkiMessage(sessionID, this.webSockets.get(sessionID), msg)));

        this.websocketPingHandler = setInterval(() =>
        {
            this.logger.debug(this.localisationService.getText("websocket-pinging_player", sessionID));

            if (ws.readyState === WebSocket.OPEN)
            {
                ws.send(this.jsonUtil.serialize(this.defaultNotification));
            }
            else
            {
                this.logger.debug(this.localisationService.getText("websocket-socket_lost_deleting_handle"));
                clearInterval(this.websocketPingHandler);
                this.webSockets.delete(sessionID);
            }
        }, this.httpConfig.webSocketPingDelayMs);
    }

    public sendMessage(sessionID: string, output: IWsNotificationEvent): void
    {
        try
        {
            if (this.isConnectionWebSocket(sessionID))
            {
                this.webSockets.get(sessionID).send(this.jsonUtil.serialize(output));
                this.logger.debug(this.localisationService.getText("websocket-message_sent"));
            }
            else
            {
                this.logger.debug(this.localisationService.getText("websocket-not_ready_message_not_sent", sessionID));
            }
        }
        catch (err)
        {
            this.logger.error(this.localisationService.getText("websocket-message_send_failed_with_error", err));
        }
    }

    public isConnectionWebSocket(sessionID: string): boolean
    {
        return this.webSockets.has(sessionID) && this.webSockets.get(sessionID).readyState === WebSocket.OPEN;
    }

    public getSessionWebSocket(sessionID: string): WebSocket
    {
        return this.webSockets[sessionID];
    }
}
