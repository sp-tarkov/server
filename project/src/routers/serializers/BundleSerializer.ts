import { IncomingMessage, ServerResponse } from "node:http";
import { inject, injectable } from "tsyringe";
import { Serializer } from "@spt/di/Serializer";
import { BundleLoader } from "@spt/loaders/BundleLoader";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { HttpFileUtil } from "@spt/utils/HttpFileUtil";

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
        const key = decodeURI(req.url.split("/bundle/")[1]);
        const bundle = this.bundleLoader.getBundle(key);
        if (!bundle)
        {
            return;
        }

        this.logger.info(`[BUNDLE]: ${req.url}`);

        this.httpFileUtil.sendFile(resp, `${bundle.modpath}/bundles/${bundle.filename}`);
    }

    public override canHandle(route: string): boolean
    {
        return route === "BUNDLE";
    }
}
