import { inject, injectable } from "tsyringe";

import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { IPresetBuildActionRequestData } from "@spt-aki/models/eft/presetBuild/IPresetBuildActionRequestData";
import { IRemoveBuildRequestData } from "@spt-aki/models/eft/presetBuild/IRemoveBuildRequestData";
import { IUserBuilds, IWeaponBuild } from "@spt-aki/models/eft/profile/IAkiProfile";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";

@injectable()
export class PresetBuildController {
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("SaveServer") protected saveServer: SaveServer
    ) {}

    /** Handle client/handbook/builds/my/list */
    public getUserBuilds(sessionID: string): IUserBuilds {
        const profile = this.saveServer.getProfile(sessionID);
        if (!profile.userbuilds) {
            profile.userbuilds = {
                equipmentBuilds: [],
                weaponBuilds: [],
            };
        }

        // Ensure the secure container in the default presets match what the player has equipped
        const defaultEquipmentPresets = this.jsonUtil.clone(
            this.databaseServer.getTables().templates.defaultEquipmentPresets
        );
        const playerSecureContainer = profile.characters.pmc.Inventory.items?.find(
            (x) => x.slotId === "SecuredContainer"
        );
        const firstDefaultItemsSecureContainer = defaultEquipmentPresets[0]?.items?.find(
            (x) => x.slotId === "SecuredContainer"
        );
        if (playerSecureContainer && playerSecureContainer?._tpl !== firstDefaultItemsSecureContainer?._tpl) {
            // Default equipment presets' secure container tpl doesnt match players secure container tpl
            for (const defaultPreset of defaultEquipmentPresets) {
                // Find presets secure container
                const secureContainer = defaultPreset.items.find((x) => x.slotId === "SecuredContainer");
                if (secureContainer) {
                    secureContainer._tpl = playerSecureContainer._tpl;
                }
            }
        }

        // Clone player build data from profile and append the above defaults onto end
        const result = this.jsonUtil.clone(profile.userbuilds);
        result.equipmentBuilds.push(...defaultEquipmentPresets);

        return result;
    }

    /** Handle SaveWeaponBuild event */
    public saveWeaponBuild(
        pmcData: IPmcData,
        body: IPresetBuildActionRequestData,
        sessionId: string
    ): IItemEventRouterResponse {
        // TODO - could be merged into saveBuild, maybe
        const output = this.eventOutputHolder.getOutput(sessionId);

        // Replace duplicate Id's. The first item is the base item.
        // The root ID and the base item ID need to match.
        body.items = this.itemHelper.replaceIDs(pmcData, body.items);
        body.root = body.items[0]._id;

        // Create new object ready to save into profile userbuilds.weaponBuilds
        const newId = this.hashUtil.generate(); // Id is empty, generate it
        const newBuild: IWeaponBuild = {
            id: newId,
            name: body.name,
            root: body.root,
            items: body.items,
            type: "weapon",
        };

        const savedWeaponBuilds = this.saveServer.getProfile(sessionId).userbuilds.weaponBuilds;
        const existingBuild = savedWeaponBuilds.find((x) => x.id === body.id);
        if (existingBuild) {
            // exists, replace
            this.saveServer
                .getProfile(sessionId)
                .userbuilds.weaponBuilds.splice(savedWeaponBuilds.indexOf(existingBuild), 1, newBuild);
        } else {
            // Add fresh
            this.saveServer.getProfile(sessionId).userbuilds.weaponBuilds.push(newBuild);
        }

        // Inform client of new weapon preset
        output.profileChanges[sessionId].weaponBuilds.push(newBuild);

        return output;
    }

    /** Handle SaveEquipmentBuild event */
    public saveEquipmentBuild(
        pmcData: IPmcData,
        body: IPresetBuildActionRequestData,
        sessionID: string
    ): IItemEventRouterResponse {
        return this.saveBuild(pmcData, body, sessionID, "equipmentBuilds");
    }

    protected saveBuild(
        pmcData: IPmcData,
        body: IPresetBuildActionRequestData,
        sessionID: string,
        buildType: string
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionID);
        const existingSavedBuilds: any[] = this.saveServer.getProfile(sessionID).userbuilds[buildType];

        // replace duplicate ID's. The first item is the base item.
        // The root ID and the base item ID need to match.
        body.items = this.itemHelper.replaceIDs(pmcData, body.items);

        const newBuild = {
            id: this.hashUtil.generate(),
            name: body.name,
            buildType: "Custom",
            root: body.root,
            fastPanel: [],
            items: body.items,
        };

        const existingBuild = existingSavedBuilds.find((x) => x.name === body.name);
        if (existingBuild) {
            // Already exists, replace
            this.saveServer
                .getProfile(sessionID)
                .userbuilds[buildType].splice(existingSavedBuilds.indexOf(existingBuild), 1, newBuild);
        } else {
            // Fresh, add new
            this.saveServer.getProfile(sessionID).userbuilds[buildType].push(newBuild);
        }

        output.profileChanges[sessionID][buildType].push(newBuild);

        return output;
    }

    /** Handle RemoveWeaponBuild event*/
    public removeBuild(pmcData: IPmcData, body: IRemoveBuildRequestData, sessionID: string): IItemEventRouterResponse {
        return this.removePlayerBuild(pmcData, body.id, sessionID);
    }

    /** Handle RemoveWeaponBuild event*/
    public removeWeaponBuild(
        pmcData: IPmcData,
        body: IPresetBuildActionRequestData,
        sessionID: string
    ): IItemEventRouterResponse {
        // todo - does this get called?
        return this.removePlayerBuild(pmcData, body.id, sessionID);
    }

    /** Handle RemoveEquipmentBuild event*/
    public removeEquipmentBuild(
        pmcData: IPmcData,
        body: IPresetBuildActionRequestData,
        sessionID: string
    ): IItemEventRouterResponse {
        // todo - does this get called?
        return this.removePlayerBuild(pmcData, body.id, sessionID);
    }

    protected removePlayerBuild(pmcData: IPmcData, id: string, sessionID: string): IItemEventRouterResponse {
        const weaponBuilds = this.saveServer.getProfile(sessionID).userbuilds.weaponBuilds;
        const equipmentBuilds = this.saveServer.getProfile(sessionID).userbuilds.equipmentBuilds;

        // Check for id in weapon array first
        const matchingWeaponBuild = weaponBuilds.find((x) => x.id === id);
        if (matchingWeaponBuild) {
            weaponBuilds.splice(weaponBuilds.indexOf(matchingWeaponBuild), 1);

            return this.eventOutputHolder.getOutput(sessionID);
        }

        // Id not found in weapons, try equipment
        const matchingEquipmentBuild = equipmentBuilds.find((x) => x.id === id);
        if (matchingEquipmentBuild) {
            equipmentBuilds.splice(equipmentBuilds.indexOf(matchingEquipmentBuild), 1);
        }

        // Not found in weapons or equipment, not good
        if (!(matchingWeaponBuild || matchingEquipmentBuild)) {
            this.logger.error(`Unable to delete preset, cannot find ${id} in weapon or equipment presets`);
        }

        return this.eventOutputHolder.getOutput(sessionID);
    }
}
