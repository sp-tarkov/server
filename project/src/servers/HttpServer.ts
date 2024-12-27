import { ApplicationContext } from "@spt/context/ApplicationContext";
import { ContextVariableType } from "@spt/context/ContextVariableType";
import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import type { IHttpConfig } from "@spt/models/spt/config/IHttpConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { WebSocketServer } from "@spt/servers/WebSocketServer";
import type { IHttpListener } from "@spt/servers/http/IHttpListener";
import { LocalisationService } from "@spt/services/LocalisationService";
import { type ErrorLike, type Server, serve } from "bun";
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
        /* create server */
        const httpServer: Server = serve({
            port: this.httpConfig.port,
            fetch: async (req: Request) => {
                return await this.handleRequest(req);
            },
            error: (e: ErrorLike) => {
                let errorMessage: string; /* server is already running or program using privileged port without root */
                if (
                    process.platform === "linux" &&
                    !(process.getuid && process.getuid() === 0) &&
                    this.httpConfig.port < 1024
                ) {
                    errorMessage = this.localisationService.getText("linux_use_priviledged_port_non_root");
                } else {
                    errorMessage = this.localisationService.getText("port_already_in_use", this.httpConfig.port);
                }
                this.logger.error(`${errorMessage} [${e.message}] ${e.stack}`);
                return new Response(errorMessage, { status: 500 });
            },
        });

        this.started = true;

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

    public isStarted(): boolean {
        return this.started;
    }
}
