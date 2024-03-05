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
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";
import { ProfileHelper } from "./ProfileHelper";

@injectable()
export class InRaidHelper
{
    protected lostOnDeathConfig: ILostOnDeathConfig;
    protected inRaidConfig: IInRaidConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ProfileFixerService") protected profileFixerService: ProfileFixerService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
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
        for (const item of items.filter((x) => this.paymentHelper.isMoneyTpl(x._tpl)))
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

    /**
     * Add karma changes up and return the new value
     * @param existingFenceStanding Current fence standing level
     * @param victims Array of kills player performed
     * @returns adjusted karma level after kills are taken into account
     */
    public calculateFenceStandingChangeFromKillsAsScav(existingFenceStanding: number, victims: Victim[]): number
    {
        // Run callback on every victim, adding up the standings gained/lossed, starting value is existing fence standing
        let fenceStanding = existingFenceStanding;
        for (const victim of victims)
        {
            let standingChangeForKill = this.getFenceStandingChangeForKillAsScav(victim);
            if (standingChangeForKill === 0)
            {
                // Nothing to do, skip
                continue;
            }
            if (victim.Name?.includes(")") && victim.Side === "Savage")
            {
                // Make value positive if traitor scav
                standingChangeForKill = Math.abs(standingChangeForKill);
            }

            const additionalLossForKill = this.getAdditionalLossForKill(fenceStanding, standingChangeForKill);

            this.logger.warning(`rep change: ${standingChangeForKill} - additional: ${additionalLossForKill}`);
            fenceStanding += standingChangeForKill + additionalLossForKill;
        }

        return fenceStanding;
    }

    protected getAdditionalLossForKill(fenceStanding: number, repChangeForKill: number): number
    {
        // No loss for kill, skip
        if (repChangeForKill >= 0)
        {
            return 0;
        }

        // Over 8, big penalty
        if (fenceStanding > 8)
        {
            return -2.0;
        }

        // Fence rep is between 6 and 8, appy additional penalty
        if (fenceStanding >= 6)
        {
            return -1;
        }

        // No additional penalty
        return 0;
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
            let standing = botTypes[victim.Role.toLowerCase()]?.experience?.standingForKill;
            if (standing === undefined)
            {
                this.logger.warning(
                    `Unable to find standing for kill for: ${victim.Role}, side: ${victim.Side}, setting to: 0`,
                );
                standing = 0;
            }

            // Scavs and bosses
            return standing;
        }

        // PMCs - get by bear/usec
        let pmcStandingForKill = botTypes[victim.Side.toLowerCase()]?.experience?.standingForKill;
        const pmcKillProbabilityForScavGain = this.inRaidConfig.pmcKillProbabilityForScavGain;

        if (this.randomUtil.rollForChanceProbability(pmcKillProbabilityForScavGain))
        {
            pmcStandingForKill += this.inRaidConfig.scavExtractGain;
        }

        return pmcStandingForKill;
    }

    /**
     * Reset a profile to a baseline, used post-raid
     * Reset points earned during session property
     * Increment exp
     * @param profileData Profile to update
     * @param saveProgressRequest post raid save data request data
     * @param sessionID Session id
     * @returns Reset profile object
     */
    public updateProfileBaseStats(
        profileData: IPmcData,
        saveProgressRequest: ISaveProgressRequestData,
        sessionID: string,
    ): void
    {
        // Remove skill fatigue values
        this.resetSkillPointsEarnedDuringRaid(saveProgressRequest.profile);

        // Set profile data
        profileData.Info.Level = saveProgressRequest.profile.Info.Level;
        profileData.Skills = saveProgressRequest.profile.Skills;
        profileData.Stats.Eft = saveProgressRequest.profile.Stats.Eft;

        profileData.Encyclopedia = saveProgressRequest.profile.Encyclopedia;
        profileData.TaskConditionCounters = saveProgressRequest.profile.TaskConditionCounters;

        this.validateTaskConditionCounters(saveProgressRequest, profileData);

        profileData.SurvivorClass = saveProgressRequest.profile.SurvivorClass;

        // Add experience points
        profileData.Info.Experience += profileData.Stats.Eft.TotalSessionExperience;
        profileData.Stats.Eft.TotalSessionExperience = 0;

        this.setPlayerInRaidLocationStatusToNone(sessionID);
    }

    /**
     * Reset the skill points earned in a raid to 0, ready for next raid
     * @param profile Profile to update
     */
    protected resetSkillPointsEarnedDuringRaid(profile: IPmcData): void
    {
        for (const skill of profile.Skills.Common)
        {
            skill.PointsEarnedDuringSession = 0.0;
        }
    }

    /** Check counters are correct in profile */
    protected validateTaskConditionCounters(saveProgressRequest: ISaveProgressRequestData, profileData: IPmcData): void
    {
        for (const backendCounterKey in saveProgressRequest.profile.TaskConditionCounters)
        {
            // Skip counters with no id
            if (!saveProgressRequest.profile.TaskConditionCounters[backendCounterKey].id)
            {
                continue;
            }

            const postRaidValue = saveProgressRequest.profile.TaskConditionCounters[backendCounterKey]?.value;
            if (typeof postRaidValue === "undefined")
            {
                // No value, skip
                continue;
            }

            const matchingPreRaidCounter = profileData.TaskConditionCounters[backendCounterKey];
            if (!matchingPreRaidCounter)
            {
                this.logger.error(`TaskConditionCounters: ${backendCounterKey} cannot be found in pre-raid data`);

                continue;
            }

            if (matchingPreRaidCounter.value !== postRaidValue)
            {
                this.logger.error(
                    `TaskConditionCounters: ${backendCounterKey} value is different post raid, old: ${matchingPreRaidCounter.value} new: ${postRaidValue}`,
                );
            }
        }
    }

    /**
     * Update various serverPMC profile values; quests/limb hp/trader standing with values post-raic
     * @param pmcData Server PMC profile
     * @param saveProgressRequest Post-raid request data
     * @param sessionId Session id
     */
    public updatePmcProfileDataPostRaid(
        pmcData: IPmcData,
        saveProgressRequest: ISaveProgressRequestData,
        sessionId: string,
    ): void
    {
        // Process failed quests then copy everything
        this.processAlteredQuests(sessionId, pmcData, pmcData.Quests, saveProgressRequest.profile);
        pmcData.Quests = saveProgressRequest.profile.Quests;

        // No need to do this for scav, old scav is deleted and new one generated
        this.transferPostRaidLimbEffectsToProfile(saveProgressRequest, pmcData);

        // Trader standing only occur on pmc profile, scav kills are handled in handlePostRaidPlayerScavKarmaChanges()
        // Scav client data has standing values of 0 for all traders, DO NOT RUN ON SCAV RAIDS
        this.applyTraderStandingAdjustments(pmcData.TradersInfo, saveProgressRequest.profile.TradersInfo);

        this.updateProfileAchievements(pmcData, saveProgressRequest.profile.Achievements);

        this.profileFixerService.checkForAndFixPmcProfileIssues(pmcData);
    }

    /**
     * Update scav quest values on server profile with updated values post-raid
     * @param scavData Server scav profile
     * @param saveProgressRequest Post-raid request data
     * @param sessionId Session id
     */
    public updateScavProfileDataPostRaid(
        scavData: IPmcData,
        saveProgressRequest: ISaveProgressRequestData,
        sessionId: string,
    ): void
    {
        // Only copy active quests into scav profile // Progress will later to copied over to PMC profile
        const existingActiveQuestIds = scavData.Quests?.filter((x) => x.status !== QuestStatus.AvailableForStart).map((
            x,
        ) => x.qid);
        if (existingActiveQuestIds)
        {
            scavData.Quests = saveProgressRequest.profile.Quests.filter((x) => existingActiveQuestIds.includes(x.qid));
        }

        this.profileFixerService.checkForAndFixScavProfileIssues(scavData);
    }

    /**
     * Look for quests with a status different from what it began the raid with
     * @param sessionId Player id
     * @param pmcData Player profile
     * @param preRaidQuests Quests prior to starting raid
     * @param postRaidProfile Profile sent by client with post-raid quests
     */
    protected processAlteredQuests(
        sessionId: string,
        pmcData: IPmcData,
        preRaidQuests: IQuestStatus[],
        postRaidProfile: IPostRaidPmcData,
    ): void
    {
        // TODO: this may break when locked quests are added to profile but player has completed no quests prior to raid
        if (!preRaidQuests)
        {
            // No quests to compare against, skip
            return;
        }

        // Loop over all quests from post-raid profile
        const newLockedQuests: IQuestStatus[] = [];
        for (const postRaidQuest of postRaidProfile.Quests)
        {
            // postRaidQuest.status has a weird value, need to do some nasty casting to compare it
            const postRaidQuestStatus = <string><unknown>postRaidQuest.status;

            // Find matching pre-raid quest
            const preRaidQuest = preRaidQuests?.find((preRaidQuest) => preRaidQuest.qid === postRaidQuest.qid);
            if (!preRaidQuest)
            {
                // Some traders gives locked quests (LightKeeper) due to time-gating
                if (postRaidQuestStatus === "Locked")
                {
                    // Store new locked quest for future processing
                    newLockedQuests.push(postRaidQuest);
                }

                continue;
            }

            // Already completed/failed before raid, skip
            if ([QuestStatus.Fail, QuestStatus.Success].includes(preRaidQuest.status))
            {
                // Daily quests get their status altered in-raid to "AvailableForStart",
                // Copy pre-raid status to post raid data
                if (preRaidQuest.status === QuestStatus.Success)
                {
                    postRaidQuest.status = QuestStatus.Success;
                }

                if (preRaidQuest.status === QuestStatus.Fail)
                {
                    postRaidQuest.status = QuestStatus.Fail;
                }

                continue;
            }

            // Quest with time-gate has unlocked
            if (
                postRaidQuestStatus === "AvailableAfter" && postRaidQuest.availableAfter <= this.timeUtil.getTimestamp()
            )
            {
                // Flag as ready to complete
                postRaidQuest.status = QuestStatus.AvailableForStart;
                postRaidQuest.statusTimers[QuestStatus.AvailableForStart] = this.timeUtil.getTimestamp();

                this.logger.debug(`Time-locked quest ${postRaidQuest.qid} is now ready to start`);

                continue;
            }

            // Quest failed inside raid
            if (postRaidQuestStatus === "Fail")
            {
                // Send failed message
                const failBody: IFailQuestRequestData = {
                    Action: "QuestFail",
                    qid: postRaidQuest.qid,
                    removeExcessItems: true,
                };
                this.questHelper.failQuest(pmcData, failBody, sessionId);
            }
            // Restartable quests need special actions
            else if (postRaidQuestStatus === "FailRestartable")
            {
                // Does failed quest have requirement to collect items from raid
                const questDbData = this.questHelper.getQuestFromDb(postRaidQuest.qid, pmcData);
                // AvailableForFinish
                const matchingAffFindConditions = questDbData.conditions.AvailableForFinish.filter((condition) =>
                    condition.conditionType === "FindItem"
                );
                const itemsToCollect: string[] = [];
                if (matchingAffFindConditions)
                {
                    // Find all items the failed quest wanted
                    for (const condition of matchingAffFindConditions)
                    {
                        itemsToCollect.push(...condition.target);
                    }
                }

                // Remove quest items from profile as quest has failed and may still be alive
                // Required as restarting the quest from main menu does not remove value from CarriedQuestItems array
                postRaidProfile.Stats.Eft.CarriedQuestItems = postRaidProfile.Stats.Eft.CarriedQuestItems.filter((
                    carriedQuestItem,
                ) => !itemsToCollect.includes(carriedQuestItem));

                // Remove quest item from profile now quest is failed
                // updateProfileBaseStats() has already passed by ref EFT.Stats, all changes applied to postRaid profile also apply to server profile
                for (const itemTpl of itemsToCollect)
                {
                    // Look for sessioncounter and remove it
                    const counterIndex = postRaidProfile.Stats.Eft.SessionCounters.Items.findIndex((x) =>
                        x.Key.includes(itemTpl) && x.Key.includes("LootItem")
                    );
                    if (counterIndex > -1)
                    {
                        postRaidProfile.Stats.Eft.SessionCounters.Items.splice(counterIndex, 1);
                    }

                    // Look for quest item and remove it
                    const inventoryItemIndex = postRaidProfile.Inventory.items.findIndex((x) => x._tpl === itemTpl);
                    if (inventoryItemIndex > -1)
                    {
                        postRaidProfile.Inventory.items.splice(inventoryItemIndex, 1);
                    }
                }

                // Clear out any completed conditions
                postRaidQuest.completedConditions = [];
            }
        }

        // Reclassify time-gated quests as time gated until a specific date
        if (newLockedQuests.length > 0)
        {
            for (const lockedQuest of newLockedQuests)
            {
                // Get the quest from Db
                const dbQuest = this.questHelper.getQuestFromDb(lockedQuest.qid, null);
                if (!dbQuest)
                {
                    this.logger.warning(
                        `Unable to adjust locked quest: ${lockedQuest.qid} as it wasnt found in db. It may not become available later on`,
                    );

                    continue;
                }

                // Find the time requirement in AvailableForStart array (assuming there is one as quest in locked state === its time-gated)
                const afsRequirement = dbQuest.conditions.AvailableForStart.find((x) => x.conditionType === "Quest");
                if (afsRequirement && afsRequirement.availableAfter > 0)
                {
                    // Prereq quest has a wait
                    // Set quest as AvailableAfter and set timer
                    const timestamp = this.timeUtil.getTimestamp() + afsRequirement.availableAfter;
                    lockedQuest.availableAfter = timestamp;
                    lockedQuest.statusTimers.AvailableAfter = timestamp;
                    lockedQuest.status = 9;
                }
            }
        }
    }

    /**
     * Take body part effects from client profile and apply to server profile
     * @param saveProgressRequest post-raid request
     * @param profileData player profile on server
     */
    protected transferPostRaidLimbEffectsToProfile(
        saveProgressRequest: ISaveProgressRequestData,
        profileData: IPmcData,
    ): void
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
                profileBodyPartEffects[effect] = { Time: effectDetails.Time ?? -1 };
            }
        }
    }

    /**
     * Adjust server trader settings if they differ from data sent by client
     * @param tradersServerProfile Server
     * @param tradersClientProfile Client
     */
    protected applyTraderStandingAdjustments(
        tradersServerProfile: Record<string, TraderInfo>,
        tradersClientProfile: Record<string, TraderInfo>,
    ): void
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
     * Transfer client achievements into profile
     * @param profile Player pmc profile
     * @param clientAchievements Achievements from client
     */
    protected updateProfileAchievements(profile: IPmcData, clientAchievements: Record<string, number>): void
    {
        if (!profile.Achievements)
        {
            profile.Achievements = {};
        }

        for (const achievementId in clientAchievements)
        {
            profile.Achievements[achievementId] = clientAchievements[achievementId];
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
        const itemsToRemovePropertyFrom = postRaidProfile.Inventory.items.filter((x) =>
        {
            // Has upd object + upd.SpawnedInSession property + not a quest item
            return "upd" in x && "SpawnedInSession" in x.upd
                && !dbItems[x._tpl]._props.QuestItem
                && !(this.inRaidConfig.keepFiRSecureContainerOnDeath
                    && this.itemHelper.itemIsInsideContainer(x, "SecuredContainer", postRaidProfile.Inventory.items));
        });

        for (const item of itemsToRemovePropertyFrom)
        {
            delete item.upd.SpawnedInSession;
        }

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
     */
    public setInventory(sessionID: string, serverProfile: IPmcData, postRaidProfile: IPmcData): void
    {
        // Store insurance (as removeItem() removes insurance also)
        const insured = this.jsonUtil.clone(serverProfile.InsuredItems);

        // Remove possible equipped items from before the raid
        this.inventoryHelper.removeItem(serverProfile, serverProfile.Inventory.equipment, sessionID);
        this.inventoryHelper.removeItem(serverProfile, serverProfile.Inventory.questRaidItems, sessionID);
        this.inventoryHelper.removeItem(serverProfile, serverProfile.Inventory.sortingTable, sessionID);

        // Add the new items
        serverProfile.Inventory.items = [...postRaidProfile.Inventory.items, ...serverProfile.Inventory.items];
        serverProfile.Inventory.fastPanel = postRaidProfile.Inventory.fastPanel; // Quick access items bar
        serverProfile.InsuredItems = insured;
    }

    /**
     * Clear PMC inventory of all items except those that are exempt
     * Used post-raid to remove items after death
     * @param pmcData Player profile
     * @param sessionId Session id
     */
    public deleteInventory(pmcData: IPmcData, sessionId: string): void
    {
        // Get inventory item ids to remove from players profile
        const itemIdsToDeleteFromProfile = this.getInventoryItemsLostOnDeath(pmcData).map((item) => item._id);
        for (const itemIdToDelete of itemIdsToDeleteFromProfile)
        {
            // Items inside containers are handled as part of function
            this.inventoryHelper.removeItem(pmcData, itemIdToDelete, sessionId);
        }

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
        const equipmentRootId = pmcProfile?.Inventory?.equipment;
        const questRaidItemContainerId = pmcProfile?.Inventory?.questRaidItems;

        return inventoryItems.filter((item) =>
        {
            // Keep items flagged as kept after death
            if (this.isItemKeptAfterDeath(pmcProfile, item))
            {
                return false;
            }

            // Remove normal items or quest raid items
            if (item.parentId === equipmentRootId || item.parentId === questRaidItemContainerId)
            {
                return true;
            }

            // Pocket items are lost on death
            if (item.slotId.startsWith("pocket"))
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
        const rig = pmcData.Inventory.items.find((x) => x.slotId === "TacticalVest");
        const pockets = pmcData.Inventory.items.find((x) => x.slotId === "Pockets");
        const backpack = pmcData.Inventory.items.find((x) => x.slotId === "Backpack");

        const baseItemsInRig = pmcData.Inventory.items.filter((x) => x.parentId === rig?._id);
        const baseItemsInPockets = pmcData.Inventory.items.filter((x) => x.parentId === pockets?._id);
        const baseItemsInBackpack = pmcData.Inventory.items.filter((x) => x.parentId === backpack?._id);

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
        // Use pocket slotId's otherwise it deletes the root pocket item.
        const pocketSlots = ["pocket1", "pocket2", "pocket3", "pocket4"];

        // No parentId = base inventory item, always keep
        if (!itemToCheck.parentId)
        {
            return true;
        }

        // Is item equipped on player
        if (itemToCheck.parentId === pmcData.Inventory.equipment)
        {
            // Check slot id against config, true = delete, false = keep, undefined = delete
            const discard: boolean = this.lostOnDeathConfig.equipment[itemToCheck.slotId];
            if (typeof discard === "boolean" && discard === true)
            {
                // Lost on death
                return false;
            }

            return true;
        }

        // Should we keep items in pockets on death
        if (!this.lostOnDeathConfig.equipment.PocketItems && pocketSlots.includes(itemToCheck.slotId))
        {
            return true;
        }

        // Is quest item + quest item not lost on death
        if (itemToCheck.parentId === pmcData.Inventory.questRaidItems && !this.lostOnDeathConfig.questItems)
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
            "SpecialSlot1",
            "SpecialSlot2",
            "SpecialSlot3",
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
            inventoryItems = [...inventoryItems, ...foundItems];

            // Now find the children of these items
            newItems = foundItems;
        }

        return inventoryItems;
    }
}
