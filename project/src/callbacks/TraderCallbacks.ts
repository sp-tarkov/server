import { TraderController } from "@spt/controllers/TraderController";
import { OnLoad } from "@spt/di/OnLoad";
import { OnUpdate } from "@spt/di/OnUpdate";
import { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import { ITraderAssort, ITraderBase } from "@spt/models/eft/common/tables/ITrader";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IModdedTraders, ITraderConfig } from "@spt/models/spt/config/ITraderConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class TraderCallbacks implements OnLoad, OnUpdate {
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil, // TODO: delay required
        @inject("TraderController") protected traderController: TraderController,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {}

    public async onLoad(): Promise<void> {
        this.traderController.load();
    }

    public async onUpdate(): Promise<boolean> {
        return this.traderController.update();
    }

    public getRoute(): string {
        return "spt-traders";
    }

    /** Handle client/trading/api/traderSettings */
    public getTraderSettings(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<ITraderBase[]> {
        return this.httpResponse.getBody(this.traderController.getAllTraders(sessionID));
    }

    /** Handle client/trading/api/getTrader */
    public getTrader(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<ITraderBase> {
        const traderID = url.replace("/client/trading/api/getTrader/", "");
        return this.httpResponse.getBody(this.traderController.getTrader(sessionID, traderID));
    }

    /** Handle client/trading/api/getTraderAssort */
    public getAssort(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<ITraderAssort> {
        const traderID = url.replace("/client/trading/api/getTraderAssort/", "");
        return this.httpResponse.getBody(this.traderController.getAssort(sessionID, traderID));
    }

    /** Handle /singleplayer/moddedTraders */
    public getModdedTraderData(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IModdedTraders> {
        const traderConfig = this.configServer.getConfig(ConfigTypes.TRADER) as ITraderConfig;
        return this.httpResponse.noBody(traderConfig.moddedTraders);
    }
}
