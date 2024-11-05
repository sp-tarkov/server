import { BundleLoader } from "@spt/loaders/BundleLoader";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IHttpConfig } from "@spt/models/spt/config/IHttpConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class BundleCallbacks {
    protected httpConfig: IHttpConfig;

    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("BundleLoader") protected bundleLoader: BundleLoader,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
    }

    /**
     * Handle singleplayer/bundles
     */
    public getBundles(url: string, info: any, sessionID: string): string {
        return this.httpResponse.noBody(this.bundleLoader.getBundles());
    }

    public getBundle(url: string, info: any, sessionID: string): string {
        return "BUNDLE";
    }
}
