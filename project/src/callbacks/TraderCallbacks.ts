import { inject, injectable } from "tsyringe";

import { TraderController } from "@spt-aki/controllers/TraderController";
import { OnLoad } from "@spt-aki/di/OnLoad";
import { OnUpdate } from "@spt-aki/di/OnUpdate";
import { IEmptyRequestData } from "@spt-aki/models/eft/common/IEmptyRequestData";
import { ITraderAssort, ITraderBase } from "@spt-aki/models/eft/common/tables/ITrader";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";

@injectable()
export class TraderCallbacks implements OnLoad, OnUpdate
{
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("TraderController") protected traderController: TraderController) // TODO: delay required
    {
    }
    public async onLoad(): Promise<void>
    {
        this.traderController.load();
    }

    public async onUpdate(): Promise<boolean>
    {
        return this.traderController.update();
    }

    public getRoute(): string 
    {
        return "aki-traders";
    }

    /** Handle client/trading/api/traderSettings */
    public getTraderSettings(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<ITraderBase[]>
    {
        return this.httpResponse.getBody(this.traderController.getAllTraders(sessionID));
    }

    /** Handle client/trading/api/getTrader */
    public getTrader(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<ITraderBase>
    {
        const traderID = url.replace("/client/trading/api/getTrader/", "");
        return this.httpResponse.getBody(this.traderController.getTrader(sessionID, traderID));
    }

    /** Handle client/trading/api/getTraderAssort */
    public getAssort(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<ITraderAssort>
    {
        const traderID = url.replace("/client/trading/api/getTraderAssort/", "");
        return this.httpResponse.getBody(this.traderController.getAssort(sessionID, traderID));
    }
}