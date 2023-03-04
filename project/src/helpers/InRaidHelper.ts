import { inject, injectable } from "tsyringe";

import { IPmcData } from "../models/eft/common/IPmcData";
import { Victim } from "../models/eft/common/tables/IBotBase";
import { Item } from "../models/eft/common/tables/IItem";
import { ISaveProgressRequestData } from "../models/eft/inRaid/ISaveProgressRequestData";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { ILostOnDeathConfig } from "../models/spt/config/ILostOnDeathConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { SaveServer } from "../servers/SaveServer";
import { LocalisationService } from "../services/LocalisationService";
import { ProfileFixerService } from "../services/ProfileFixerService";
import { JsonUtil } from "../utils/JsonUtil";
import { InventoryHelper } from "./InventoryHelper";
import { ItemHelper } from "./ItemHelper";
import { PaymentHelper } from "./PaymentHelper";

@injectable()
export class InRaidHelper
{
    protected lostOnDeathConfig: ILostOnDeathConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ProfileFixerService") protected profileFixerService: ProfileFixerService,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.lostOnDeathConfig = this.configServer.getConfig(ConfigTypes.LOST_ON_DEATH);
    }

    /**
     * Should quest items be removed from player inventory on death
     * @returns True if items should be removed from inventory
     */
    public removeQuestItemsOnDeath(): boolean
    {
        return this.lostOnDeathConfig.questItems;
    }

    /**
     * Check an array of items and add an upd object to money items with a stack count of 1
     * Single stack money items have no upd object and thus no StackObjectsCount, causing issues
     * @param items Items array to check
     */
    public addUpdToMoneyFromRaid(items: Item[]): void
    {
        for (const item of items)
        {
            if (this.paymentHelper.isMoneyTpl(item._tpl))
            {
                if (!item.upd)
                {
                    item.upd = {};
                }

                if (!item.upd.StackObjectsCount)
                {
                    item.upd.StackObjectsCount = 1;
                }
            }
        }
    }

    /**
     * Add karma changes up and return the new value
     * @param existingFenceStanding Current fence standing level
     * @param victims Array of kills player performed
     * @returns adjusted karma level after kills are taken into account
     */
    public calculateFenceStandingChangeFromKills(existingFenceStanding: number, victims: Victim[]): number
    {
        const botTypes = this.databaseServer.getTables().bots.types;
        for (const victim of victims)
        {
            let standingForKill = null;
            if (victim.Side.toLowerCase() === "savage")
            {
                // Scavs and bosses
                standingForKill = botTypes[victim.Role.toLowerCase()].experience.standingForKill;
            }
            else
            {
                // PMCs
                standingForKill = botTypes[victim.Side.toLowerCase()].experience.standingForKill;
            }

            if (standingForKill)
            {
                existingFenceStanding += standingForKill;
            }
            else
            {
                this.logger.warning(this.localisationService.getText("inraid-missing_standing_for_kill", {victimSide: victim.Side, victimRole: victim.Role}));
            }
        }

        return existingFenceStanding;
    }

    /**
     * Reset a profile to a baseline, used post-raid
     * Reset points earned during session property
     * Increment exp
     * Remove Labs keycard
     * @param profileData Profile to update
     * @param saveProgressRequest post raid save data request data
     * @param sessionID Session id
     * @returns Reset profile object
     */
    public updateProfileBaseStats(profileData: IPmcData, saveProgressRequest: ISaveProgressRequestData, sessionID: string): IPmcData
    {
        // remove old skill fatigue
        for (const skill of saveProgressRequest.profile.Skills.Common)
        {
            skill.PointsEarnedDuringSession = 0.0;
        }

        // set profile data
        profileData.Info.Level = saveProgressRequest.profile.Info.Level;
        profileData.Skills = saveProgressRequest.profile.Skills;
        profileData.Stats = saveProgressRequest.profile.Stats;
        profileData.Encyclopedia = saveProgressRequest.profile.Encyclopedia;
        profileData.ConditionCounters = saveProgressRequest.profile.ConditionCounters;
        profileData.Quests = saveProgressRequest.profile.Quests;

        // Transfer effects from request to profile
        this.transferPostRaidLimbEffectsToProfile(saveProgressRequest, profileData);

        profileData.SurvivorClass = saveProgressRequest.profile.SurvivorClass;

        // add experience points
        profileData.Info.Experience += profileData.Stats.TotalSessionExperience;
        profileData.Stats.TotalSessionExperience = 0;

        // Remove the Lab card
        this.removeMapAccessKey(saveProgressRequest, sessionID);

        this.setPlayerInRaidLocationStatusToNone(sessionID);

        if (!saveProgressRequest.isPlayerScav)
        {
            this.profileFixerService.checkForAndFixPmcProfileIssues(profileData);
        }

        return profileData;
    }

    /**
     * Take body part effects from client profile and apply to server profile
     * @param saveProgressRequest post-raid request
     * @param profileData player profile on server
     */
    protected transferPostRaidLimbEffectsToProfile(saveProgressRequest: ISaveProgressRequestData, profileData: IPmcData): void
    {
        // Iterate over each body part
        for (const bodyPartId in saveProgressRequest.profile.Health.BodyParts)
        {
            // Get effects on body part from profile
            const bodyPartEffects = saveProgressRequest.profile.Health.BodyParts[bodyPartId].Effects;
            for (const effect in bodyPartEffects)
            {
                const effectDetails = bodyPartEffects[effect];

                // Null guard
                if (!profileData.Health.BodyParts[bodyPartId].Effects)
                {
                    profileData.Health.BodyParts[bodyPartId].Effects = {};
                }

                // Already exists on server profile, skip
                const profileBodyPartEffects = profileData.Health.BodyParts[bodyPartId].Effects;
                if (profileBodyPartEffects[effect])
                {
                    continue;
                }

                // Add effect to server profile
                profileBodyPartEffects[effect] = {Time: effectDetails.Time ?? -1};
            }
        }
    }

    /**
     * Some maps have one-time-use keys (e.g. Labs
     * Remove the relevant key from an inventory based on the post-raid request data passed in
     * @param offraidData post-raid data
     * @param sessionID Session id
     */
    protected removeMapAccessKey(offraidData: ISaveProgressRequestData, sessionID: string): void
    {
        const locationName = this.saveServer.getProfile(sessionID).inraid.location.toLowerCase();
        const mapKey = this.databaseServer.getTables().locations[locationName].base.AccessKeys[0];

        if (!mapKey)
        {
            return;
        }

        for (const item of offraidData.profile.Inventory.items)
        {
            if (item._tpl === mapKey && item.slotId.toLowerCase() !== "hideout")
            {
                this.inventoryHelper.removeItem(offraidData.profile, item._id, sessionID);
                break;
            }
        }
    }

    /**
     * Set the SPT inraid location Profile property to 'none'
     * @param sessionID Session id
     */
    protected setPlayerInRaidLocationStatusToNone(sessionID: string): void
    {
        this.saveServer.getProfile(sessionID).inraid.location = "none";
    }

    /**
     * Adds SpawnedInSession property to items found in a raid
     * Removes SpawnedInSession for non-scav players if item was taken into raid with SpawnedInSession = true
     * @param preRaidProfile profile to update
     * @param postRaidProfile profile to update inventory contents of
     * @param isPlayerScav Was this a p scav raid
     * @returns
     */
    public addSpawnedInSessionPropertyToItems(preRaidProfile: IPmcData, postRaidProfile: IPmcData, isPlayerScav: boolean): IPmcData
    {
        for (const item of postRaidProfile.Inventory.items)
        {
            if (!isPlayerScav)
            {
                const itemExistsInProfile = preRaidProfile.Inventory.items.find((itemData) => item._id === itemData._id);
                if (itemExistsInProfile)
                {
                    if ("upd" in item && "SpawnedInSession" in item.upd)
                    {
                        // if the item exists and is taken inside the raid, remove the taken in raid status
                        delete item.upd.SpawnedInSession;
                    }

                    continue;
                }
            }

            if ("upd" in item)
            {
                item.upd.SpawnedInSession = true;
            }
            else
            {
                item.upd = { SpawnedInSession: true };
            }
        }

        return postRaidProfile;
    }

    /**
     * Iterate over inventory items and remove the property that defines an item as Found in Raid
     * Only removes property if item had FiR when entering raid
     * @param postRaidProfile profile to update items for
     * @returns Updated profile with SpawnedInSession removed
     */
    public removeSpawnedInSessionPropertyFromItems(postRaidProfile: IPmcData): IPmcData
    {
        const items = this.databaseServer.getTables().templates.items;
        for (const offraidItem of postRaidProfile.Inventory.items)
        {
            // Remove the FIR status if the item marked FIR at raid start
            if ("upd" in offraidItem && "SpawnedInSession" in offraidItem.upd && !items[offraidItem._tpl]._props.QuestItem)
            {
                delete offraidItem.upd.SpawnedInSession;
            }
        }

        return postRaidProfile;
    }

    /**
     * Update a players inventory post-raid
     * Remove equipped items from pre-raid
     * Add new items found in raid to profile
     * Store insurance items in profile
     * @param sessionID Session id
     * @param pmcData Profile to update
     * @param postRaidProfile Profile returned by client after a raid
     * @returns Updated profile
     */
    public setInventory(sessionID: string, pmcData: IPmcData, postRaidProfile: IPmcData): IPmcData
    {
        // store insurance (as removeItem removes insurance also)
        const insured = this.jsonUtil.clone(pmcData.InsuredItems);

        // remove possible equipped items from before the raid
        this.inventoryHelper.removeItem(pmcData, pmcData.Inventory.equipment, sessionID);
        this.inventoryHelper.removeItem(pmcData, pmcData.Inventory.questRaidItems, sessionID);
        this.inventoryHelper.removeItem(pmcData, pmcData.Inventory.sortingTable, sessionID);

        // add the new items
        pmcData.Inventory.items = [...postRaidProfile.Inventory.items, ...pmcData.Inventory.items];
        pmcData.Inventory.fastPanel = postRaidProfile.Inventory.fastPanel;
        pmcData.InsuredItems = insured;

        return pmcData;
    }

    /**
     * Clear pmc inventory of all items except those that are exempt
     * Used post-raid to remove items after death
     * @param pmcData Player profile
     * @param sessionID Session id
     */
    public deleteInventory(pmcData: IPmcData, sessionID: string): void
    {
        const toDelete = [];
        for (const item of pmcData.Inventory.items)
        {
            if (this.isItemKeptAfterDeath(pmcData, item))
            {
                continue;
            }

            // Remove normal items or quest raid items
            if (item.parentId === pmcData.Inventory.equipment
                || item.parentId === pmcData.Inventory.questRaidItems)
            {
                toDelete.push(item._id);
            }

            if (item.slotId.startsWith("pocket"))
            {
                toDelete.push(item._id);
            }
        }

        // Delete items flagged above
        for (const item of toDelete)
        {
            this.inventoryHelper.removeItem(pmcData, item, sessionID);
        }

        pmcData.Inventory.fastPanel = {};
    }

    /**
     * Get items in vest/pocket/backpack inventory containers (excluding children)
     * @param pmcData Player profile
     * @returns Item array
     */
    protected getBaseItemsInRigPocketAndBackpack(pmcData: IPmcData): Item[]
    {
        const rig = pmcData.Inventory.items.find(x => x.slotId === "TacticalVest");
        const pockets = pmcData.Inventory.items.find(x => x.slotId === "Pockets");
        const backpack = pmcData.Inventory.items.find(x => x.slotId === "Backpack");

        const baseItemsInRig = pmcData.Inventory.items.filter(x => x.parentId === rig?._id);
        const baseItemsInPockets = pmcData.Inventory.items.filter(x => x.parentId === pockets?._id);
        const baseItemsInBackpack = pmcData.Inventory.items.filter(x => x.parentId === backpack?._id);

        return [...baseItemsInRig, ...baseItemsInPockets, ...baseItemsInBackpack];
    }

    /**
     * Does the provided items slotId mean its kept on the player after death
     * @pmcData Player profile
     * @itemToCheck Item to check should be kept
     * @returns true if item is kept after death
     */
    protected isItemKeptAfterDeath(pmcData: IPmcData, itemToCheck: Item): boolean
    {
        // No parentid means its a base inventory item, always keep
        if (!itemToCheck.parentId)
        {
            return true;
        }

        // Is item equipped on player
        if (itemToCheck.parentId === pmcData.Inventory.equipment)
        {
            // Check slot id against config, true = delete, false = keep, undefined = delete
            const discard = this.lostOnDeathConfig.equipment[itemToCheck.slotId];
            if (discard === undefined)
            {
                return false;
            }

            return !discard;
        }

        // Is quest item + quest item not lost on death
        if (!this.lostOnDeathConfig.questItems && itemToCheck.parentId === pmcData.Inventory.questRaidItems)
        {
            return true;
        }

        // special slots are always kept after death
        if (itemToCheck.slotId?.includes("SpecialSlot") && this.lostOnDeathConfig.specialSlotItems)
        {
            return true;
        }

        return false;
    }

    /**
     * Return the equipped items from a players inventory
     * @param items Players inventory to search through
     * @returns an array of equipped items
     */
    public getPlayerGear(items: Item[]): Item[]
    {
        // Player Slots we care about
        const inventorySlots = [
            "FirstPrimaryWeapon",
            "SecondPrimaryWeapon",
            "Holster",
            "Scabbard",
            "Compass",
            "Headwear",
            "Earpiece",
            "Eyewear",
            "FaceCover",
            "ArmBand",
            "ArmorVest",
            "TacticalVest",
            "Backpack",
            "pocket1",
            "pocket2",
            "pocket3",
            "pocket4",
            "SecuredContainer"
        ];

        let inventoryItems: Item[] = [];

        // Get an array of root player items
        for (const item of items)
        {
            if (inventorySlots.includes(item.slotId))
            {
                inventoryItems.push(item);
            }
        }

        // Loop through these items and get all of their children
        let newItems = inventoryItems;
        while (newItems.length > 0)
        {
            const foundItems = [];

            for (const item of newItems)
            {
                // Find children of this item
                for (const newItem of items)
                {
                    if (newItem.parentId === item._id)
                    {
                        foundItems.push(newItem);
                    }
                }
            }

            // Add these new found items to our list of inventory items
            inventoryItems = [
                ...inventoryItems,
                ...foundItems
            ];

            // Now find the children of these items
            newItems = foundItems;
        }

        return inventoryItems;
    }
}