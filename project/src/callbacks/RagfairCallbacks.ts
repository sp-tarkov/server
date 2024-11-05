import { RagfairController } from "@spt/controllers/RagfairController";
import { OnLoad } from "@spt/di/OnLoad";
import { OnUpdate } from "@spt/di/OnUpdate";
import { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IAddOfferRequestData } from "@spt/models/eft/ragfair/IAddOfferRequestData";
import { IExtendOfferRequestData } from "@spt/models/eft/ragfair/IExtendOfferRequestData";
import { IGetItemPriceResult } from "@spt/models/eft/ragfair/IGetItemPriceResult";
import { IGetMarketPriceRequestData } from "@spt/models/eft/ragfair/IGetMarketPriceRequestData";
import { IGetOffersResult } from "@spt/models/eft/ragfair/IGetOffersResult";
import { IGetRagfairOfferByIdRequest } from "@spt/models/eft/ragfair/IGetRagfairOfferByIdRequest";
import { IRagfairOffer } from "@spt/models/eft/ragfair/IRagfairOffer";
import { IRemoveOfferRequestData } from "@spt/models/eft/ragfair/IRemoveOfferRequestData";
import { ISearchRequestData } from "@spt/models/eft/ragfair/ISearchRequestData";
import { ISendRagfairReportRequestData } from "@spt/models/eft/ragfair/ISendRagfairReportRequestData";
import { IStorePlayerOfferTaxAmountRequestData } from "@spt/models/eft/ragfair/IStorePlayerOfferTaxAmountRequestData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { RagfairServer } from "@spt/servers/RagfairServer";
import { RagfairTaxService } from "@spt/services/RagfairTaxService";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

/**
 * Handle ragfair related callback events
 */
@injectable()
export class RagfairCallbacks implements OnLoad, OnUpdate {
    protected ragfairConfig: IRagfairConfig;

    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("RagfairServer") protected ragfairServer: RagfairServer,
        @inject("RagfairController") protected ragfairController: RagfairController,
        @inject("RagfairTaxService") protected ragfairTaxService: RagfairTaxService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
    }

    public async onLoad(): Promise<void> {
        await this.ragfairServer.load();
    }

    public getRoute(): string {
        return "spt-ragfair";
    }

    public async onUpdate(timeSinceLastRun: number): Promise<boolean> {
        if (timeSinceLastRun > this.ragfairConfig.runIntervalSeconds) {
            // There is a flag inside this class that only makes it run once.
            this.ragfairServer.addPlayerOffers();

            // Check player offers and mail payment to player if sold
            this.ragfairController.update();

            // Process all offers / expire offers
            await this.ragfairServer.update();

            return true;
        }
        return false;
    }

    /**
     * Handle client/ragfair/search
     * Handle client/ragfair/find
     */
    public search(url: string, info: ISearchRequestData, sessionID: string): IGetBodyResponseData<IGetOffersResult> {
        return this.httpResponse.getBody(this.ragfairController.getOffers(sessionID, info));
    }

    /** Handle client/ragfair/itemMarketPrice */
    public getMarketPrice(
        url: string,
        info: IGetMarketPriceRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGetItemPriceResult> {
        return this.httpResponse.getBody(this.ragfairController.getItemMinAvgMaxFleaPriceValues(info));
    }

    /** Handle RagFairAddOffer event */
    public addOffer(pmcData: IPmcData, info: IAddOfferRequestData, sessionID: string): IItemEventRouterResponse {
        return this.ragfairController.addPlayerOffer(pmcData, info, sessionID);
    }

    /** Handle RagFairRemoveOffer event */
    public removeOffer(pmcData: IPmcData, info: IRemoveOfferRequestData, sessionID: string): IItemEventRouterResponse {
        return this.ragfairController.removeOffer(info, sessionID);
    }

    /** Handle RagFairRenewOffer event */
    public extendOffer(pmcData: IPmcData, info: IExtendOfferRequestData, sessionID: string): IItemEventRouterResponse {
        return this.ragfairController.extendOffer(info, sessionID);
    }

    /**
     * Handle /client/items/prices
     * Called when clicking an item to list on flea
     */
    public getFleaPrices(
        url: string,
        request: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<Record<string, number>> {
        return this.httpResponse.getBody(this.ragfairController.getAllFleaPrices());
    }

    /** Handle client/reports/ragfair/send */
    public sendReport(url: string, info: ISendRagfairReportRequestData, sessionID: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    public storePlayerOfferTaxAmount(
        url: string,
        request: IStorePlayerOfferTaxAmountRequestData,
        sessionId: string,
    ): INullResponseData {
        this.ragfairTaxService.storeClientOfferTaxValue(sessionId, request);
        return this.httpResponse.nullResponse();
    }

    /** Handle client/ragfair/offer/findbyid */
    public getFleaOfferById(
        url: string,
        request: IGetRagfairOfferByIdRequest,
        sessionID: string,
    ): IGetBodyResponseData<IRagfairOffer> {
        return this.httpResponse.getBody(this.ragfairController.getOfferById(sessionID, request));
    }
}
