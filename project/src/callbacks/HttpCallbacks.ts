import { inject, injectable } from "tsyringe";

import { OnLoad } from "@spt-aki/di/OnLoad";
import { HttpServer } from "@spt-aki/servers/HttpServer";

@injectable()
export class HttpCallbacks implements OnLoad
{
    constructor(@inject("HttpServer") protected httpServer: HttpServer)
    {
    }

    public async onLoad(): Promise<void>
    {
        this.httpServer.load();
    }

    public getRoute(): string
    {
        return "aki-http";
    }

    public getImage(): string
    {
        return "";
    }
}
