import { inject, injectable } from "tsyringe";

import { OnLoad } from "@spt-aki/di/OnLoad";
import { PostAkiModLoader } from "@spt-aki/loaders/PostAkiModLoader";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IHttpConfig } from "@spt-aki/models/spt/config/IHttpConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { HttpFileUtil } from "@spt-aki/utils/HttpFileUtil";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";

@injectable()
class ModCallbacks implements OnLoad
{
    protected httpConfig: IHttpConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("HttpFileUtil") protected httpFileUtil: HttpFileUtil,
        @inject("PostAkiModLoader") protected postAkiModLoader: PostAkiModLoader,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
    }

    public async onLoad(): Promise<void>
    {
        if (globalThis.G_MODS_ENABLED)
        {
            await this.postAkiModLoader.load();
        }
    }

    public getRoute(): string
    {
        return "aki-mods";
    }
}

export {ModCallbacks};
