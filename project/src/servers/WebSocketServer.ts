import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import type { IWebSocketConnectionHandler } from "@spt/servers/ws/IWebSocketConnectionHandler";
import { LocalisationService } from "@spt/services/LocalisationService";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import type { ServerWebSocket } from "bun";
import { inject, injectAll, injectable } from "tsyringe";

@injectable()
export class WebSocketServer {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @injectAll("WebSocketConnectionHandler") protected webSocketConnectionHandlers: IWebSocketConnectionHandler[],
    ) {}

    public wsOnConnection(ws: ServerWebSocket<unknown>, req: string | Buffer): Promise<void> {}
}
