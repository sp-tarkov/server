import { HideoutCallbacks } from "@spt/callbacks/HideoutCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt/di/Router";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { HideoutEventActions } from "@spt/models/enums/HideoutEventActions";
import { inject, injectable } from "tsyringe";

@injectable()
export class HideoutItemEventRouter extends ItemEventRouterDefinition {
    constructor(@inject("HideoutCallbacks") protected hideoutCallbacks: HideoutCallbacks) {
        super();
    }

    public override getHandledRoutes(): HandledRoute[] {
        return [
            new HandledRoute(HideoutEventActions.HIDEOUT_UPGRADE, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_UPGRADE_COMPLETE, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_PUT_ITEMS_IN_AREA_SLOTS, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_TAKE_ITEMS_FROM_AREA_SLOTS, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_TOGGLE_AREA, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_SINGLE_PRODUCTION_START, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_SCAV_CASE_PRODUCTION_START, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_CONTINUOUS_PRODUCTION_START, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_TAKE_PRODUCTION, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_RECORD_SHOOTING_RANGE_POINTS, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_IMPROVE_AREA, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_CANCEL_PRODUCTION_COMMAND, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_CIRCLE_OF_CULTIST_PRODUCTION_START, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_DELETE_PRODUCTION_COMMAND, false),
        ];
    }

    public override async handleItemEvent(
        url: string,
        pmcData: IPmcData,
        body: any,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): Promise<IItemEventRouterResponse> {
        switch (url) {
            case HideoutEventActions.HIDEOUT_UPGRADE:
                return this.hideoutCallbacks.upgrade(pmcData, body, sessionID, output);
            case HideoutEventActions.HIDEOUT_UPGRADE_COMPLETE:
                return this.hideoutCallbacks.upgradeComplete(pmcData, body, sessionID, output);
            case HideoutEventActions.HIDEOUT_PUT_ITEMS_IN_AREA_SLOTS:
                return this.hideoutCallbacks.putItemsInAreaSlots(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_TAKE_ITEMS_FROM_AREA_SLOTS:
                return this.hideoutCallbacks.takeItemsFromAreaSlots(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_TOGGLE_AREA:
                return this.hideoutCallbacks.toggleArea(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_SINGLE_PRODUCTION_START:
                return this.hideoutCallbacks.singleProductionStart(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_SCAV_CASE_PRODUCTION_START:
                return this.hideoutCallbacks.scavCaseProductionStart(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_CONTINUOUS_PRODUCTION_START:
                return this.hideoutCallbacks.continuousProductionStart(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_TAKE_PRODUCTION:
                return this.hideoutCallbacks.takeProduction(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_RECORD_SHOOTING_RANGE_POINTS:
                return this.hideoutCallbacks.recordShootingRangePoints(pmcData, body, sessionID, output);
            case HideoutEventActions.HIDEOUT_IMPROVE_AREA:
                return this.hideoutCallbacks.improveArea(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_CANCEL_PRODUCTION_COMMAND:
                return this.hideoutCallbacks.cancelProduction(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_CIRCLE_OF_CULTIST_PRODUCTION_START:
                return this.hideoutCallbacks.circleOfCultistProductionStart(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_DELETE_PRODUCTION_COMMAND:
                return this.hideoutCallbacks.hideoutDeleteProductionCommand(pmcData, body, sessionID);
            default:
                throw new Error(`Unhandled event ${url} request: ${JSON.stringify(body)}`);
        }
    }
}
