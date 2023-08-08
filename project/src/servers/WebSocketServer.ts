import http, { IncomingMessage } from "http";
import { inject, injectable } from "tsyringe";
import WebSocket from "ws";

import { HttpServerHelper } from "../helpers/HttpServerHelper";
import { INotification, NotificationType } from "../models/eft/notifier/INotifier";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { IHttpConfig } from "../models/spt/config/IHttpConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { LocalisationService } from "../services/LocalisationService";
import { JsonUtil } from "../utils/JsonUtil";
import { RandomUtil } from "../utils/RandomUtil";
import { ConfigServer } from "./ConfigServer";

@injectable()
export class WebSocketServer 
{

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper
    ) 
    {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
    }

    protected httpConfig: IHttpConfig;
    protected defaultNotification: INotification = {
        type: NotificationType.PING,
        eventId: "ping"
    };

    protected webSockets: Record<string, WebSocket.WebSocket> = {};
    protected websocketPingHandler = null;

    public setupWebSocket(httpServer: http.Server): void 
    {
        const webSocketServer = new WebSocket.Server({
            "server": httpServer
        });

        webSocketServer.addListener("listening", () => 
        {
            this.logger.success(this.localisationService.getText("websocket-started", this.httpServerHelper.getWebsocketUrl()));
            this.logger.success(`${this.localisationService.getText("server_running")} ${this.getRandomisedMessage()}!`);
        });

        webSocketServer.addListener("connection", this.wsOnConnection.bind(this));
    }

    public sendMessage(sessionID: string, output: INotification): void
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
            const messages = [
                this.localisationService.getText("server_start_meme_1"),
                this.localisationService.getText("server_start_meme_2"),
                this.localisationService.getText("server_start_meme_3"),
                this.localisationService.getText("server_start_meme_4"),
                this.localisationService.getText("server_start_meme_5"),
                this.localisationService.getText("server_start_meme_6"),
                this.localisationService.getText("server_start_meme_7"),
                this.localisationService.getText("server_start_meme_8"),
                this.localisationService.getText("server_start_meme_9"),
                this.localisationService.getText("server_start_meme_10"),
                this.localisationService.getText("server_start_meme_11"),
                this.localisationService.getText("server_start_meme_12"),
                this.localisationService.getText("server_start_meme_13"),
                this.localisationService.getText("server_start_meme_14"),
                this.localisationService.getText("server_start_meme_15"),
                this.localisationService.getText("server_start_meme_16"),
                this.localisationService.getText("server_start_meme_17"),
                this.localisationService.getText("server_start_meme_18"),
                this.localisationService.getText("server_start_meme_19"),
                this.localisationService.getText("server_start_meme_20"),
                this.localisationService.getText("server_start_meme_21"),
                this.localisationService.getText("server_start_meme_22"),
                this.localisationService.getText("server_start_meme_23"),
                this.localisationService.getText("server_start_meme_24")
            ];
            return messages[this.randomUtil.getInt(0, messages.length - 1)];
        }

        return (globalThis.G_RELEASE_CONFIGURATION)
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

        this.logger.info(this.localisationService.getText("websocket-player_connected", sessionID));

        const logger = this.logger;
        const msgToLog = this.localisationService.getText("websocket-received_message", sessionID);
        ws.on("message", function message(msg) 
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