import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { QuestHelper } from "@spt/helpers/QuestHelper";
import { RepairHelper } from "@spt/helpers/RepairHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IRepairActionDataRequest } from "@spt/models/eft/repair/IRepairActionDataRequest";
import { ITraderRepairActionDataRequest } from "@spt/models/eft/repair/ITraderRepairActionDataRequest";
import { IRepairConfig } from "@spt/models/spt/config/IRepairConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { DatabaseService } from "@spt/services/DatabaseService";
import { PaymentService } from "@spt/services/PaymentService";
import { RepairService } from "@spt/services/RepairService";
import { inject, injectable } from "tsyringe";

@injectable()
export class RepairController {
    protected repairConfig: IRepairConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("PaymentService") protected paymentService: PaymentService,
        @inject("RepairHelper") protected repairHelper: RepairHelper,
        @inject("RepairService") protected repairService: RepairService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
    ) {}

    /**
     * Handle TraderRepair event
     * Repair with trader
     * @param sessionID session id
     * @param body endpoint request data
     * @param pmcData player profile
     * @returns item event router action
     */
    public traderRepair(
        sessionID: string,
        body: ITraderRepairActionDataRequest,
        pmcData: IPmcData,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionID);

        // find the item to repair
        for (const repairItem of body.repairItems) {
            const repairDetails = this.repairService.repairItemByTrader(sessionID, pmcData, repairItem, body.tid);

            this.repairService.payForRepair(
                sessionID,
                pmcData,
                repairItem._id,
                repairDetails.repairCost,
                body.tid,
                output,
            );

            if (output.warnings.length > 0) {
                return output;
            }

            // Add repaired item to output object
            output.profileChanges[sessionID].items.change.push(repairDetails.repairedItem);

            // Add skill points for repairing weapons
            this.repairService.addRepairSkillPoints(sessionID, repairDetails, pmcData);
        }

        return output;
    }

    /**
     * Handle Repair event
     * Repair with repair kit
     * @param sessionID session id
     * @param body endpoint request data
     * @param pmcData player profile
     * @returns item event router action
     */
    public repairWithKit(
        sessionID: string,
        body: IRepairActionDataRequest,
        pmcData: IPmcData,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionID);

        // repair item
        const repairDetails = this.repairService.repairItemByKit(
            sessionID,
            pmcData,
            body.repairKitsInfo,
            body.target,
            output,
        );

        this.repairService.addBuffToItem(repairDetails, pmcData);

        // add repaired item to send to client
        output.profileChanges[sessionID].items.change.push(repairDetails.repairedItem);

        // Add skill points for repairing items
        this.repairService.addRepairSkillPoints(sessionID, repairDetails, pmcData);

        return output;
    }
}
