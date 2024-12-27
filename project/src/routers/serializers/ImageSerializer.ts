import { Serializer } from "@spt/di/Serializer";
import type { ImageRouter } from "@spt/routers/ImageRouter";
import { inject, injectable } from "tsyringe";

@injectable()
export class ImageSerializer extends Serializer {
    constructor(@inject("ImageRouter") protected imageRouter: ImageRouter) {
        super();
    }

    public override async serialize(sessionID: string, req: Request, body: any): Promise<Response> {
        return await this.imageRouter.sendImage(sessionID, req, body);
    }

    public override canHandle(route: string): boolean {
        return route === "IMAGE";
    }
}
