import { Program } from "@spt/Program";
import { OnLoad } from "@spt/di/OnLoad";
import { PostSptModLoader } from "@spt/loaders/PostSptModLoader";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IHttpConfig } from "@spt/models/spt/config/IHttpConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HttpFileUtil } from "@spt/utils/HttpFileUtil";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class ModCallbacks implements OnLoad {
    protected httpConfig: IHttpConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("HttpFileUtil") protected httpFileUtil: HttpFileUtil,
        @inject("PostSptModLoader") protected postSptModLoader: PostSptModLoader,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
    }

    public async onLoad(): Promise<void> {
        if (Program.MODS) {
            await this.postSptModLoader.load();
        }
    }

    public getRoute(): string {
        return "spt-mods";
    }
}
