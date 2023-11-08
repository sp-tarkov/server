import { IncomingMessage, ServerResponse } from "node:http";
import { inject, injectable } from "tsyringe";

import { ImageRouteService } from "@spt-aki/services/mod/image/ImageRouteService";
import { HttpFileUtil } from "@spt-aki/utils/HttpFileUtil";
import { VFS } from "@spt-aki/utils/VFS";

@injectable()
export class ImageRouter {
    constructor(
        @inject("VFS") protected vfs: VFS,
        @inject("ImageRouteService") protected imageRouteService: ImageRouteService,
        @inject("HttpFileUtil") protected httpFileUtil: HttpFileUtil
    ) {}

    public addRoute(key: string, valueToAdd: string): void {
        this.imageRouteService.addRoute(key, valueToAdd);
    }

    public sendImage(sessionID: string, req: IncomingMessage, resp: ServerResponse, body: any): void {
        // remove file extension
        const url = this.vfs.stripExtension(req.url);

        // send image
        if (this.imageRouteService.existsByKey(url)) {
            this.httpFileUtil.sendFile(resp, this.imageRouteService.getByKey(url));
        }
    }

    public getImage(): string {
        return "IMAGE";
    }
}
