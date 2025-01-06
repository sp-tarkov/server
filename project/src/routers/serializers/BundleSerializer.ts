import { IncomingMessage, ServerResponse } from "node:http";
import { Serializer } from "@spt/di/Serializer";
import { BundleLoader } from "@spt/loaders/BundleLoader";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { HttpFileUtil } from "@spt/utils/HttpFileUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class BundleSerializer extends Serializer {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("BundleLoader") protected bundleLoader: BundleLoader,
        @inject("HttpFileUtil") protected httpFileUtil: HttpFileUtil,
    ) {
        super();
    }

    public override async serialize(
        sessionID: string,
        req: IncomingMessage,
        resp: ServerResponse,
        body: any,
    ): Promise<void> {
        const key = decodeURI(req.url.split("/bundle/")[1]);
        const bundle = this.bundleLoader.getBundle(key);
        if (!bundle) {
            return;
        }

        this.logger.info(`[BUNDLE]: ${req.url}`);
        if (!bundle.modpath) {
            this.logger.error(`Mod: ${key} lacks a modPath property, skipped loading`);

            return;
        }

        await this.httpFileUtil.sendFileAsync(resp, `${bundle.modpath}/bundles/${bundle.filename}`);
    }

    public override canHandle(route: string): boolean {
        return route === "BUNDLE";
    }
}
