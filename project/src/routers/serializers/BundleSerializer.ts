import { IncomingMessage, ServerResponse } from "node:http";
import { inject, injectable } from "tsyringe";

import { Serializer } from "@spt-aki/di/Serializer";
import { BundleLoader } from "@spt-aki/loaders/BundleLoader";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { HttpFileUtil } from "@spt-aki/utils/HttpFileUtil";

@injectable()
export class BundleSerializer extends Serializer
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("BundleLoader") protected bundleLoader: BundleLoader,
        @inject("HttpFileUtil") protected httpFileUtil: HttpFileUtil,
    )
    {
        super();
    }

    public override serialize(sessionID: string, req: IncomingMessage, resp: ServerResponse, body: any): void
    {
        this.logger.info(`[BUNDLE]: ${req.url}`);

        const key = req.url.split("/bundle/")[1];
        const bundle = this.bundleLoader.getBundle(key);

        this.httpFileUtil.sendFile(resp, `${bundle.modpath}/bundles/${bundle.filename}`);
    }

    public override canHandle(route: string): boolean
    {
        return route === "BUNDLE";
    }
}
