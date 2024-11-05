import { ClientLogController } from "@spt/controllers/ClientLogController";
import { ModLoadOrder } from "@spt/loaders/ModLoadOrder";
import { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IBsgLogging, ICoreConfig, IRelease } from "@spt/models/spt/config/ICoreConfig";
import { IClientLogRequest } from "@spt/models/spt/logging/IClientLogRequest";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

/** Handle client logging related events */
@injectable()
export class ClientLogCallbacks {
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("ClientLogController") protected clientLogController: ClientLogController,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ModLoadOrder") protected modLoadOrder: ModLoadOrder,
    ) {}

    /**
     * Handle /singleplayer/log
     */
    public clientLog(url: string, info: IClientLogRequest, sessionID: string): INullResponseData {
        this.clientLogController.clientLog(info);
        return this.httpResponse.nullResponse();
    }

    /**
     * Handle /singleplayer/release
     */
    public releaseNotes(): string {
        const data: IRelease = this.configServer.getConfig<ICoreConfig>(ConfigTypes.CORE).release;

        data.betaDisclaimerText = globalThis.G_MODS_ENABLED
            ? this.localisationService.getText("release-beta-disclaimer-mods-enabled")
            : this.localisationService.getText("release-beta-disclaimer");

        data.betaDisclaimerAcceptText = this.localisationService.getText("release-beta-disclaimer-accept");
        data.serverModsLoadedText = this.localisationService.getText("release-server-mods-loaded");
        data.serverModsLoadedDebugText = this.localisationService.getText("release-server-mods-debug-message");
        data.clientModsLoadedText = this.localisationService.getText("release-plugins-loaded");
        data.clientModsLoadedDebugText = this.localisationService.getText("release-plugins-loaded-debug-message");
        data.illegalPluginsLoadedText = this.localisationService.getText("release-illegal-plugins-loaded");
        data.illegalPluginsExceptionText = this.localisationService.getText("release-illegal-plugins-exception");
        data.releaseSummaryText = this.localisationService.getText("release-summary");

        data.isBeta = globalThis.G_WATERMARK_ENABLED;
        data.isModdable = globalThis.G_MODS_ENABLED;
        data.isModded = this.modLoadOrder.getLoadOrder().length > 0;

        return this.httpResponse.noBody(data);
    }

    /**
     * Handle /singleplayer/enableBSGlogging
     */

    public bsgLogging(): string {
        const data: IBsgLogging = this.configServer.getConfig<ICoreConfig>(ConfigTypes.CORE).bsgLogging;
        return this.httpResponse.noBody(data);
    }
}
