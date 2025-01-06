import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { ISetMagazineRequest } from "@spt/models/eft/builds/ISetMagazineRequest";
import { IPresetBuildActionRequestData } from "@spt/models/eft/presetBuild/IPresetBuildActionRequestData";
import { IRemoveBuildRequestData } from "@spt/models/eft/presetBuild/IRemoveBuildRequestData";
import { IEquipmentBuild, IMagazineBuild, IUserBuilds, IWeaponBuild } from "@spt/models/eft/profile/ISptProfile";
import { EquipmentBuildType } from "@spt/models/enums/EquipmentBuildType";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HashUtil } from "@spt/utils/HashUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class BuildController {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {}

    /** Handle client/handbook/builds/my/list */
    public getUserBuilds(sessionID: string): IUserBuilds {
        const secureContainerSlotId = "SecuredContainer";
        const profile = this.saveServer.getProfile(sessionID);
        if (!profile.userbuilds) {
            profile.userbuilds = { equipmentBuilds: [], weaponBuilds: [], magazineBuilds: [] };
        }

        // Ensure the secure container in the default presets match what the player has equipped
        const defaultEquipmentPresetsClone = this.cloner.clone(
            this.databaseService.getTemplates().defaultEquipmentPresets,
        );
        const playerSecureContainer = profile.characters.pmc.Inventory.items?.find(
            (x) => x.slotId === secureContainerSlotId,
        );
        const firstDefaultItemsSecureContainer = defaultEquipmentPresetsClone[0]?.Items?.find(
            (x) => x.slotId === secureContainerSlotId,
        );
        if (playerSecureContainer && playerSecureContainer?._tpl !== firstDefaultItemsSecureContainer?._tpl) {
            // Default equipment presets' secure container tpl doesn't match players secure container tpl
            for (const defaultPreset of defaultEquipmentPresetsClone) {
                // Find presets secure container
                const secureContainer = defaultPreset.Items.find((item) => item.slotId === secureContainerSlotId);
                if (secureContainer) {
                    secureContainer._tpl = playerSecureContainer._tpl;
                }
            }
        }

        // Clone player build data from profile and append the above defaults onto end
        const userBuildsClone = this.cloner.clone(profile.userbuilds);
        userBuildsClone.equipmentBuilds.push(...defaultEquipmentPresetsClone);

        return userBuildsClone;
    }

    /** Handle client/builds/weapon/save */
    public saveWeaponBuild(sessionId: string, body: IPresetBuildActionRequestData): void {
        const pmcData = this.profileHelper.getPmcProfile(sessionId);

        // Replace duplicate Id's. The first item is the base item.
        // The root ID and the base item ID need to match.
        body.Items = this.itemHelper.replaceIDs(body.Items, pmcData);
        body.Root = body.Items[0]._id;

        // Create new object ready to save into profile userbuilds.weaponBuilds
        const newBuild: IWeaponBuild = { Id: body.Id, Name: body.Name, Root: body.Root, Items: body.Items };

        const savedWeaponBuilds = this.saveServer.getProfile(sessionId).userbuilds.weaponBuilds;
        const existingBuild = savedWeaponBuilds.find((x) => x.Id === body.Id);
        if (existingBuild) {
            // exists, replace
            this.saveServer
                .getProfile(sessionId)
                .userbuilds.weaponBuilds.splice(savedWeaponBuilds.indexOf(existingBuild), 1, newBuild);
        } else {
            // Add fresh
            this.saveServer.getProfile(sessionId).userbuilds.weaponBuilds.push(newBuild);
        }
    }

    /** Handle client/builds/equipment/save event */
    public saveEquipmentBuild(sessionID: string, request: IPresetBuildActionRequestData): void {
        const buildType = "equipmentBuilds";
        const pmcData = this.profileHelper.getPmcProfile(sessionID);

        const existingSavedEquipmentBuilds: IEquipmentBuild[] =
            this.saveServer.getProfile(sessionID).userbuilds[buildType];

        // Replace duplicate ID's. The first item is the base item.
        // Root ID and the base item ID need to match.
        request.Items = this.itemHelper.replaceIDs(request.Items, pmcData);

        const newBuild: IEquipmentBuild = {
            Id: request.Id,
            Name: request.Name,
            BuildType: EquipmentBuildType.CUSTOM,
            Root: request.Items[0]._id,
            Items: request.Items,
        };

        const existingBuild = existingSavedEquipmentBuilds.find(
            (build) => build.Name === request.Name || build.Id === request.Id,
        );
        if (existingBuild) {
            // Already exists, replace
            this.saveServer
                .getProfile(sessionID)
                .userbuilds[buildType].splice(existingSavedEquipmentBuilds.indexOf(existingBuild), 1, newBuild);
        } else {
            // Fresh, add new
            this.saveServer.getProfile(sessionID).userbuilds[buildType].push(newBuild);
        }
    }

    /** Handle client/builds/delete */
    public removeBuild(sessionID: string, request: IRemoveBuildRequestData): void {
        this.removePlayerBuild(request.id, sessionID);
    }

    protected removePlayerBuild(idToRemove: string, sessionID: string): void {
        const profile = this.saveServer.getProfile(sessionID);
        const weaponBuilds = profile.userbuilds.weaponBuilds;
        const equipmentBuilds = profile.userbuilds.equipmentBuilds;
        const magazineBuilds = profile.userbuilds.magazineBuilds;

        // Check for id in weapon array first
        const matchingWeaponBuild = weaponBuilds.find((weaponBuild) => weaponBuild.Id === idToRemove);
        if (matchingWeaponBuild) {
            weaponBuilds.splice(weaponBuilds.indexOf(matchingWeaponBuild), 1);

            return;
        }

        // Id not found in weapons, try equipment
        const matchingEquipmentBuild = equipmentBuilds.find((equipmentBuild) => equipmentBuild.Id === idToRemove);
        if (matchingEquipmentBuild) {
            equipmentBuilds.splice(equipmentBuilds.indexOf(matchingEquipmentBuild), 1);

            return;
        }

        // Id not found in weapons/equipment, try mags
        const matchingMagazineBuild = magazineBuilds.find((magBuild) => magBuild.Id === idToRemove);
        if (matchingMagazineBuild) {
            magazineBuilds.splice(magazineBuilds.indexOf(matchingMagazineBuild), 1);

            return;
        }

        // Not found in weapons,equipment or magazines, not good
        this.logger.error(this.localisationService.getText("build-unable_to_delete_preset", idToRemove));
    }

    /**
     * Handle client/builds/magazine/save
     */
    public createMagazineTemplate(sessionId: string, request: ISetMagazineRequest): void {
        const result: IMagazineBuild = {
            Id: request.Id,
            Name: request.Name,
            Caliber: request.Caliber,
            TopCount: request.TopCount,
            BottomCount: request.BottomCount,
            Items: request.Items,
        };

        const profile = this.profileHelper.getFullProfile(sessionId);

        profile.userbuilds.magazineBuilds ||= [];

        const existingArrayId = profile.userbuilds.magazineBuilds.findIndex((item) => item.Name === request.Name);
        if (existingArrayId === -1) {
            profile.userbuilds.magazineBuilds.push(result);
        } else {
            profile.userbuilds.magazineBuilds.splice(existingArrayId, 1, result);
        }
    }
}
