import { inject, injectable } from "tsyringe";

import { RepairController } from "@spt-aki/controllers/RepairController";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { IRepairActionDataRequest } from "@spt-aki/models/eft/repair/IRepairActionDataRequest";
import { ITraderRepairActionDataRequest } from "@spt-aki/models/eft/repair/ITraderRepairActionDataRequest";

@injectable()
export class RepairCallbacks
{
    constructor(@inject("RepairController") protected repairController: RepairController)
    {}

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
    ): IItemEventRouterResponse
    {
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
    ): IItemEventRouterResponse
    {
        return this.repairController.repairWithKit(sessionID, repairRequest, pmcData);
    }
}
