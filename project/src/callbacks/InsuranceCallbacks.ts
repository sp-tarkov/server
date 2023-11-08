import { inject, injectable } from "tsyringe";

import { InsuranceController } from "@spt-aki/controllers/InsuranceController";
import { OnUpdate } from "@spt-aki/di/OnUpdate";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";
import { IGetInsuranceCostRequestData } from "@spt-aki/models/eft/insurance/IGetInsuranceCostRequestData";
import { IGetInsuranceCostResponseData } from "@spt-aki/models/eft/insurance/IGetInsuranceCostResponseData";
import { IInsureRequestData } from "@spt-aki/models/eft/insurance/IInsureRequestData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IInsuranceConfig } from "@spt-aki/models/spt/config/IInsuranceConfig";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { InsuranceService } from "@spt-aki/services/InsuranceService";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";

@injectable()
export class InsuranceCallbacks implements OnUpdate {
    protected insuranceConfig: IInsuranceConfig;
    constructor(
        @inject("InsuranceController") protected insuranceController: InsuranceController,
        @inject("InsuranceService") protected insuranceService: InsuranceService,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("ConfigServer") protected configServer: ConfigServer
    ) {
        this.insuranceConfig = this.configServer.getConfig(ConfigTypes.INSURANCE);
    }

    /**
     * Handle client/insurance/items/list/cost
     * @returns IGetInsuranceCostResponseData
     */
    public getInsuranceCost(
        url: string,
        info: IGetInsuranceCostRequestData,
        sessionID: string
    ): IGetBodyResponseData<IGetInsuranceCostResponseData> {
        return this.httpResponse.getBody(this.insuranceController.cost(info, sessionID));
    }

    /**
     * Handle Insure event
     * @returns IItemEventRouterResponse
     */
    public insure(pmcData: IPmcData, body: IInsureRequestData, sessionID: string): IItemEventRouterResponse {
        return this.insuranceController.insure(pmcData, body, sessionID);
    }

    public async onUpdate(secondsSinceLastRun: number): Promise<boolean> {
        if (secondsSinceLastRun > this.insuranceConfig.runIntervalSeconds) {
            this.insuranceController.processReturn();
            return true;
        }

        return false;
    }

    public getRoute(): string {
        return "aki-insurance";
    }
}
