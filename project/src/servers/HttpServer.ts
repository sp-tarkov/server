import { ApplicationContext } from "@spt/context/ApplicationContext";
import { ContextVariableType } from "@spt/context/ContextVariableType";
import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import type { IHttpConfig } from "@spt/models/spt/config/IHttpConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import type { IHttpListener } from "@spt/servers/http/IHttpListener";
import { LocalisationService } from "@spt/services/LocalisationService";
import { type ErrorLike, type Server, serve } from "bun";
import { inject, injectAll, injectable } from "tsyringe";
import type { JsonUtil } from "../utils/JsonUtil";
import type { RandomUtil } from "../utils/RandomUtil";
import type { IWebSocketConnectionHandler } from "./ws/IWebSocketConnectionHandler";
import type { SPTWebsocketData } from "./ws/SPTWebsocketData";

@injectable()
export class HttpServer {
    protected Server: Server;
    protected httpConfig: IHttpConfig;
    protected started = false;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @injectAll("HttpListener") protected httpListeners: IHttpListener[],
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @injectAll("WebSocketConnectionHandler") protected webSocketConnectionHandlers: IWebSocketConnectionHandler[],
    ) {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
    }

    /**
     * Handle server loading event
     */
    public load(): void {
        /* create server */
        this.Server = serve({
            port: this.httpConfig.port,
            fetch: async (req: Request) => {
                /* Handle WebSocket upgrades */
                if (
                    this.Server.upgrade(req, {
                        data: new SPTWebsocketData(req.headers, new URL(req.url.replace("http://", "ws://"))),
                    })
                ) {
                    return;
                }

                return await this.handleRequest(req);
            },

            error: (e: ErrorLike) => {
                let errorMessage: string; /* server is already running or program using privileged port without root */
                if (
                    process.platform === "linux" &&
                    !(process.getuid && process.getuid() === 0) &&
                    this.Server.port < 1024
                ) {
                    errorMessage = this.localisationService.getText("linux_use_priviledged_port_non_root");
                } else {
                    errorMessage = this.localisationService.getText("port_already_in_use", this.Server.port);
                }
                this.logger.error(`${errorMessage} [${e.message}] ${e.stack}`);
                return new Response(errorMessage, { status: 500 });
            },
            websocket: {
                message: async (ws, sentData) => {
                    const req: SPTWebsocketData = ws.data as SPTWebsocketData;
                    this.logger.error(req.url.host);

                    const socketHandlers = this.webSocketConnectionHandlers.filter((wsh) =>
                        req.url.pathname.includes(wsh.getHookUrl()),
                    );
                    if ((socketHandlers?.length ?? 0) === 0) {
                        const message = `Socket connection received for url ${req.url.pathname}, but there is no websocket handler configured for it`;
                        this.logger.warning(message);
                        ws.send(this.jsonUtil.serialize({ error: message }));
                        ws.close();
                        return;
                    }
                    socketHandlers.forEach((wsh) => {
                        this.logger.info(`WebSocketHandler "${wsh.getSocketId()}" connected`);
                        await wsh.onConnection(ws, req);
                    });
                },
            },
        });

        if (this.Server) {
            this.started = true;

            this.logger.success(
                this.localisationService.getText("websocket-started", this.httpServerHelper.getWebsocketUrl()),
            );
            this.logger.success(
                `${this.localisationService.getText("server_running")}, ${this.getRandomisedStartMessage()}!`,
            );
        }

        // Setting up websocket
        //this.webSocketServer.setupWebSocket(httpServer);
    }

    protected async handleRequest(req: Request): Promise<Response> {
        // Pull sessionId out of cookies and store inside app context
        const sessionId = this.getCookies(req).PHPSESSID;
        const path = new URL(req.url).pathname;
        this.applicationContext.addValue(ContextVariableType.SESSION_ID, sessionId);

        // Extract headers for original IP detection
        const realIp = req.headers.get("x-real-ip") as string;
        const forwardedFor = req.headers.get("x-forwarded-for") as string;
        const clientIp =
            realIp || ((forwardedFor ? forwardedFor.split(",")[0].trim() : req.headers.get("remote-addr")) as string);

        this.logger.info(this.localisationService.getText("client_request", path));
        if (this.httpConfig.logRequests) {
            const isLocalRequest = this.isLocalRequest(clientIp);
            if (typeof isLocalRequest !== "undefined") {
                if (isLocalRequest) {
                    this.logger.info(this.localisationService.getText("client_request", path));
                } else {
                    this.logger.info(
                        this.localisationService.getText("client_request_ip", {
                            ip: clientIp,
                            url: path.replaceAll("/", "\\"), // Localisation service escapes `/` into hex code `&#x2f;`
                        }),
                    );
                }
            }
        }

        for (const listener of this.httpListeners) {
            if (listener.canHandle(sessionId, req)) {
                return await listener.handle(sessionId, req);
            }
        }
    }

    /**
     * Check against hardcoded values that determine its from a local address
     * @param remoteAddress Address to check
     * @returns True if its local
     */
    protected isLocalRequest(remoteAddress: string): boolean | undefined {
        if (!remoteAddress) {
            return undefined;
        }

        return (
            remoteAddress.startsWith("127.0.0") ||
            remoteAddress.startsWith("192.168.") ||
            remoteAddress.startsWith("localhost")
        );
    }

    protected getCookies(req: Request): Record<string, string> {
        const found: Record<string, string> = {};
        const cookies = req.headers.get("cookie");

        if (cookies) {
            for (const cookie of cookies.split(";")) {
                const parts = cookie.split("=");

                found[parts.shift().trim()] = decodeURI(parts.join("="));
            }
        }

        return found;
    }

    protected getRandomisedStartMessage(): string {
        if (this.randomUtil.getInt(1, 1000) > 999) {
            return this.localisationService.getRandomTextThatMatchesPartialKey("server_start_meme_");
        }

        return globalThis.G_RELEASE_CONFIGURATION
            ? `${this.localisationService.getText("server_start_success")}!`
            : this.localisationService.getText("server_start_success");
    }

    public isStarted(): boolean {
        return this.started;
    }
}
