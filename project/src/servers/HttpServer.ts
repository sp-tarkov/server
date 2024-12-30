import http, { IncomingMessage, ServerResponse, Server } from "node:http";
import { ApplicationContext } from "@spt/context/ApplicationContext";
import { ContextVariableType } from "@spt/context/ContextVariableType";
import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IHttpConfig } from "@spt/models/spt/config/IHttpConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { WebSocketServer } from "@spt/servers/WebSocketServer";
import { IHttpListener } from "@spt/servers/http/IHttpListener";
import { LocalisationService } from "@spt/services/LocalisationService";
import { inject, injectAll, injectable } from "tsyringe";

@injectable()
export class HttpServer {
    protected httpConfig: IHttpConfig;
    protected started = false;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @injectAll("HttpListener") protected httpListeners: IHttpListener[],
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("WebSocketServer") protected webSocketServer: WebSocketServer,
    ) {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
    }

    /**
     * Handle server loading event
     */
    public load(): void {
        this.started = false;

        /* create server */
        const httpServer: Server = http.createServer();

        httpServer.on("request", async (req, res) => {
            await this.handleRequest(req, res);
        });

        /* Config server to listen on a port */
        httpServer.listen(this.httpConfig.port, this.httpConfig.ip, () => {
            this.started = true;
            this.logger.success(
                this.localisationService.getText("started_webserver_success", this.httpServerHelper.getBackendUrl()),
            );
        });

        httpServer.on("error", (e: any) => {
            /* server is already running or program using privileged port without root */
            if (process.platform === "linux" && !(process.getuid && process.getuid() === 0) && e.port < 1024) {
                this.logger.error(this.localisationService.getText("linux_use_priviledged_port_non_root"));
            } else {
                const message = this.localisationService.getText("port_already_in_use", e.port);
                this.logger.error(`${message} [${e.message}]`);
            }
        });

        // Setting up websocket
        this.webSocketServer.setupWebSocket(httpServer);
    }

    protected async handleRequest(req: IncomingMessage, resp: ServerResponse): Promise<void> {
        // Pull sessionId out of cookies and store inside app context
        const sessionId = this.getCookies(req).PHPSESSID;
        this.applicationContext.addValue(ContextVariableType.SESSION_ID, sessionId);

        // Extract headers for original IP detection
        const realIp = req.headers["x-real-ip"] as string;
        const forwardedFor = req.headers["x-forwarded-for"] as string;
        const clientIp = realIp || (forwardedFor ? forwardedFor.split(",")[0].trim() : req.socket.remoteAddress);

        if (this.httpConfig.logRequests) {
            const isLocalRequest = this.isLocalRequest(clientIp);
            if (typeof isLocalRequest !== "undefined") {
                if (isLocalRequest) {
                    this.logger.info(this.localisationService.getText("client_request", req.url));
                } else {
                    this.logger.info(
                        this.localisationService.getText("client_request_ip", {
                            ip: clientIp,
                            url: req.url.replaceAll("/", "\\"), // Localisation service escapes `/` into hex code `&#x2f;`
                        }),
                    );
                }
            }
        }

        for (const listener of this.httpListeners) {
            if (listener.canHandle(sessionId, req)) {
                await listener.handle(sessionId, req, resp);
                break;
            }
        }
    }

    /**
     * Check against hardcoded values that determine its from a local address
     * @param remoteAddress Address to check
     * @returns True if its local
     */
    protected isLocalRequest(remoteAddress: string | undefined): boolean | undefined {
        if (!remoteAddress) {
            return undefined;
        }

        return (
            remoteAddress.startsWith("127.0.0") ||
            remoteAddress.startsWith("192.168.") ||
            remoteAddress.startsWith("localhost")
        );
    }

    protected getCookies(req: IncomingMessage): Record<string, string> {
        const found: Record<string, string> = {};
        const cookies = req.headers.cookie;

        if (cookies) {
            for (const cookie of cookies.split(";")) {
                const parts = cookie.split("=");

                found[parts.shift().trim()] = decodeURI(parts.join("="));
            }
        }

        return found;
    }

    public isStarted(): boolean {
        return this.started;
    }
}
