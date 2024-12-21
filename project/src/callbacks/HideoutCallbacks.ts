import { HideoutController } from "@spt/controllers/HideoutController";
import type { OnUpdate } from "@spt/di/OnUpdate";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import type { IHandleQTEEventRequestData } from "@spt/models/eft/hideout/IHandleQTEEventRequestData";
import type { IHideoutCancelProductionRequestData } from "@spt/models/eft/hideout/IHideoutCancelProductionRequestData";
import type { IHideoutCircleOfCultistProductionStartRequestData } from "@spt/models/eft/hideout/IHideoutCircleOfCultistProductionStartRequestData";
import type { IHideoutContinuousProductionStartRequestData } from "@spt/models/eft/hideout/IHideoutContinuousProductionStartRequestData";
import type { IHideoutDeleteProductionRequestData } from "@spt/models/eft/hideout/IHideoutDeleteProductionRequestData";
import type { IHideoutImproveAreaRequestData } from "@spt/models/eft/hideout/IHideoutImproveAreaRequestData";
import type { IHideoutPutItemInRequestData } from "@spt/models/eft/hideout/IHideoutPutItemInRequestData";
import type { IHideoutScavCaseStartRequestData } from "@spt/models/eft/hideout/IHideoutScavCaseStartRequestData";
import type { IHideoutSingleProductionStartRequestData } from "@spt/models/eft/hideout/IHideoutSingleProductionStartRequestData";
import type { IHideoutTakeItemOutRequestData } from "@spt/models/eft/hideout/IHideoutTakeItemOutRequestData";
import type { IHideoutTakeProductionRequestData } from "@spt/models/eft/hideout/IHideoutTakeProductionRequestData";
import type { IHideoutToggleAreaRequestData } from "@spt/models/eft/hideout/IHideoutToggleAreaRequestData";
import type { IHideoutUpgradeCompleteRequestData } from "@spt/models/eft/hideout/IHideoutUpgradeCompleteRequestData";
import type { IHideoutUpgradeRequestData } from "@spt/models/eft/hideout/IHideoutUpgradeRequestData";
import type { IRecordShootingRangePoints } from "@spt/models/eft/hideout/IRecordShootingRangePoints";
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import type { IHideoutConfig } from "@spt/models/spt/config/IHideoutConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { inject, injectable } from "tsyringe";

@injectable()
export class HideoutCallbacks implements OnUpdate {
    protected hideoutConfig: IHideoutConfig;

    constructor(
        @inject("HideoutController") protected hideoutController: HideoutController, // TODO: delay needed
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.hideoutConfig = this.configServer.getConfig(ConfigTypes.HIDEOUT);
    }

    /**
     * Handle HideoutUpgrade event
     */
    public upgrade(
        pmcData: IPmcData,
        body: IHideoutUpgradeRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        this.hideoutController.startUpgrade(pmcData, body, sessionID, output);

        return output;
    }

    /**
     * Handle HideoutUpgradeComplete event
     */
    public upgradeComplete(
        pmcData: IPmcData,
        body: IHideoutUpgradeCompleteRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        this.hideoutController.upgradeComplete(pmcData, body, sessionID, output);

        return output;
    }

    /**
     * Handle HideoutPutItemsInAreaSlots
     */
    public putItemsInAreaSlots(
        pmcData: IPmcData,
        body: IHideoutPutItemInRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.hideoutController.putItemsInAreaSlots(pmcData, body, sessionID);
    }

    /**
     * Handle HideoutTakeItemsFromAreaSlots event
     */
    public takeItemsFromAreaSlots(
        pmcData: IPmcData,
        body: IHideoutTakeItemOutRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.hideoutController.takeItemsFromAreaSlots(pmcData, body, sessionID);
    }

    /**
     * Handle HideoutToggleArea event
     */
    public toggleArea(
        pmcData: IPmcData,
        body: IHideoutToggleAreaRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.hideoutController.toggleArea(pmcData, body, sessionID);
    }

    /**
     * Handle HideoutSingleProductionStart event
     */
    public singleProductionStart(
        pmcData: IPmcData,
        body: IHideoutSingleProductionStartRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.hideoutController.singleProductionStart(pmcData, body, sessionID);
    }

    /**
     * Handle HideoutScavCaseProductionStart event
     */
    public scavCaseProductionStart(
        pmcData: IPmcData,
        body: IHideoutScavCaseStartRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.hideoutController.scavCaseProductionStart(pmcData, body, sessionID);
    }

    /**
     * Handle HideoutContinuousProductionStart
     */
    public continuousProductionStart(
        pmcData: IPmcData,
        body: IHideoutContinuousProductionStartRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.hideoutController.continuousProductionStart(pmcData, body, sessionID);
    }

    /**
     * Handle HideoutTakeProduction event
     */
    public takeProduction(
        pmcData: IPmcData,
        body: IHideoutTakeProductionRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.hideoutController.takeProduction(pmcData, body, sessionID);
    }

    /**
     * Handle HideoutQuickTimeEvent
     */
    public handleQTEEvent(
        pmcData: IPmcData,
        request: IHandleQTEEventRequestData,
        sessionId: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        this.hideoutController.handleQTEEventOutcome(sessionId, pmcData, request, output);

        return output;
    }

    /**
     * Handle client/game/profile/items/moving - RecordShootingRangePoints
     */
    public recordShootingRangePoints(
        pmcData: IPmcData,
        request: IRecordShootingRangePoints,
        sessionId: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        this.hideoutController.recordShootingRangePoints(sessionId, pmcData, request);

        return output;
    }

    /**
     * Handle client/game/profile/items/moving - RecordShootingRangePoints
     */
    public improveArea(
        pmcData: IPmcData,
        request: IHideoutImproveAreaRequestData,
        sessionId: string,
    ): IItemEventRouterResponse {
        return this.hideoutController.improveArea(sessionId, pmcData, request);
    }

    /**
     * Handle client/game/profile/items/moving - HideoutCancelProductionCommand
     */
    public cancelProduction(
        pmcData: IPmcData,
        request: IHideoutCancelProductionRequestData,
        sessionId: string,
    ): IItemEventRouterResponse {
        return this.hideoutController.cancelProduction(sessionId, pmcData, request);
    }

    /**
     * Handle client/game/profile/items/moving - HideoutCircleOfCultistProductionStart
     */
    public circleOfCultistProductionStart(
        pmcData: IPmcData,
        request: IHideoutCircleOfCultistProductionStartRequestData,
        sessionId: string,
    ): IItemEventRouterResponse {
        return this.hideoutController.circleOfCultistProductionStart(sessionId, pmcData, request);
    }

    /**
     * Handle client/game/profile/items/moving - HideoutDeleteProductionCommand
     */
    hideoutDeleteProductionCommand(
        pmcData: IPmcData,
        request: IHideoutDeleteProductionRequestData,
        sessionId: string,
    ): IItemEventRouterResponse {
        return this.hideoutController.hideoutDeleteProductionCommand(sessionId, pmcData, request);
    }

    public async onUpdate(timeSinceLastRun: number): Promise<boolean> {
        if (timeSinceLastRun > this.hideoutConfig.runIntervalSeconds) {
            this.hideoutController.update();
            return true;
        }
        return false;
    }

    public getRoute(): string {
        return "spt-hideout";
    }
}
