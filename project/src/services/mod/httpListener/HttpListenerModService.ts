import { IncomingMessage, ServerResponse } from "node:http";
import { IHttpListener } from "@spt/servers/http/IHttpListener";
import { HttpListenerMod } from "@spt/services/mod/httpListener/HttpListenerMod";
import { type DependencyContainer, injectable } from "tsyringe";

@injectable()
export class HttpListenerModService {
    constructor(protected container: DependencyContainer) {}

    public registerHttpListener(
        name: string,
        canHandleOverride: (sessionId: string, req: IncomingMessage) => boolean,
        handleOverride: (sessionId: string, req: IncomingMessage, resp: ServerResponse) => void,
    ): void {
        this.container.register<IHttpListener>(name, {
            useValue: new HttpListenerMod(canHandleOverride, handleOverride),
        });
        this.container.registerType("HttpListener", name);
    }
}
