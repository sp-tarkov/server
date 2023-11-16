import { IncomingMessage, ServerResponse } from "node:http";
import { DependencyContainer, injectable } from "tsyringe";

import { IHttpListener } from "@spt-aki/servers/http/IHttpListener";
import { HttpListenerMod } from "@spt-aki/services/mod/httpListener/HttpListenerMod";

@injectable()
export class HttpListenerModService
{
    constructor(protected container: DependencyContainer)
    {}

    public registerHttpListener(
        name: string,
        canHandleOverride: (sessionId: string, req: IncomingMessage) => boolean,
        handleOverride: (sessionId: string, req: IncomingMessage, resp: ServerResponse) => void,
    ): void
    {
        this.container.register<IHttpListener>(name, {
            useValue: new HttpListenerMod(canHandleOverride, handleOverride),
        });
        this.container.registerType("HttpListener", name);
    }
}
