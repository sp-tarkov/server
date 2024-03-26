import http, { IncomingMessage, ServerResponse, Server } from "node:http";
import { inject, injectAll, injectable } from "tsyringe";

import { ApplicationContext } from "@spt-aki/context/ApplicationContext";
import { ContextVariableType } from "@spt-aki/context/ContextVariableType";
import { HttpServerHelper } from "@spt-aki/helpers/HttpServerHelper";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IHttpConfig } from "@spt-aki/models/spt/config/IHttpConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { WebSocketServer } from "@spt-aki/servers/WebSocketServer";
import { IHttpListener } from "@spt-aki/servers/http/IHttpListener";
import { LocalisationService } from "@spt-aki/services/LocalisationService";

@injectable()
export class HttpServer
{
    protected httpConfig: IHttpConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @injectAll("HttpListener") protected httpListeners: IHttpListener[],
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("WebSocketServer") protected webSocketServer: WebSocketServer,
    )
    {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
    }

    /**
     * Handle server loading event
     */
    public load(): void
    {
        /* create server */
        const httpServer: Server = http.createServer();

        httpServer.on("request", (req, res) =>
        {
            this.handleRequest(req, res);
        });

        this.databaseServer.getTables().server.ip = this.httpConfig.ip;
        this.databaseServer.getTables().server.port = this.httpConfig.port;

        /* Config server to listen on a port */
        httpServer.listen(this.httpConfig.port, this.httpConfig.ip, () =>
        {
            this.logger.success(
                this.localisationService.getText("started_webserver_success", this.httpServerHelper.getBackendUrl()),
            );
        });

        httpServer.on("error", (e: any) =>
        {
            /* server is already running or program using privileged port without root */
            if (process.platform === "linux" && !(process.getuid && process.getuid() === 0) && e.port < 1024)
            {
                this.logger.error(this.localisationService.getText("linux_use_priviledged_port_non_root"));
            }
            else
            {
                this.logger.error(this.localisationService.getText("port_already_in_use", e.port));
            }
        });

        // Setting up websocket
        this.webSocketServer.setupWebSocket(httpServer);
    }

    protected handleRequest(req: IncomingMessage, resp: ServerResponse): void
    {
        // Pull sessionId out of cookies and store inside app context
        const sessionId = this.getCookies(req).PHPSESSID;
        this.applicationContext.addValue(ContextVariableType.SESSION_ID, sessionId);

        if (this.httpConfig.logRequests)
        {
            // TODO: Extend to include 192.168 / 10.10 ranges or check subnet
            const isLocalRequest = req.socket.remoteAddress.startsWith("127.0.0");
            if (isLocalRequest)
            {
                this.logger.info(this.localisationService.getText("client_request", req.url));
            }
            else
            {
                this.logger.info(this.localisationService.getText("client_request_ip", {
                    ip: req.socket.remoteAddress,
                    url: req.url.replaceAll("/", "\\"), // Localisation service escapes `/` into hex code `&#x2f;`
                }));
            }
        }

        for (const listener of this.httpListeners)
        {
            if (listener.canHandle(sessionId, req))
            {
                listener.handle(sessionId, req, resp);
                break;
            }
        }
    }

    protected getCookies(req: IncomingMessage): Record<string, string>
    {
        const found: Record<string, string> = {};
        const cookies = req.headers.cookie;

        if (cookies)
        {
            for (const cookie of cookies.split(";"))
            {
                const parts = cookie.split("=");

                found[parts.shift().trim()] = decodeURI(parts.join("="));
            }
        }

        return found;
    }
}
