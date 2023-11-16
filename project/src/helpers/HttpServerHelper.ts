import { inject, injectable } from "tsyringe";

import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IHttpConfig } from "@spt-aki/models/spt/config/IHttpConfig";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";

@injectable()
export class HttpServerHelper
{
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

    constructor(@inject("ConfigServer") protected configServer: ConfigServer)
    {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
    }

    public getMimeText(key: string): string
    {
        return this.mime[key];
    }

    /**
     * Combine ip and port into url
     * @returns url
     */
    public buildUrl(): string
    {
        return `${this.httpConfig.ip}:${this.httpConfig.port}`;
    }

    /**
     * Prepend http to the url:port
     * @returns URI
     */
    public getBackendUrl(): string
    {
        return `http://${this.buildUrl()}`;
    }

    /** Get websocket url + port */
    public getWebsocketUrl(): string
    {
        return `ws://${this.buildUrl()}`;
    }

    public sendTextJson(resp: any, output: any): void
    {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        resp.writeHead(200, "OK", { "Content-Type": this.mime.json });
        resp.end(output);
    }
}
