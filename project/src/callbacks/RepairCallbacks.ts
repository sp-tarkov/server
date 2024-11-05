import { RepairController } from "@spt/controllers/RepairController";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IRepairActionDataRequest } from "@spt/models/eft/repair/IRepairActionDataRequest";
import { ITraderRepairActionDataRequest } from "@spt/models/eft/repair/ITraderRepairActionDataRequest";
import { inject, injectable } from "tsyringe";

@injectable()
export class RepairCallbacks {
    constructor(@inject("RepairController") protected repairController: RepairController) {}

    /**
     * Handle TraderRepair event
     * use trader to repair item
     * @param pmcData Player profile
     * @param traderRepairRequest Request object
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public traderRepair(
        pmcData: IPmcData,
        traderRepairRequest: ITraderRepairActionDataRequest,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.repairController.traderRepair(sessionID, traderRepairRequest, pmcData);
    }

    /**
     * Handle Repair event
     * Use repair kit to repair item
     * @param pmcData Player profile
     * @param repairRequest Request object
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public repair(
        pmcData: IPmcData,
        repairRequest: IRepairActionDataRequest,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.repairController.repairWithKit(sessionID, repairRequest, pmcData);
    }
}
