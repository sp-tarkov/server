import type { InsuranceController } from "@spt/controllers/InsuranceController";
import type { OnUpdate } from "@spt/di/OnUpdate";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { IGetInsuranceCostRequestData } from "@spt/models/eft/insurance/IGetInsuranceCostRequestData";
import type { IGetInsuranceCostResponseData } from "@spt/models/eft/insurance/IGetInsuranceCostResponseData";
import type { IInsureRequestData } from "@spt/models/eft/insurance/IInsureRequestData";
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import type { IInsuranceConfig } from "@spt/models/spt/config/IInsuranceConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import type { InsuranceService } from "@spt/services/InsuranceService";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class InsuranceCallbacks implements OnUpdate {
    protected insuranceConfig: IInsuranceConfig;
    constructor(
        @inject("InsuranceController") protected insuranceController: InsuranceController,
        @inject("InsuranceService") protected insuranceService: InsuranceService,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("ConfigServer") protected configServer: ConfigServer,
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
        sessionID: string,
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
        // People edit the config value to be 0 and break it, force value to no lower than 1
        if (secondsSinceLastRun > Math.max(this.insuranceConfig.runIntervalSeconds, 1)) {
            this.insuranceController.processReturn();
            return true;
        }
        return false;
    }

    public getRoute(): string {
        return "spt-insurance";
    }
}
