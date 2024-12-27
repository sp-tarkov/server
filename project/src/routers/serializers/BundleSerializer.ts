import type { HttpServerHelper } from "@project/src/helpers/HttpServerHelper";
import { Serializer } from "@spt/di/Serializer";
import { BundleLoader } from "@spt/loaders/BundleLoader";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { inject, injectable } from "tsyringe";

@injectable()
export class BundleSerializer extends Serializer {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("BundleLoader") protected bundleLoader: BundleLoader,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
    ) {
        super();
    }

    public override async serialize(sessionID: string, req: Request, body: any): Promise<Response> {
        const key = decodeURI(new URL(req.url).pathname.split("/bundle/")[1]);
        const bundle = this.bundleLoader.getBundle(key);
        if (!bundle) {
            //Todo: Return error
        }

        this.logger.info(`[BUNDLE]: ${req.url}`);
        if (!bundle.modpath) {
            this.logger.error(`Mod: ${key} lacks a modPath property, skipped loading`);

            //Todo: Return error
        }

        return await this.httpServerHelper.sendFileAsync(`${bundle.modpath}/bundles/${bundle.filename}`);
    }

    public override canHandle(route: string): boolean {
        return route === "BUNDLE";
    }
}
