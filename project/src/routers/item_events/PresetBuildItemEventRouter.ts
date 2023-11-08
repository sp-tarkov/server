import { inject, injectable } from "tsyringe";

import { PresetBuildCallbacks } from "@spt-aki/callbacks/PresetBuildCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt-aki/di/Router";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { ItemEventActions } from "@spt-aki/models/enums/ItemEventActions";

@injectable()
export class PresetBuildItemEventRouter extends ItemEventRouterDefinition {
    constructor(@inject("PresetBuildCallbacks") protected presetBuildCallbacks: PresetBuildCallbacks) {
        super();
    }

    public override getHandledRoutes(): HandledRoute[] {
        return [
            new HandledRoute(ItemEventActions.SAVE_WEAPON_BUILD, false),
            new HandledRoute(ItemEventActions.REMOVE_WEAPON_BUILD, false),
            new HandledRoute(ItemEventActions.SAVE_EQUIPMENT_BUILD, false),
            new HandledRoute(ItemEventActions.REMOVE_EQUIPMENT_BUILD, false),
            new HandledRoute(ItemEventActions.REMOVE_BUILD, false),
        ];
    }

    public override handleItemEvent(
        url: string,
        pmcData: IPmcData,
        body: any,
        sessionID: string
    ): IItemEventRouterResponse {
        switch (url) {
            case ItemEventActions.SAVE_WEAPON_BUILD:
                return this.presetBuildCallbacks.saveWeaponBuild(pmcData, body, sessionID);
            case ItemEventActions.REMOVE_WEAPON_BUILD:
                return this.presetBuildCallbacks.removeWeaponBuild(pmcData, body, sessionID);
            case ItemEventActions.REMOVE_BUILD:
                return this.presetBuildCallbacks.removeBuild(pmcData, body, sessionID);
            case ItemEventActions.SAVE_EQUIPMENT_BUILD:
                return this.presetBuildCallbacks.saveEquipmentBuild(pmcData, body, sessionID);
            case ItemEventActions.REMOVE_EQUIPMENT_BUILD:
                return this.presetBuildCallbacks.removeEquipmentBuild(pmcData, body, sessionID);
        }
    }
}
