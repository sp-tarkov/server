import { inject, injectable } from "tsyringe";

import { ItemHelper } from "../helpers/ItemHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import {
    IPresetBuildActionRequestData
} from "../models/eft/presetBuild/IPresetBuildActionRequestData";
import { IUserBuildsResponse } from "../models/eft/presetBuild/IUserBuildsResponse";
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
    public getUserBuilds(sessionID: string): IUserBuildsResponse
    {
        // TODO, fully implement
        return this.saveServer.getProfile(sessionID).userbuilds;
    }

    /** Handle SaveBuild event */
    public saveBuild(pmcData: IPmcData, body: IPresetBuildActionRequestData, sessionID: string): IItemEventRouterResponse
    {
        delete body.Action;
        body.id = this.hashUtil.generate();

        const output = this.eventOutputHolder.getOutput(sessionID);
        const savedBuilds = this.saveServer.getProfile(sessionID).userbuilds.weaponBuilds;

        // replace duplicate ID's. The first item is the base item.
        // The root ID and the base item ID need to match.
        body.items = this.itemHelper.replaceIDs(pmcData, body.items);
        body.root = body.items[0]._id;

        savedBuilds[body.name] = body;
        this.saveServer.getProfile(sessionID).userbuilds.weaponBuilds = savedBuilds;

        output.profileChanges[sessionID].builds.push(body);
        return output;
    }
    
    /** Handle RemoveBuild event*/
    public removeBuild(pmcData: IPmcData, body: IPresetBuildActionRequestData, sessionID: string): IItemEventRouterResponse
    {
        const savedBuilds = this.saveServer.getProfile(sessionID).userbuilds.weaponBuilds;

        for (const name in savedBuilds)
        {
            if (savedBuilds[name].id === body.id)
            {
                delete savedBuilds[name];
                this.saveServer.getProfile(sessionID).userbuilds.weaponBuilds = savedBuilds;
                break;
            }
        }

        return this.eventOutputHolder.getOutput(sessionID);
    }
}