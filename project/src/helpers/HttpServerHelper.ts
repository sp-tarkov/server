import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import type { IHttpConfig } from "@spt/models/spt/config/IHttpConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { inject, injectable } from "tsyringe";

@injectable()
export class HttpServerHelper {
    protected httpConfig: IHttpConfig;

    protected mime: Record<string, string> = {
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

    public sendJson(output: string, sessionID?: string): Response {
        const headers: HeadersInit = {
            "Content-Type": "application/json",
        };

        if (sessionID) {
            headers["Set-Cookie"] = `PHPSESSID=${sessionID}`;
        }

        return new Response(output, {
            status: 200,
            statusText: "OK",
            headers,
        });
    }

    public async sendZlibJson(output: string, sessionID: string): Promise<Response> {
        return new Response(Bun.deflateSync(output), {
            status: 200,
        });
    }

    public async sendFileAsync(filePath: string): Promise<Response> {
        const pathSlice = filePath.split("/");
        const fileExtension = pathSlice[pathSlice.length - 1].split(".").at(-1);
        const type = this.getMimeText(fileExtension ?? "") || this.getMimeText("txt");

        // Read the file as a buffer and create a response
        const response = new Response(Bun.file(filePath), {
            headers: {
                "Content-Type": type,
            },
        });

        return response;
    }
}
