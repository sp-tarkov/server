import { inject, injectable } from "tsyringe";

import { HideoutHelper } from "@spt-aki/helpers/HideoutHelper";
import { InventoryHelper } from "@spt-aki/helpers/InventoryHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { TraderHelper } from "@spt-aki/helpers/TraderHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Bonus, HideoutSlot, IQuestStatus } from "@spt-aki/models/eft/common/tables/IBotBase";
import { IHideoutImprovement } from "@spt-aki/models/eft/common/tables/IBotBase";
import { IPmcDataRepeatableQuest, IRepeatableQuest } from "@spt-aki/models/eft/common/tables/IRepeatableQuests";
import { StageBonus } from "@spt-aki/models/eft/hideout/IHideoutArea";
import { IAkiProfile } from "@spt-aki/models/eft/profile/IAkiProfile";
import { AccountTypes } from "@spt-aki/models/enums/AccountTypes";
import { BonusType } from "@spt-aki/models/enums/BonusType";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { HideoutAreas } from "@spt-aki/models/enums/HideoutAreas";
import { QuestStatus } from "@spt-aki/models/enums/QuestStatus";
import { Traders } from "@spt-aki/models/enums/Traders";
import { ICoreConfig } from "@spt-aki/models/spt/config/ICoreConfig";
import { IRagfairConfig } from "@spt-aki/models/spt/config/IRagfairConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";
import { Watermark } from "@spt-aki/utils/Watermark";

@injectable()
export class ProfileFixerService
{
    protected coreConfig: ICoreConfig;
    protected ragfairConfig: IRagfairConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("Watermark") protected watermark: Watermark,
        @inject("HideoutHelper") protected hideoutHelper: HideoutHelper,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
    }

    /**
     * Find issues in the pmc profile data that may cause issues and fix them
     * @param pmcProfile profile to check and fix
     */
    public checkForAndFixPmcProfileIssues(pmcProfile: IPmcData): void
    {
        this.removeDanglingConditionCounters(pmcProfile);
        this.removeDanglingTaskConditionCounters(pmcProfile);
        this.addMissingRepeatableQuestsProperty(pmcProfile);
        this.addLighthouseKeeperIfMissing(pmcProfile);
        this.addUnlockedInfoObjectIfMissing(pmcProfile);
        this.removeOrphanedQuests(pmcProfile);

        if (pmcProfile.Inventory)
        {
            this.addHideoutAreaStashes(pmcProfile);
        }

        if (pmcProfile.Hideout)
        {
            this.migrateImprovements(pmcProfile);
            this.addMissingBonusesProperty(pmcProfile);
            this.addMissingWallImprovements(pmcProfile);
            this.addMissingHideoutWallAreas(pmcProfile);
            this.addMissingGunStandContainerImprovements(pmcProfile);
            this.addMissingHallOfFameContainerImprovements(pmcProfile);
            this.ensureGunStandLevelsMatch(pmcProfile);

            this.removeResourcesFromSlotsInHideoutWithoutLocationIndexValue(pmcProfile);

            this.reorderHideoutAreasWithResouceInputs(pmcProfile);

            if (
                pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.GENERATOR).slots.length
                    < (6
                        + this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.EliteSlots
                            .Generator.Slots)
            )
            {
                this.logger.debug("Updating generator area slots to a size of 6 + hideout management skill");
                this.addEmptyObjectsToHideoutAreaSlots(
                    HideoutAreas.GENERATOR,
                    6
                        + this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.EliteSlots
                            .Generator.Slots,
                    pmcProfile,
                );
            }

            if (
                pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.WATER_COLLECTOR).slots.length
                    < (1
                        + this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.EliteSlots
                            .WaterCollector.Slots)
            )
            {
                this.logger.debug("Updating water collector area slots to a size of 1 + hideout management skill");
                this.addEmptyObjectsToHideoutAreaSlots(
                    HideoutAreas.WATER_COLLECTOR,
                    1
                        + this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.EliteSlots
                            .WaterCollector.Slots,
                    pmcProfile,
                );
            }

            if (
                pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.AIR_FILTERING).slots.length
                    < (3
                        + this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.EliteSlots
                            .AirFilteringUnit.Slots)
            )
            {
                this.logger.debug("Updating air filter area slots to a size of 3 + hideout management skill");
                this.addEmptyObjectsToHideoutAreaSlots(
                    HideoutAreas.AIR_FILTERING,
                    3
                        + this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.EliteSlots
                            .AirFilteringUnit.Slots,
                    pmcProfile,
                );
            }

            // BTC Farm doesnt have extra slots for hideout management, but we still check for modded stuff!!
            if (
                pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.BITCOIN_FARM).slots.length
                    < (50
                        + this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.EliteSlots
                            .BitcoinFarm.Slots)
            )
            {
                this.logger.debug("Updating bitcoin farm area slots to a size of 50 + hideout management skill");
                this.addEmptyObjectsToHideoutAreaSlots(
                    HideoutAreas.BITCOIN_FARM,
                    50
                        + this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.EliteSlots
                            .BitcoinFarm.Slots,
                    pmcProfile,
                );
            }
        }

        this.fixNullTraderSalesSums(pmcProfile);
        this.updateProfileQuestDataValues(pmcProfile);
    }

    /**
     * Find issues in the scav profile data that may cause issues
     * @param scavProfile profile to check and fix
     */
    public checkForAndFixScavProfileIssues(scavProfile: IPmcData): void
    {
        this.updateProfileQuestDataValues(scavProfile);
    }

    protected addMissingGunStandContainerImprovements(pmcProfile: IPmcData): void
    {
        const weaponStandArea = pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.WEAPON_STAND);
        if (!weaponStandArea || weaponStandArea.level === 0)
        {
            // No stand in profile or its level 0, skip
            return;
        }

        const db = this.databaseServer.getTables();
        const hideoutStandAreaDb = db.hideout.areas.find((x) => x.type === HideoutAreas.WEAPON_STAND);
        const hideoutStandSecondaryAreaDb = db.hideout.areas.find((x) => x.parentArea === hideoutStandAreaDb._id);
        const stageCurrentAt = hideoutStandAreaDb.stages[weaponStandArea.level];
        const hideoutStandStashId = pmcProfile.Inventory.hideoutAreaStashes[HideoutAreas.WEAPON_STAND];
        const hideoutSecondaryStashId = pmcProfile.Inventory.hideoutAreaStashes[HideoutAreas.WEAPON_STAND_SECONDARY];

        // `hideoutAreaStashes` empty but profile has built gun stand
        if (!hideoutStandStashId && stageCurrentAt)
        {
            // Value is missing, add it
            pmcProfile.Inventory.hideoutAreaStashes[HideoutAreas.WEAPON_STAND] = hideoutStandAreaDb._id;
            pmcProfile.Inventory.hideoutAreaStashes[HideoutAreas.WEAPON_STAND_SECONDARY] =
                hideoutStandSecondaryAreaDb._id;

            // Add stash item to profile
            const gunStandStashItem = pmcProfile.Inventory.items.find((x) => x._id === hideoutStandAreaDb._id);
            if (gunStandStashItem)
            {
                gunStandStashItem._tpl = stageCurrentAt.container;
                this.logger.debug(
                    `Updated existing gun stand inventory stash: ${gunStandStashItem._id} tpl to ${stageCurrentAt.container}`,
                );
            }
            else
            {
                pmcProfile.Inventory.items.push({ _id: hideoutStandAreaDb._id, _tpl: stageCurrentAt.container });
                this.logger.debug(
                    `Added missing gun stand inventory stash: ${hideoutStandAreaDb._id} tpl to ${stageCurrentAt.container}`,
                );
            }

            // Add secondary stash item to profile
            const gunStandStashSecondaryItem = pmcProfile.Inventory.items.find((x) =>
                x._id === hideoutStandSecondaryAreaDb._id
            );
            if (gunStandStashItem)
            {
                gunStandStashSecondaryItem._tpl = stageCurrentAt.container;
                this.logger.debug(
                    `Updated gun stand existing inventory secondary stash: ${gunStandStashSecondaryItem._id} tpl to ${stageCurrentAt.container}`,
                );
            }
            else
            {
                pmcProfile.Inventory.items.push({
                    _id: hideoutStandSecondaryAreaDb._id,
                    _tpl: stageCurrentAt.container,
                });
                this.logger.debug(
                    `Added missing gun stand inventory secondary stash: ${hideoutStandSecondaryAreaDb._id} tpl to ${stageCurrentAt.container}`,
                );
            }

            return;
        }

        let stashItem = pmcProfile.Inventory.items?.find((x) => x._id === hideoutStandAreaDb._id);
        if (!stashItem)
        {
            // Stand inventory stash item doesnt exist, add it
            pmcProfile.Inventory.items.push({ _id: hideoutStandAreaDb._id, _tpl: stageCurrentAt.container });
            stashItem = pmcProfile.Inventory.items?.find((x) => x._id === hideoutStandAreaDb._id);
        }

        // `hideoutAreaStashes` has value related stash inventory items tpl doesnt match what's expected
        if (hideoutStandStashId && stashItem._tpl !== stageCurrentAt.container)
        {
            this.logger.debug(
                `primary Stash tpl was: ${stashItem._tpl}, but should be ${stageCurrentAt.container}, updating`,
            );
            // The id inside the profile does not match what the hideout db value is, out of sync, adjust
            stashItem._tpl = stageCurrentAt.container;
        }

        let stashSecondaryItem = pmcProfile.Inventory.items?.find((x) => x._id === hideoutStandSecondaryAreaDb._id);
        if (!stashSecondaryItem)
        {
            // Stand inventory stash item doesnt exist, add it
            pmcProfile.Inventory.items.push({ _id: hideoutStandSecondaryAreaDb._id, _tpl: stageCurrentAt.container });
            stashSecondaryItem = pmcProfile.Inventory.items?.find((x) => x._id === hideoutStandSecondaryAreaDb._id);
        }

        // `hideoutAreaStashes` has value related stash inventory items tpl doesnt match what's expected
        if (hideoutSecondaryStashId && stashSecondaryItem?._tpl !== stageCurrentAt.container)
        {
            this.logger.debug(
                `Secondary stash tpl was: ${stashSecondaryItem._tpl}, but should be ${stageCurrentAt.container}, updating`,
            );
            // The id inside the profile does not match what the hideout db value is, out of sync, adjust
            stashSecondaryItem._tpl = stageCurrentAt.container;
        }
    }

    protected addMissingHallOfFameContainerImprovements(pmcProfile: IPmcData): void
    {
        const placeOfFameArea = pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.PLACE_OF_FAME);
        if (!placeOfFameArea || placeOfFameArea.level === 0)
        {
            // No place of fame in profile or its level 0, skip
            return;
        }

        const db = this.databaseServer.getTables();
        const placeOfFameAreaDb = db.hideout.areas.find((x) => x.type === HideoutAreas.PLACE_OF_FAME);
        const stageCurrentlyAt = placeOfFameAreaDb.stages[placeOfFameArea.level];
        const placeOfFameStashId = pmcProfile.Inventory.hideoutAreaStashes[HideoutAreas.PLACE_OF_FAME];

        // `hideoutAreaStashes` empty but profile has built gun stand
        if (!placeOfFameStashId && stageCurrentlyAt)
        {
            // Value is missing, add it
            pmcProfile.Inventory.hideoutAreaStashes[HideoutAreas.PLACE_OF_FAME] = placeOfFameAreaDb._id;

            // Add stash item to profile
            const placeOfFameStashItem = pmcProfile.Inventory.items.find((x) => x._id === placeOfFameAreaDb._id);
            if (placeOfFameStashItem)
            {
                placeOfFameStashItem._tpl = stageCurrentlyAt.container;
                this.logger.debug(
                    `Updated existing place of fame inventory stash: ${placeOfFameStashItem._id} tpl to ${stageCurrentlyAt.container}`,
                );
            }
            else
            {
                pmcProfile.Inventory.items.push({ _id: placeOfFameAreaDb._id, _tpl: stageCurrentlyAt.container });
                this.logger.debug(
                    `Added missing place of fame inventory stash: ${placeOfFameAreaDb._id} tpl to ${stageCurrentlyAt.container}`,
                );
            }

            return;
        }

        let stashItem = pmcProfile.Inventory.items?.find((x) => x._id === placeOfFameAreaDb._id);
        if (!stashItem)
        {
            // Stand inventory stash item doesnt exist, add it
            pmcProfile.Inventory.items.push({ _id: placeOfFameAreaDb._id, _tpl: stageCurrentlyAt.container });
            stashItem = pmcProfile.Inventory.items?.find((x) => x._id === placeOfFameAreaDb._id);
        }

        // `hideoutAreaStashes` has value related stash inventory items tpl doesnt match what's expected
        if (placeOfFameStashId && stashItem._tpl !== stageCurrentlyAt.container)
        {
            this.logger.debug(
                `primary Stash tpl was: ${stashItem._tpl}, but should be ${stageCurrentlyAt.container}, updating`,
            );
            // The id inside the profile does not match what the hideout db value is, out of sync, adjust
            stashItem._tpl = stageCurrentlyAt.container;
        }
    }

    protected ensureGunStandLevelsMatch(pmcProfile: IPmcData): void
    {
        // only proceed if stand is level 1 or above
        const gunStandParent = pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.WEAPON_STAND);
        if (gunStandParent && gunStandParent.level > 0)
        {
            const gunStandChild = pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.WEAPON_STAND_SECONDARY);
            if (gunStandChild && gunStandParent.level !== gunStandChild.level)
            {
                this.logger.success("Upgraded gun stand levels to match");
                gunStandChild.level = gunStandParent.level;
            }
        }
    }

    protected addHideoutAreaStashes(pmcProfile: IPmcData): void
    {
        if (!pmcProfile?.Inventory?.hideoutAreaStashes)
        {
            this.logger.debug("Added missing hideoutAreaStashes to inventory");
            pmcProfile.Inventory.hideoutAreaStashes = {};
        }
    }

    protected addMissingHideoutWallAreas(pmcProfile: IPmcData): void
    {
        if (!pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.WEAPON_STAND))
        {
            pmcProfile.Hideout.Areas.push({
                type: 24,
                level: 0,
                active: true,
                passiveBonusesEnabled: true,
                completeTime: 0,
                constructing: false,
                slots: [],
                lastRecipe: "",
            });
        }

        if (!pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.WEAPON_STAND_SECONDARY))
        {
            pmcProfile.Hideout.Areas.push({
                type: 25,
                level: 0,
                active: true,
                passiveBonusesEnabled: true,
                completeTime: 0,
                constructing: false,
                slots: [],
                lastRecipe: "",
            });
        }
    }

    /**
     * Add tag to profile to indicate when it was made
     * @param fullProfile
     */
    public addMissingAkiVersionTagToProfile(fullProfile: IAkiProfile): void
    {
        if (!fullProfile.aki)
        {
            this.logger.debug("Adding aki object to profile");
            fullProfile.aki = { version: this.watermark.getVersionTag(), receivedGifts: [] };
        }
    }

    /**
     * TODO - make this non-public - currently used by RepeatableQuestController
     * Remove unused condition counters
     * @param pmcProfile profile to remove old counters from
     */
    public removeDanglingConditionCounters(pmcProfile: IPmcData): void
    {
        if (pmcProfile.TaskConditionCounters)
        {
            for (const counterId in pmcProfile.TaskConditionCounters)
            {
                const counter = pmcProfile.TaskConditionCounters[counterId];
                if (!counter.sourceId)
                {
                    delete pmcProfile.TaskConditionCounters[counterId];
                }
            }
        }
    }

    public addLighthouseKeeperIfMissing(pmcProfile: IPmcData): void
    {
        if (!pmcProfile.TradersInfo)
        {
            return;
        }

        // only add if other traders exist, means this is pre-patch 13 profile
        if (!pmcProfile.TradersInfo[Traders.LIGHTHOUSEKEEPER] && Object.keys(pmcProfile.TradersInfo).length > 0)
        {
            this.logger.warning("Added missing Lighthouse keeper trader to pmc profile");
            pmcProfile.TradersInfo[Traders.LIGHTHOUSEKEEPER] = {
                unlocked: false,
                disabled: false,
                salesSum: 0,
                standing: 0.2,
                loyaltyLevel: 1,
                nextResupply: this.timeUtil.getTimestamp() + 3600, // now + 1 hour
            };
        }
    }

    protected addUnlockedInfoObjectIfMissing(pmcProfile: IPmcData): void
    {
        if (!pmcProfile.UnlockedInfo)
        {
            this.logger.debug("Adding UnlockedInfo object to profile");
            pmcProfile.UnlockedInfo = { unlockedProductionRecipe: [] };
        }
    }

    /**
     * Repeatable quests leave behind TaskConditionCounter objects that make the profile bloat with time, remove them
     * @param pmcProfile Player profile to check
     */
    protected removeDanglingTaskConditionCounters(pmcProfile: IPmcData): void
    {
        if (pmcProfile.TaskConditionCounters)
        {
            const taskConditionKeysToRemove: string[] = [];
            const activeRepeatableQuests = this.getActiveRepeatableQuests(pmcProfile.RepeatableQuests);
            const achievements = this.databaseServer.getTables().templates.achievements;

            // Loop over TaskConditionCounters objects and add once we want to remove to counterKeysToRemove
            for (const [key, taskConditionCounter] of Object.entries(pmcProfile.TaskConditionCounters))
            {
                // Only check if profile has repeatable quests
                if (pmcProfile.RepeatableQuests && activeRepeatableQuests.length > 0)
                {
                    const existsInActiveRepeatableQuests = activeRepeatableQuests.some((quest) =>
                        quest._id === taskConditionCounter.sourceId
                    );
                    const existsInQuests = pmcProfile.Quests.some((quest) =>
                        quest.qid === taskConditionCounter.sourceId
                    );
                    const isAchievementTracker = achievements.some((quest) =>
                        quest.id === taskConditionCounter.sourceId
                    );

                    // If task conditions id is neither in activeQuests, quests or achievements - it's stale and should be cleaned up
                    if (!(existsInActiveRepeatableQuests || existsInQuests || isAchievementTracker))
                    {
                        taskConditionKeysToRemove.push(key);
                    }
                }
            }

            for (const counterKeyToRemove of taskConditionKeysToRemove)
            {
                this.logger.debug(`Removed ${counterKeyToRemove} TaskConditionCounter object`);
                delete pmcProfile.TaskConditionCounters[counterKeyToRemove];
            }
        }
    }

    protected getActiveRepeatableQuests(repeatableQuests: IPmcDataRepeatableQuest[]): IRepeatableQuest[]
    {
        let activeQuests = [];
        for (const repeatableQuest of repeatableQuests)
        {
            if (repeatableQuest.activeQuests.length > 0)
            {
                // daily/weekly collection has active quests in them, add to array and return
                activeQuests = activeQuests.concat(repeatableQuest.activeQuests);
            }
        }

        return activeQuests;
    }

    protected fixNullTraderSalesSums(pmcProfile: IPmcData): void
    {
        for (const traderId in pmcProfile.TradersInfo)
        {
            const trader = pmcProfile.TradersInfo[traderId];
            if (trader && trader.salesSum === null)
            {
                this.logger.warning(`trader ${traderId} has a null salesSum value, resetting to 0`);
                trader.salesSum = 0;
            }
        }
    }

    protected addMissingBonusesProperty(pmcProfile: IPmcData): void
    {
        if (typeof pmcProfile.Bonuses === "undefined")
        {
            pmcProfile.Bonuses = [];
            this.logger.debug("Missing Bonuses property added to profile");
        }
    }

    /**
     * Adjust profile quest status and statusTimers object values
     * quest.status is numeric e.g. 2
     * quest.statusTimers keys are numeric as strings e.g. "2"
     * @param profile profile to update
     */
    protected updateProfileQuestDataValues(profile: IPmcData): void
    {
        if (!profile.Quests)
        {
            return;
        }

        const fixes = new Map<any, number>();
        const questsToDelete: IQuestStatus[] = [];
        const fullProfile = this.profileHelper.getFullProfile(profile.sessionId);
        const isDevProfile = fullProfile?.info.edition.toLowerCase() === "spt developer";
        for (const quest of profile.Quests)
        {
            // Old profiles had quests with a bad status of 0 (invalid) added to profile, remove them
            // E.g. compensation for damage showing before standing check was added to getClientQuests()
            if (quest.status === 0 && quest.availableAfter === 0 && !isDevProfile)
            {
                questsToDelete.push(quest);

                continue;
            }

            if (quest.status && !Number(quest.status))
            {
                if (fixes.has(quest.status))
                {
                    fixes.set(quest.status, fixes.get(quest.status) + 1);
                }
                else
                {
                    fixes.set(quest.status, 1);
                }

                const newQuestStatus = QuestStatus[quest.status];
                quest.status = <QuestStatus><unknown>newQuestStatus;

                for (const statusTimer in quest.statusTimers)
                {
                    if (!Number(statusTimer))
                    {
                        const newKey = QuestStatus[statusTimer];
                        quest.statusTimers[newKey] = quest.statusTimers[statusTimer];
                        delete quest.statusTimers[statusTimer];
                    }
                }
            }
        }

        for (const questToDelete of questsToDelete)
        {
            profile.Quests.splice(profile.Quests.indexOf(questToDelete), 1);
        }

        if (fixes.size > 0)
        {
            this.logger.debug(
                `Updated quests values: ${
                    Array.from(fixes.entries()).map(([k, v]) => `(${k}: ${v} times)`).join(", ")
                }`,
            );
        }
    }

    protected addMissingRepeatableQuestsProperty(pmcProfile: IPmcData): void
    {
        if (pmcProfile.RepeatableQuests)
        {
            let repeatablesCompatible = true;
            for (const currentRepeatable of pmcProfile.RepeatableQuests)
            {
                if (
                    !(currentRepeatable.changeRequirement
                        && currentRepeatable.activeQuests.every((
                            x,
                        ) => (typeof x.changeCost !== "undefined" && typeof x.changeStandingCost !== "undefined")))
                )
                {
                    repeatablesCompatible = false;
                    break;
                }
            }
            if (!repeatablesCompatible)
            {
                pmcProfile.RepeatableQuests = [];
                this.logger.debug("Missing RepeatableQuests property added to profile");
            }
        }
        else
        {
            pmcProfile.RepeatableQuests = [];
        }
    }

    /**
     * Some profiles have hideout maxed and therefore no improvements
     * @param pmcProfile Profile to add improvement data to
     */
    protected addMissingWallImprovements(pmcProfile: IPmcData): void
    {
        const profileWallArea = pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.EMERGENCY_WALL);
        const wallDb = this.databaseServer.getTables().hideout.areas.find((x) =>
            x.type === HideoutAreas.EMERGENCY_WALL
        );

        if (profileWallArea.level > 0)
        {
            for (let i = 0; i < profileWallArea.level; i++)
            {
                // Get wall stage from db
                const wallStageDb = wallDb.stages[i];
                if (wallStageDb.improvements.length === 0)
                {
                    // No improvements, skip
                    continue;
                }

                for (const improvement of wallStageDb.improvements)
                {
                    // Don't overwrite existing improvement
                    if (pmcProfile.Hideout.Improvement[improvement.id])
                    {
                        continue;
                    }

                    pmcProfile.Hideout.Improvement[improvement.id] = {
                        completed: true,
                        improveCompleteTimestamp: this.timeUtil.getTimestamp() + i, // add some variability
                    };

                    this.logger.debug(`Added wall improvement ${improvement.id} to profile`);
                }
            }
        }
    }

    /**
     * A new property was added to slot items "locationIndex", if this is missing, the hideout slot item must be removed
     * @param pmcProfile Profile to find and remove slots from
     */
    protected removeResourcesFromSlotsInHideoutWithoutLocationIndexValue(pmcProfile: IPmcData): void
    {
        for (const area of pmcProfile.Hideout.Areas)
        {
            // Skip areas with no resource slots
            if (area.slots.length === 0)
            {
                continue;
            }

            // Only slots with location index
            area.slots = area.slots.filter((x) => "locationIndex" in x);

            // Only slots that:
            // Have an item property and it has at least one item in it
            // Or
            // Have no item property
            area.slots = area.slots.filter((x) => "item" in x && x.item?.length > 0 || !("item" in x));
        }
    }

    /**
     * Hideout slots need to be in a specific order, locationIndex in ascending order
     * @param pmcProfile profile to edit
     */
    protected reorderHideoutAreasWithResouceInputs(pmcProfile: IPmcData): void
    {
        const areasToCheck = [
            HideoutAreas.AIR_FILTERING,
            HideoutAreas.GENERATOR,
            HideoutAreas.BITCOIN_FARM,
            HideoutAreas.WATER_COLLECTOR,
        ];

        for (const areaId of areasToCheck)
        {
            const area = pmcProfile.Hideout.Areas.find((area) => area.type === areaId);
            if (!area)
            {
                this.logger.debug(`unable to sort: ${area.type} (${areaId}) slots, no area found`);
                continue;
            }

            if (!area.slots || area.slots.length === 0)
            {
                this.logger.debug(`unable to sort ${areaId} slots, no slots found`);
                continue;
            }

            area.slots = area.slots.sort((a, b) =>
            {
                return a.locationIndex > b.locationIndex ? 1 : -1;
            });
        }
    }

    /**
     * add in objects equal to the number of slots
     * @param areaType area to check
     * @param pmcProfile profile to update
     */
    protected addEmptyObjectsToHideoutAreaSlots(
        areaType: HideoutAreas,
        emptyItemCount: number,
        pmcProfile: IPmcData,
    ): void
    {
        const area = pmcProfile.Hideout.Areas.find((x) => x.type === areaType);
        area.slots = this.addObjectsToArray(emptyItemCount, area.slots);
    }

    protected addObjectsToArray(count: number, slots: HideoutSlot[]): HideoutSlot[]
    {
        for (let i = 0; i < count; i++)
        {
            if (!slots.find((x) => x.locationIndex === i))
            {
                slots.push({ locationIndex: i });
            }
        }

        return slots;
    }

    /**
     * Iterate over players hideout areas and find what's build, look for missing bonuses those areas give and add them if missing
     * @param pmcProfile Profile to update
     */
    public addMissingHideoutBonusesToProfile(pmcProfile: IPmcData): void
    {
        const profileHideoutAreas = pmcProfile.Hideout.Areas;
        const profileBonuses = pmcProfile.Bonuses;
        const dbHideoutAreas = this.databaseServer.getTables().hideout.areas;

        for (const area of profileHideoutAreas)
        {
            const areaType = area.type;
            const level = area.level;

            if (level === 0)
            {
                continue;
            }

            // Get array of hideout area upgrade levels to check for bonuses
            // Zero indexed
            const areaLevelsToCheck: number[] = [];
            for (let index = 0; index < level + 1; index++)
            {
                areaLevelsToCheck.push(index);
            }

            // Iterate over area levels, check for bonuses, add if needed
            const dbArea = dbHideoutAreas.find((x) => x.type === areaType);
            if (!dbArea)
            {
                continue;
            }

            for (const level of areaLevelsToCheck)
            {
                // Get areas level bonuses from db
                const levelBonuses = dbArea.stages[level]?.bonuses;
                if (!levelBonuses || levelBonuses.length === 0)
                {
                    continue;
                }

                // Iterate over each bonus for the areas level
                for (const bonus of levelBonuses)
                {
                    // Check if profile has bonus
                    const profileBonus = this.getBonusFromProfile(profileBonuses, bonus);
                    if (!profileBonus)
                    {
                        // no bonus, add to profile
                        this.logger.debug(
                            `Profile has level ${level} area ${
                                HideoutAreas[area.type]
                            } but no bonus found, adding ${bonus.type}`,
                        );
                        this.hideoutHelper.applyPlayerUpgradesBonuses(pmcProfile, bonus);
                    }
                }
            }
        }
    }

    /**
     * @param profileBonuses bonuses from profile
     * @param bonus bonus to find
     * @returns matching bonus
     */
    protected getBonusFromProfile(profileBonuses: Bonus[], bonus: StageBonus): Bonus
    {
        // match by id first, used by "TextBonus" bonuses
        if (bonus.id)
        {
            return profileBonuses.find((x) => x.id === bonus.id);
        }

        if (bonus.type === BonusType.STASH_SIZE)
        {
            return profileBonuses.find((x) => x.type === bonus.type && x.templateId === bonus.templateId);
        }

        if (bonus.type === BonusType.ADDITIONAL_SLOTS)
        {
            return profileBonuses.find((x) =>
                x.type === bonus.type && x.value === bonus.value && x.visible === bonus.visible
            );
        }

        return profileBonuses.find((x) => x.type === bonus.type && x.value === bonus.value);
    }

    /**
     * Checks profile inventiory for items that do not exist inside the items db
     * @param sessionId Session id
     * @param pmcProfile Profile to check inventory of
     */
    public checkForOrphanedModdedItems(sessionId: string, fullProfile: IAkiProfile): void
    {
        const itemsDb = this.databaseServer.getTables().templates.items;
        const pmcProfile = fullProfile.characters.pmc;

        // Get items placed in root of stash
        // TODO: extend to other areas / sub items
        const inventoryItemsToCheck = pmcProfile.Inventory.items.filter((x) => ["hideout", "main"].includes(x.slotId));
        if (!inventoryItemsToCheck)
        {
            return;
        }

        // Check each item in inventory to ensure item exists in itemdb
        for (const item of inventoryItemsToCheck)
        {
            if (!itemsDb[item._tpl])
            {
                this.logger.error(this.localisationService.getText("fixer-mod_item_found", item._tpl));

                if (this.coreConfig.fixes.removeModItemsFromProfile)
                {
                    this.logger.success(
                        `Deleting item from inventory and insurance with id: ${item._id} tpl: ${item._tpl}`,
                    );

                    // Also deletes from insured array
                    this.inventoryHelper.removeItem(pmcProfile, item._id, sessionId);
                }
            }
        }

        // Iterate over player-made weapon builds, look for missing items and remove weapon preset if found
        for (const buildId in fullProfile.userbuilds?.weaponBuilds)
        {
            for (const item of fullProfile.userbuilds.weaponBuilds[buildId].Items)
            {
                // Check item exists in itemsDb
                if (!itemsDb[item._tpl])
                {
                    this.logger.error(this.localisationService.getText("fixer-mod_item_found", item._tpl));

                    if (this.coreConfig.fixes.removeModItemsFromProfile)
                    {
                        delete fullProfile.userbuilds.weaponBuilds[buildId];
                        this.logger.warning(
                            `Item: ${item._tpl} has resulted in the deletion of weapon build: ${buildId}`,
                        );
                    }

                    break;
                }
            }
        }

        // Iterate over dialogs, looking for messages with items not found in item db, remove message if item found
        for (const dialogId in fullProfile.dialogues)
        {
            const dialog = fullProfile.dialogues[dialogId];
            if (!dialog?.messages)
            {
                continue; // Skip dialog with no messages
            }

            // Iterate over all messages in dialog
            for (const message of dialog.messages)
            {
                if (!message.items?.data)
                {
                    continue; // Skip message with no items
                }

                // Fix message with no items but have the flags to indicate items to collect
                if (message.items.data.length === 0 && message.hasRewards)
                {
                    message.hasRewards = false;
                    message.rewardCollected = true;
                    continue;
                }

                // Iterate over all items in message
                for (const item of message.items.data)
                {
                    // Check item exists in itemsDb
                    if (!itemsDb[item._tpl])
                    {
                        this.logger.error(this.localisationService.getText("fixer-mod_item_found", item._tpl));

                        if (this.coreConfig.fixes.removeModItemsFromProfile)
                        {
                            dialog.messages.splice(dialog.messages.findIndex((x) => x._id === message._id), 1);
                            this.logger.warning(
                                `Item: ${item._tpl} has resulted in the deletion of message: ${message._id} from dialog ${dialogId}`,
                            );
                        }

                        break;
                    }
                }
            }
        }

        const clothing = this.databaseServer.getTables().templates.customization;
        for (const suitId of fullProfile.suits)
        {
            if (!clothing[suitId])
            {
                this.logger.error(this.localisationService.getText("fixer-mod_item_found", suitId));
                if (this.coreConfig.fixes.removeModItemsFromProfile)
                {
                    fullProfile.suits.splice(fullProfile.suits.indexOf(suitId), 1);
                    this.logger.warning(`Non-default suit purchase: ${suitId} removed from profile`);
                }
            }
        }

        for (const repeatable of fullProfile.characters.pmc.RepeatableQuests ?? [])
        {
            for (const activeQuest of repeatable.activeQuests ?? [])
            {
                if (!this.traderHelper.traderEnumHasValue(activeQuest.traderId))
                {
                    this.logger.error(this.localisationService.getText("fixer-mod_item_found", activeQuest.traderId));
                    if (this.coreConfig.fixes.removeModItemsFromProfile)
                    {
                        this.logger.warning(
                            `Non-default quest: ${activeQuest._id} from trader: ${activeQuest.traderId} removed from RepeatableQuests list in profile`,
                        );
                        repeatable.activeQuests.splice(
                            repeatable.activeQuests.findIndex((x) => x._id === activeQuest._id),
                            1,
                        );
                    }

                    continue;
                }

                for (const successReward of activeQuest.rewards.Success)
                {
                    if (successReward.type === "Item")
                    {
                        for (const rewardItem of successReward.items)
                        {
                            if (!itemsDb[rewardItem._tpl])
                            {
                                this.logger.error(
                                    this.localisationService.getText("fixer-mod_item_found", rewardItem._tpl),
                                );
                                if (this.coreConfig.fixes.removeModItemsFromProfile)
                                {
                                    this.logger.warning(
                                        `Non-default quest: ${activeQuest._id} from trader: ${activeQuest.traderId} removed from RepeatableQuests list in profile`,
                                    );
                                    repeatable.activeQuests.splice(
                                        repeatable.activeQuests.findIndex((x) => x._id === activeQuest._id),
                                        1,
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

        for (const traderId in fullProfile.traderPurchases)
        {
            if (!this.traderHelper.traderEnumHasValue(traderId))
            {
                this.logger.error(this.localisationService.getText("fixer-mod_item_found", traderId));
                if (this.coreConfig.fixes.removeModItemsFromProfile)
                {
                    this.logger.warning(`Non-default trader: ${traderId} removed from traderPurchases list in profile`);
                    delete fullProfile.traderPurchases[traderId];
                }
            }
        }
    }

    /**
     * Attempt to fix common item issues that corrupt profiles
     * @param pmcProfile Profile to check items of
     */
    public fixProfileBreakingInventoryItemIssues(pmcProfile: IPmcData): void
    {
        // Create a mapping of all inventory items, keyed by _id value
        const itemMapping = pmcProfile.Inventory.items.reduce((acc, curr) =>
        {
            acc[curr._id] = acc[curr._id] || [];
            acc[curr._id].push(curr);

            return acc;
        }, {});

        for (const key in itemMapping)
        {
            // Only one item for this id, not a dupe
            if (itemMapping[key].length === 1)
            {
                continue;
            }

            this.logger.warning(`${itemMapping[key].length - 1} duplicate(s) found for item: ${key}`);
            const itemAJson = this.jsonUtil.serialize(itemMapping[key][0]);
            const itemBJson = this.jsonUtil.serialize(itemMapping[key][1]);
            if (itemAJson === itemBJson)
            {
                // Both items match, we can safely delete one
                const indexOfItemToRemove = pmcProfile.Inventory.items.findIndex((x) => x._id === key);
                pmcProfile.Inventory.items.splice(indexOfItemToRemove, 1);
                this.logger.warning(`Deleted duplicate item: ${key}`);
            }
            else
            {
                // Items are different, replace ID with unique value
                // Only replace ID if items have no children, we dont want orphaned children
                const itemsHaveChildren = pmcProfile.Inventory.items.some((x) => x.parentId === key);
                if (!itemsHaveChildren)
                {
                    const itemToAdjustId = pmcProfile.Inventory.items.find((x) => x._id === key);
                    itemToAdjustId._id = this.hashUtil.generate();
                    this.logger.warning(`Replace duplicate item Id: ${key} with ${itemToAdjustId._id}`);
                }
            }
        }

        // Iterate over all inventory items
        for (const item of pmcProfile.Inventory.items.filter((x) => x.slotId))
        {
            if (!item.upd)
            {
                // Ignore items without a upd object
                continue;
            }

            // Check items with a tag that contains non alphanumeric characters
            const regxp = /([/w"\\'])/g;
            if (regxp.test(item.upd.Tag?.Name))
            {
                this.logger.warning(`Fixed item: ${item._id}s Tag value, removed invalid characters`);
                item.upd.Tag.Name = item.upd.Tag.Name.replace(regxp, "");
            }

            // Check items with StackObjectsCount (null)
            if (item.upd.StackObjectsCount === null)
            {
                this.logger.warning(`Fixed item: ${item._id}s null StackObjectsCount value, now set to 1`);
                item.upd.StackObjectsCount = 1;
            }
        }

        // Iterate over clothing
        const customizationDb = this.databaseServer.getTables().templates.customization;
        const customizationDbArray = Object.values(this.databaseServer.getTables().templates.customization);
        const playerIsUsec = pmcProfile.Info.Side.toLowerCase() === "usec";

        // Check Head
        if (!customizationDb[pmcProfile.Customization.Head])
        {
            const defaultHead = playerIsUsec
                ? customizationDbArray.find((x) => x._name === "DefaultUsecHead")
                : customizationDbArray.find((x) => x._name === "DefaultBearHead");
            pmcProfile.Customization.Head = defaultHead._id;
        }

        // check Body
        if (!customizationDb[pmcProfile.Customization.Body])
        {
            const defaultBody = (pmcProfile.Info.Side.toLowerCase() === "usec")
                ? customizationDbArray.find((x) => x._name === "DefaultUsecBody")
                : customizationDbArray.find((x) => x._name === "DefaultBearBody");
            pmcProfile.Customization.Body = defaultBody._id;
        }

        // check Hands
        if (!customizationDb[pmcProfile.Customization.Hands])
        {
            const defaultHands = (pmcProfile.Info.Side.toLowerCase() === "usec")
                ? customizationDbArray.find((x) => x._name === "DefaultUsecHands")
                : customizationDbArray.find((x) => x._name === "DefaultBearHands");
            pmcProfile.Customization.Hands = defaultHands._id;
        }

        // check Hands
        if (!customizationDb[pmcProfile.Customization.Feet])
        {
            const defaultFeet = (pmcProfile.Info.Side.toLowerCase() === "usec")
                ? customizationDbArray.find((x) => x._name === "DefaultUsecFeet")
                : customizationDbArray.find((x) => x._name === "DefaultBearFeet");
            pmcProfile.Customization.Feet = defaultFeet._id;
        }
    }

    /**
     * Add `Improvements` object to hideout if missing - added in eft 13.0.21469
     * @param pmcProfile profile to update
     */
    public addMissingUpgradesPropertyToHideout(pmcProfile: IPmcData): void
    {
        if (!pmcProfile.Hideout.Improvement)
        {
            pmcProfile.Hideout.Improvement = {};
        }
    }

    /**
     * Iterate over associated profile template and check all hideout areas exist, add if not
     * @param fullProfile Profile to update
     */
    public addMissingHideoutAreasToProfile(fullProfile: IAkiProfile): void
    {
        const pmcProfile = fullProfile.characters.pmc;
        // No profile, probably new account being created
        if (!pmcProfile?.Hideout)
        {
            return;
        }

        const profileTemplates = this.databaseServer.getTables().templates.profiles[fullProfile.info.edition];
        if (!profileTemplates)
        {
            return;
        }

        const profileTemplate = profileTemplates[pmcProfile.Info.Side.toLowerCase()];
        if (!profileTemplate)
        {
            return;
        }

        // Get all areas from templates/profiles.json
        for (const area of profileTemplate.character.Hideout.Areas)
        {
            if (!pmcProfile.Hideout.Areas.find((x) => x.type === area.type))
            {
                pmcProfile.Hideout.Areas.push(area);
                this.logger.debug(`Added missing hideout area ${area.type} to profile`);
            }
        }
    }

    /**
     * These used to be used for storing scav case rewards, rewards are now generated on pickup
     * @param pmcProfile Profile to update
     */
    public removeLegacyScavCaseProductionCrafts(pmcProfile: IPmcData): void
    {
        for (const prodKey in pmcProfile.Hideout?.Production)
        {
            if (prodKey.startsWith("ScavCase"))
            {
                delete pmcProfile.Hideout.Production[prodKey];
            }
        }
    }

    /**
     * 3.7.0 moved AIDs to be numeric, old profiles need to be migrated
     * We store the old AID value in new field `sessionId`
     * @param fullProfile Profile to update
     */
    public fixIncorrectAidValue(fullProfile: IAkiProfile): void
    {
        // Not a number, regenerate
        // biome-ignore lint/suspicious/noGlobalIsNan: <value can be a valid string, Number.IsNaN() would ignore it>
        if (isNaN(fullProfile.characters.pmc.aid) || !fullProfile.info.aid)
        {
            fullProfile.characters.pmc.sessionId = <string><unknown>fullProfile.characters.pmc.aid;
            fullProfile.characters.pmc.aid = this.hashUtil.generateAccountId();

            fullProfile.characters.scav.sessionId = <string><unknown>fullProfile.characters.pmc.sessionId;
            fullProfile.characters.scav.aid = fullProfile.characters.pmc.aid;

            fullProfile.info.aid = fullProfile.characters.pmc.aid;

            this.logger.info(
                `Migrated AccountId from: ${fullProfile.characters.pmc.sessionId} to: ${fullProfile.characters.pmc.aid}`,
            );
        }
    }

    /**
     * Bsg nested `stats` into a sub object called 'eft'
     * @param fullProfile Profile to check for and migrate stats data
     */
    public migrateStatsToNewStructure(fullProfile: IAkiProfile): void
    {
        // Data is in old structure, migrate
        if ("OverallCounters" in fullProfile.characters.pmc.Stats)
        {
            this.logger.debug("Migrating stats object into new structure");
            const statsCopy = this.jsonUtil.clone(fullProfile.characters.pmc.Stats);

            // Clear stats object
            fullProfile.characters.pmc.Stats = { Eft: null };

            fullProfile.characters.pmc.Stats.Eft = <any><unknown>statsCopy;
        }
    }

    /**
     * 26126 (7th August) requires bonuses to have an ID, these were not included in the default profile presets
     * @param pmcProfile Profile to add missing IDs to
     */
    public addMissingIdsToBonuses(pmcProfile: IPmcData): void
    {
        let foundBonus = false;
        for (const bonus of pmcProfile.Bonuses)
        {
            if (bonus.id)
            {
                // Exists already, skip
                continue;
            }

            // Bonus lacks id, find matching hideout area / stage / bonus
            for (const area of this.databaseServer.getTables().hideout.areas)
            {
                // TODO: skip if no stages
                for (const stageIndex in area.stages)
                {
                    const stageInfo = area.stages[stageIndex];
                    const matchingBonus = stageInfo.bonuses.find((x) =>
                        x.templateId === bonus.templateId && x.type === bonus.type
                    );
                    if (matchingBonus)
                    {
                        // Add id to bonus, flag bonus as found and exit stage loop
                        bonus.id = matchingBonus.id;
                        this.logger.debug(`Added missing Id: ${bonus.id} to bonus: ${bonus.type}`);
                        foundBonus = true;
                        break;
                    }
                }

                // We've found the bonus we're after, break out of area loop
                if (foundBonus)
                {
                    foundBonus = false;
                    break;
                }
            }
        }
    }

    /**
     * At some point the property name was changed,migrate data across to new name
     * @param pmcProfile Profile to migrate improvements in
     */
    protected migrateImprovements(pmcProfile: IPmcData): void
    {
        if ("Improvements" in pmcProfile.Hideout)
        {
            const improvements = pmcProfile.Hideout.Improvements as Record<string, IHideoutImprovement>;
            pmcProfile.Hideout.Improvement = this.jsonUtil.clone(improvements);
            delete pmcProfile.Hideout.Improvements;
            this.logger.success("Successfully migrated hideout Improvements data to new location, deleted old data");
        }
    }

    /**
     * After removing mods that add quests, the quest panel will break without removing these
     * @param pmcProfile Profile to remove dead quests from
     */
    protected removeOrphanedQuests(pmcProfile: IPmcData): void
    {
        const quests = this.databaseServer.getTables().templates.quests;
        const profileQuests = pmcProfile.Quests;

        const repeatableQuests: IRepeatableQuest[] = [];
        for (const repeatableQuestType of pmcProfile.RepeatableQuests)
        {
            repeatableQuests.push(...repeatableQuestType.activeQuests);
        }

        for (let i = 0; i < profileQuests.length; i++)
        {
            if (!(quests[profileQuests[i].qid] || repeatableQuests.find((x) => x._id === profileQuests[i].qid)))
            {
                profileQuests.splice(i, 1);
                this.logger.success("Successfully removed orphaned quest that doesnt exist in our quest data");
            }
        }
    }
}
