import type { ImageRouteService } from "@spt/services/mod/image/ImageRouteService";
import { VFS } from "@spt/utils/VFS";
import { inject, injectable } from "tsyringe";
import type { HttpServerHelper } from "../helpers/HttpServerHelper";

@injectable()
export class ImageRouter {
    constructor(
        @inject("VFS") protected vfs: VFS,
        @inject("ImageRouteService") protected imageRouteService: ImageRouteService,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
    ) {}

    public addRoute(key: string, valueToAdd: string): void {
        this.imageRouteService.addRoute(key, valueToAdd);
    }

    public async sendImage(sessionID: string, req: Request, body: any): Promise<Response> {
        // remove file extension
        const url = this.vfs.stripExtension(new URL(req.url).pathname);

        // send image
        if (this.imageRouteService.existsByKey(url)) {
            return await this.httpServerHelper.sendFileAsync(this.imageRouteService.getByKey(url));
        }
    }

    public getImage(): string {
        return "IMAGE";
    }
}
