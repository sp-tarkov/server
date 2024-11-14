import { IncomingMessage, ServerResponse } from "node:http";
import { Serializer } from "@spt/di/Serializer";
import { ImageRouter } from "@spt/routers/ImageRouter";
import { inject, injectable } from "tsyringe";

@injectable()
export class ImageSerializer extends Serializer {
    constructor(@inject("ImageRouter") protected imageRouter: ImageRouter) {
        super();
    }

    public override async serialize(sessionID: string, req: IncomingMessage, resp: ServerResponse, body: any): Promise<void> {
        await this.imageRouter.sendImage(sessionID, req, resp, body);
    }

    public override canHandle(route: string): boolean {
        return route === "IMAGE";
    }
}
