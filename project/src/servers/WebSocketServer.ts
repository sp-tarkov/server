import http, { IncomingMessage } from "node:http";
import { inject, injectable } from "tsyringe";
import WebSocket from "ws";
import { HttpServerHelper } from "@spt-aki/helpers/HttpServerHelper";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { IWsNotificationEvent } from "@spt-aki/models/eft/ws/IWsNotificationEvent";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { NotificationEventType } from "@spt-aki/models/enums/NotificationEventType";
import { IHttpConfig } from "@spt-aki/models/spt/config/IHttpConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

@injectable()
export class WebSocketServer
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
    )
    {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
    }

    protected httpConfig: IHttpConfig;
    protected defaultNotification: IWsNotificationEvent = { type: NotificationEventType.PING, eventId: "ping" };

    protected webSocketServer: WebSocket.Server;
    protected webSockets: Record<string, WebSocket.WebSocket> = {};
    protected websocketPingHandler = null;

    public getWebSocketServer(): WebSocket.Server
    {
        return this.webSocketServer;
    }

    public getSessionWebSocket(sessionID: string): WebSocket.WebSocket
    {
        return this.webSockets[sessionID];
    }

    public setupWebSocket(httpServer: http.Server): void
    {
        this.webSocketServer = new WebSocket.Server({ server: httpServer });

        this.webSocketServer.addListener("listening", () =>
        {
            this.logger.success(
                this.localisationService.getText("websocket-started", this.httpServerHelper.getWebsocketUrl()),
            );
            this.logger.success(
                `${this.localisationService.getText("server_running")}, ${this.getRandomisedMessage()}!`,
            );
        });

        this.webSocketServer.addListener("connection", this.wsOnConnection.bind(this));
    }

    public sendMessage(sessionID: string, output: IWsNotificationEvent): void
    {
        try
        {
            if (this.isConnectionWebSocket(sessionID))
            {
                this.webSockets[sessionID].send(this.jsonUtil.serialize(output));
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

    protected getRandomisedMessage(): string
    {
        if (this.randomUtil.getInt(1, 1000) > 999)
        {
            return this.localisationService.getRandomTextThatMatchesPartialKey("server_start_meme_");
        }

        return globalThis.G_RELEASE_CONFIGURATION
            ? `${this.localisationService.getText("server_start_success")}!`
            : this.localisationService.getText("server_start_success");
    }

    public isConnectionWebSocket(sessionID: string): boolean
    {
        return this.webSockets[sessionID] !== undefined && this.webSockets[sessionID].readyState === WebSocket.OPEN;
    }

    protected wsOnConnection(ws: WebSocket.WebSocket, req: IncomingMessage): void
    {
        // Strip request and break it into sections
        const splitUrl = req.url.substring(0, req.url.indexOf("?")).split("/");
        const sessionID = splitUrl.pop();
        const playerProfile = this.profileHelper.getFullProfile(sessionID);
        const playerInfoText = `${playerProfile.info.username} (${sessionID})`;

        this.logger.info(this.localisationService.getText("websocket-player_connected", playerInfoText));

        const logger = this.logger;
        const msgToLog = this.localisationService.getText("websocket-received_message", playerInfoText);
        ws.on("message", (msg) =>
        {
            logger.info(`${msgToLog} ${msg}`);
        });

        this.webSockets[sessionID] = ws;

        if (this.websocketPingHandler)
        {
            clearInterval(this.websocketPingHandler);
        }

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
                delete this.webSockets[sessionID];
            }
        }, this.httpConfig.webSocketPingDelayMs);
    }
}
