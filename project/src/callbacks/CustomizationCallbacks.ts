import { CustomizationController } from "@spt/controllers/CustomizationController";
import { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { ISuit } from "@spt/models/eft/common/tables/ITrader";
import { IBuyClothingRequestData } from "@spt/models/eft/customization/IBuyClothingRequestData";
import { IGetSuitsResponse } from "@spt/models/eft/customization/IGetSuitsResponse";
import { IWearClothingRequestData } from "@spt/models/eft/customization/IWearClothingRequestData";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { SaveServer } from "@spt/servers/SaveServer";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class CustomizationCallbacks {
    constructor(
        @inject("CustomizationController") protected customizationController: CustomizationController,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
    ) {}

    /**
     * Handle client/trading/customization/storage
     * @returns IGetSuitsResponse
     */
    public getSuits(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IGetSuitsResponse> {
        const result: IGetSuitsResponse = { _id: sessionID, suites: this.saveServer.getProfile(sessionID).suits };
        return this.httpResponse.getBody(result);
    }

    /**
     * Handle client/trading/customization
     * @returns ISuit[]
     */
    public getTraderSuits(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<ISuit[]> {
        const splittedUrl = url.split("/");
        const traderID = splittedUrl[splittedUrl.length - 3];

        return this.httpResponse.getBody(this.customizationController.getTraderSuits(traderID, sessionID));
    }

    /**
     * Handle CustomizationWear event
     */
    public wearClothing(
        pmcData: IPmcData,
        body: IWearClothingRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.customizationController.wearClothing(pmcData, body, sessionID);
    }

    /**
     * Handle CustomizationBuy event
     */
    public buyClothing(pmcData: IPmcData, body: IBuyClothingRequestData, sessionID: string): IItemEventRouterResponse {
        return this.customizationController.buyClothing(pmcData, body, sessionID);
    }
}
