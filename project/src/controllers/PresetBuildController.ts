import { inject, injectable } from "tsyringe";

import { ItemHelper } from "../helpers/ItemHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import {
    IPresetBuildActionRequestData
} from "../models/eft/presetBuild/IPresetBuildActionRequestData";
import { IUserBuilds } from "../models/eft/profile/IAkiProfile";
import { EventOutputHolder } from "../routers/EventOutputHolder";
import { SaveServer } from "../servers/SaveServer";
import { HashUtil } from "../utils/HashUtil";

@injectable()
export class PresetBuildController
{
    constructor(
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("SaveServer") protected saveServer: SaveServer
    )
    { }

    /** Handle client/handbook/builds/my/list */
    public getUserBuilds(sessionID: string): IUserBuilds
    {
        const profile = this.saveServer.getProfile(sessionID);
        if (!profile.userbuilds)
        {
            profile.userbuilds = {
                equipmentBuilds: [],
                weaponBuilds: []
            };
        }

        return profile.userbuilds;
    }

    /** Handle SaveWeaponBuild event */
    public saveWeaponBuild(pmcData: IPmcData, body: IPresetBuildActionRequestData, sessionID: string): IItemEventRouterResponse
    {
        return this.saveBuild(pmcData, body, sessionID, "weaponBuilds");
    }

    /** Handle SaveEquipmentBuild event */
    public saveEquipmentBuild(pmcData: IPmcData, body: IPresetBuildActionRequestData, sessionID: string): IItemEventRouterResponse
    {
        return this.saveBuild(pmcData, body, sessionID, "equipmentBuilds");
    }

    protected saveBuild(pmcData: IPmcData, body: IPresetBuildActionRequestData, sessionID: string, buildType: string): IItemEventRouterResponse
    {
        delete body.Action;
        body.id = this.hashUtil.generate();

        const output = this.eventOutputHolder.getOutput(sessionID);
        const savedBuilds = this.saveServer.getProfile(sessionID).userbuilds[buildType];

        // replace duplicate ID's. The first item is the base item.
        // The root ID and the base item ID need to match.
        body.items = this.itemHelper.replaceIDs(pmcData, body.items);
        body.root = body.items[0]._id;

        savedBuilds[body.name] = body;
        this.saveServer.getProfile(sessionID).userbuilds[buildType] = savedBuilds;

        output.profileChanges[sessionID][buildType].push(body);

        return output;
    }

    /** Handle RemoveWeaponBuild event*/
    public removeWeaponBuild(pmcData: IPmcData, body: IPresetBuildActionRequestData, sessionID: string): IItemEventRouterResponse
    {
        return this.removeBuild(pmcData, body, sessionID, "weaponBuilds");
    }

    /** Handle RemoveEquipmentBuild event*/
    public removeEquipmentBuild(pmcData: IPmcData, body: IPresetBuildActionRequestData, sessionID: string): IItemEventRouterResponse
    {
        return this.removeBuild(pmcData, body, sessionID, "equipmentBuilds");
    }
    
    protected removeBuild(pmcData: IPmcData, body: IPresetBuildActionRequestData, sessionID: string, buildType: string): IItemEventRouterResponse
    {
        const savedBuilds = this.saveServer.getProfile(sessionID).userbuilds[buildType];

        for (const name in savedBuilds)
        {
            if (savedBuilds[name].id === body.id)
            {
                delete savedBuilds[name];
                this.saveServer.getProfile(sessionID).userbuilds[buildType] = savedBuilds;
                break;
            }
        }

        return this.eventOutputHolder.getOutput(sessionID);
    }
}