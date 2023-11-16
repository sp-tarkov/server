import { IncomingMessage, ServerResponse } from "node:http";

import { IHttpListener } from "@spt-aki/servers/http/IHttpListener";

export class HttpListenerMod implements IHttpListener
{
    public constructor(
        private canHandleOverride: (sessionId: string, req: IncomingMessage) => boolean,
        private handleOverride: (sessionId: string, req: IncomingMessage, resp: ServerResponse) => void,
    )
    {
    }

    public canHandle(sessionId: string, req: IncomingMessage): boolean
    {
        return this.canHandleOverride(sessionId, req);
    }

    public handle(sessionId: string, req: IncomingMessage, resp: ServerResponse): void
    {
        this.handleOverride(sessionId, req, resp);
    }
}
