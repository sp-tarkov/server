import fs from "node:fs";
import { ServerResponse } from "node:http";
import { inject, injectable } from "tsyringe";

import { HttpServerHelper } from "@spt-aki/helpers/HttpServerHelper";

@injectable()
export class HttpFileUtil
{
    constructor(@inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper)
    {
    }

    public sendFile(resp: ServerResponse, file: any): void
    {
        const pathSlic = file.split("/");
        const type = this.httpServerHelper.getMimeText(pathSlic[pathSlic.length - 1].split(".").at(-1))
            || this.httpServerHelper.getMimeText("txt");
        const fileStream = fs.createReadStream(file);

        fileStream.on("open", () =>
        {
            resp.setHeader("Content-Type", type);
            fileStream.pipe(resp);
        });
    }
}
