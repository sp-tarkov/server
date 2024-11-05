import { OnLoad } from "@spt/di/OnLoad";
import { HttpServer } from "@spt/servers/HttpServer";
import { inject, injectable } from "tsyringe";

@injectable()
export class HttpCallbacks implements OnLoad {
    constructor(@inject("HttpServer") protected httpServer: HttpServer) {}

    public async onLoad(): Promise<void> {
        this.httpServer.load();
    }

    public getRoute(): string {
        return "spt-http";
    }

    public getImage(): string {
        return "";
    }
}
