import { inject, injectable } from "tsyringe";

import { InventoryHelper } from "@spt-aki/helpers/InventoryHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { PaymentHelper } from "@spt-aki/helpers/PaymentHelper";
import { QuestHelper } from "@spt-aki/helpers/QuestHelper";
import { IPmcData, IPostRaidPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IQuestStatus, TraderInfo, Victim } from "@spt-aki/models/eft/common/tables/IBotBase";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { ISaveProgressRequestData } from "@spt-aki/models/eft/inRaid/ISaveProgressRequestData";
import { IFailQuestRequestData } from "@spt-aki/models/eft/quests/IFailQuestRequestData";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { QuestStatus } from "@spt-aki/models/enums/QuestStatus";
import { Traders } from "@spt-aki/models/enums/Traders";
import { IInRaidConfig } from "@spt-aki/models/spt/config/IInRaidConfig";
import { ILostOnDeathConfig } from "@spt-aki/models/spt/config/ILostOnDeathConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { ProfileFixerService } from "@spt-aki/services/ProfileFixerService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";

@injectable()
export class InRaidHelper
{
    protected lostOnDeathConfig: ILostOnDeathConfig;
    protected inRaidConfig: IInRaidConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ProfileFixerService") protected profileFixerService: ProfileFixerService,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.lostOnDeathConfig = this.configServer.getConfig(ConfigTypes.LOST_ON_DEATH);
        this.inRaidConfig = this.configServer.getConfig(ConfigTypes.IN_RAID);
    }

    /**
     * Lookup quest item loss from lostOnDeath config
     * @returns True if items should be removed from inventory
     */
    public removeQuestItemsOnDeath(): boolean
    {
        return this.lostOnDeathConfig.questItems;
    }

    /**
     * Check items array and add an upd object to money with a stack count of 1
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
        // Run callback on every victim, adding up the standings gained/lossed, starting value is existing fence standing
        const newFenceStanding = victims.reduce((acc, victim) =>
        {
            const standingForKill = this.getFenceStandingChangeForKillAsScav(victim);
            if (standingForKill)
            {
                return acc + standingForKill;
            }
            this.logger.warning(this.localisationService.getText("inraid-missing_standing_for_kill", {victimSide: victim.Side, victimRole: victim.Role}));
            
            return acc;
        }, existingFenceStanding);

        return newFenceStanding;
    }

    /**
     * Get the standing gain/loss for killing an npc
     * @param victim Who was killed by player
     * @returns a numerical standing gain or loss
     */
    protected getFenceStandingChangeForKillAsScav(victim: Victim): number
    {
        const botTypes = this.databaseServer.getTables().bots.types;
        if (victim.Side.toLowerCase() === "savage")
        {
            // Scavs and bosses
            return botTypes[victim.Role.toLowerCase()]?.experience?.standingForKill;
        }
        
        // PMCs - get by bear/usec
        return botTypes[victim.Side.toLowerCase()]?.experience?.standingForKill;
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
        this.resetSkillPointsEarnedDuringRaid(saveProgressRequest.profile);

        // set profile data
        profileData.Info.Level = saveProgressRequest.profile.Info.Level;
        profileData.Skills = saveProgressRequest.profile.Skills;
        profileData.Stats.Eft = saveProgressRequest.profile.Stats.Eft;
        profileData.Encyclopedia = saveProgressRequest.profile.Encyclopedia;
        profileData.ConditionCounters = saveProgressRequest.profile.ConditionCounters;

        for (const backendCounterKey in saveProgressRequest.profile.BackendCounters)
        {
            // Skip counters with no id
            if (!saveProgressRequest.profile.BackendCounters[backendCounterKey].id)
            {
                continue;
            }

            const matchingPreRaidCounter = profileData.BackendCounters[backendCounterKey];
            if (!matchingPreRaidCounter)
            {
                this.logger.error(`Backendcounter: ${backendCounterKey} cannot be found in pre-raid data`);

                continue;
            }

            if (matchingPreRaidCounter.value !== saveProgressRequest.profile.BackendCounters[backendCounterKey].value)
            {
                this.logger.error(`Backendcounter: ${backendCounterKey} value is different post raid, old: ${matchingPreRaidCounter.value} new: ${saveProgressRequest.profile.BackendCounters[backendCounterKey].value}`);
            }
        }

        this.processFailedQuests(sessionID, profileData, profileData.Quests, saveProgressRequest.profile.Quests);
        profileData.Quests = saveProgressRequest.profile.Quests;

        // Transfer effects from request to profile
        this.transferPostRaidLimbEffectsToProfile(saveProgressRequest, profileData);

        this.applyTraderStandingAdjustments(profileData.TradersInfo, saveProgressRequest.profile.TradersInfo);

        profileData.SurvivorClass = saveProgressRequest.profile.SurvivorClass;

        // Add experience points
        profileData.Info.Experience += profileData.Stats.Eft.TotalSessionExperience;
        profileData.Stats.Eft.TotalSessionExperience = 0;

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
     * Look for quests not are now status = fail that were not failed pre-raid and run the failQuest() function
     * @param sessionId Player id
     * @param pmcData Player profile
     * @param preRaidQuests Quests prior to starting raid
     * @param postRaidQuests Quest after raid
     */
    protected processFailedQuests(sessionId: string, pmcData: IPmcData, preRaidQuests: IQuestStatus[], postRaidQuests: IQuestStatus[]): void
    {
        if (!preRaidQuests)
        {
            // No quests to compare against, skip
            return;
        }

        // Loop over all quests from post-raid profile
        for (const postRaidQuest of postRaidQuests)
        {
            // Find matching pre-raid quest
            const preRaidQuest = preRaidQuests?.find(x => x.qid === postRaidQuest.qid);
            if (preRaidQuest)
            {
                // Post-raid quest is failed but wasn't pre-raid
                // postRaidQuest.status has a weird value, need to do some nasty casting to compare it
                if (<string><unknown>postRaidQuest.status === "Fail" && preRaidQuest.status !== QuestStatus.Fail)
                {
                    // Send failed message
                    const failBody: IFailQuestRequestData = {
                        Action: "QuestComplete",
                        qid: postRaidQuest.qid,
                        removeExcessItems: true
                    };
                    this.questHelper.failQuest(pmcData, failBody, sessionId);
                }
            }

        }
    }

    protected resetSkillPointsEarnedDuringRaid(profile: IPmcData): void
    {
        for (const skill of profile.Skills.Common)
        {
            skill.PointsEarnedDuringSession = 0.0;
        }
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
     * Adjust server trader settings if they differ from data sent by client
     * @param tradersServerProfile Server
     * @param tradersClientProfile Client
     */
    protected applyTraderStandingAdjustments(tradersServerProfile: Record<string, TraderInfo>, tradersClientProfile: Record<string, TraderInfo>): void
    {
        for (const traderId in tradersClientProfile)
        {
            if (traderId === Traders.FENCE)
            {
                // Taking a car extract adjusts fence rep values via client/match/offline/end, skip fence for this check
                continue;
            }

            const serverProfileTrader = tradersServerProfile[traderId];
            const clientProfileTrader = tradersClientProfile[traderId];
            if (!(serverProfileTrader && clientProfileTrader))
            {
                continue;
            }

            if (clientProfileTrader.standing !== serverProfileTrader.standing)
            {
                // Difference found, update server profile with values from client profile
                tradersServerProfile[traderId].standing = clientProfileTrader.standing;
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
     * Iterate over inventory items and remove the property that defines an item as Found in Raid
     * Only removes property if item had FiR when entering raid
     * @param postRaidProfile profile to update items for
     * @returns Updated profile with SpawnedInSession removed
     */
    public removeSpawnedInSessionPropertyFromItems(postRaidProfile: IPostRaidPmcData): IPostRaidPmcData
    {
        const dbItems = this.databaseServer.getTables().templates.items;
        const itemsToRemovePropertyFrom = postRaidProfile.Inventory.items.filter(x =>
        {
            // Has upd object + upd.SpawnedInSession property + not a quest item
            return "upd" in x && "SpawnedInSession" in x.upd
                && !dbItems[x._tpl]._props.QuestItem
                && !(this.inRaidConfig.keepFiRSecureContainerOnDeath && this.itemHelper.itemIsInsideContainer(x, "SecuredContainer", postRaidProfile.Inventory.items));
        });

        itemsToRemovePropertyFrom.forEach(item =>
        {
            delete item.upd.SpawnedInSession;
        });

        return postRaidProfile;
    }

    /**
     * Update a players inventory post-raid
     * Remove equipped items from pre-raid
     * Add new items found in raid to profile
     * Store insurance items in profile
     * @param sessionID Session id
     * @param serverProfile Profile to update
     * @param postRaidProfile Profile returned by client after a raid
     * @returns Updated profile
     */
    public setInventory(sessionID: string, serverProfile: IPmcData, postRaidProfile: IPmcData): IPmcData
    {
        // Store insurance (as removeItem() removes insurance also)
        const insured = this.jsonUtil.clone(serverProfile.InsuredItems);

        // Remove possible equipped items from before the raid
        this.inventoryHelper.removeItem(serverProfile, serverProfile.Inventory.equipment, sessionID);
        this.inventoryHelper.removeItem(serverProfile, serverProfile.Inventory.questRaidItems, sessionID);
        this.inventoryHelper.removeItem(serverProfile, serverProfile.Inventory.sortingTable, sessionID);

        // Add the new items
        serverProfile.Inventory.items = [...postRaidProfile.Inventory.items, ...serverProfile.Inventory.items];
        serverProfile.Inventory.fastPanel = postRaidProfile.Inventory.fastPanel;
        serverProfile.InsuredItems = insured;

        return serverProfile;
    }

    /**
     * Clear pmc inventory of all items except those that are exempt
     * Used post-raid to remove items after death
     * @param pmcData Player profile
     * @param sessionID Session id
     */
    public deleteInventory(pmcData: IPmcData, sessionID: string): void
    {
        // Get inventory item ids to remove from players profile
        const itemIdsToDeleteFromProfile = this.getInventoryItemsLostOnDeath(pmcData).map(x => x._id);
        itemIdsToDeleteFromProfile.forEach(x =>
        {
            this.inventoryHelper.removeItem(pmcData, x, sessionID);
        });

        // Remove contents of fast panel
        pmcData.Inventory.fastPanel = {};
    }

    /**
     * Get an array of items from a profile that will be lost on death
     * @param pmcProfile Profile to get items from
     * @returns Array of items lost on death
     */
    protected getInventoryItemsLostOnDeath(pmcProfile: IPmcData): Item[]
    {
        const inventoryItems = pmcProfile.Inventory.items ?? []; 
        const equipment = pmcProfile?.Inventory?.equipment;
        const questRaidItems = pmcProfile?.Inventory?.questRaidItems;

        return inventoryItems.filter(x =>
        {
            // Keep items flagged as kept after death
            if (this.isItemKeptAfterDeath(pmcProfile, x))
            {
                return false;
            }
    
            // Remove normal items or quest raid items
            if (x.parentId === equipment || x.parentId === questRaidItems)
            {
                return true;
            }
    
            // Pocket items are not lost on death
            if (x.slotId.startsWith("pocket"))
            {
                return true;
            }
    
            return false;
        });
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