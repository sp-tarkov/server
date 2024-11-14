import fs from "node:fs";
import { ServerResponse } from "node:http";
import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import { inject, injectable } from "tsyringe";
import { pipeline } from 'stream/promises';

@injectable()
export class HttpFileUtil {
    constructor(@inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper) {}

    public async sendFileAsync(resp: ServerResponse, filePath: string): Promise<void> {
        const pathSlice = filePath.split("/");
        const type =
            this.httpServerHelper.getMimeText(pathSlice[pathSlice.length - 1].split(".").at(-1) ?? "") ||
            this.httpServerHelper.getMimeText("txt");

        resp.setHeader("Content-Type", type);

        await pipeline(fs.createReadStream(filePath), resp);
    }
}
