import fs from "node:fs";
import { ServerResponse } from "node:http";
import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import { inject, injectable } from "tsyringe";

@injectable()
export class HttpFileUtil {
    constructor(@inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper) {}

    public sendFile(resp: ServerResponse, filePath: string): void {
        const pathSlic = filePath.split("/");
        const type =
            this.httpServerHelper.getMimeText(pathSlic[pathSlic.length - 1].split(".").at(-1) ?? "") ||
            this.httpServerHelper.getMimeText("txt");
        const fileStream = fs.createReadStream(filePath);

        fileStream.on("open", () => {
            resp.setHeader("Content-Type", type);
            fileStream.pipe(resp);
        });
    }
}
