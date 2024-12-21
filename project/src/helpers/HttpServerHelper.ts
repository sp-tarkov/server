import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import type { IHttpConfig } from "@spt/models/spt/config/IHttpConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { inject, injectable } from "tsyringe";

@injectable()
export class HttpServerHelper {
    protected httpConfig: IHttpConfig;

    protected mime = {
        css: "text/css",
        bin: "application/octet-stream",
        html: "text/html",
        jpg: "image/jpeg",
        js: "text/javascript",
        json: "application/json",
        png: "image/png",
        svg: "image/svg+xml",
        txt: "text/plain",
    };

    constructor(@inject("ConfigServer") protected configServer: ConfigServer) {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
    }

    public getMimeText(key: string): string {
        return this.mime[key];
    }

    /**
     * Combine ip and port into address
     * @returns url
     */
    public buildUrl(): string {
        return `${this.httpConfig.backendIp}:${this.httpConfig.backendPort}`;
    }

    /**
     * Prepend http to the url:port
     * @returns URI
     */
    public getBackendUrl(): string {
        return `http://${this.buildUrl()}`;
    }

    /** Get websocket url + port */
    public getWebsocketUrl(): string {
        return `ws://${this.buildUrl()}`;
    }

    public sendTextJson(resp: any, output: any): void {
        resp.writeHead(200, "OK", { "Content-Type": this.mime.json });
        resp.end(output);
    }
}
