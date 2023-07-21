import { inject, injectable } from "tsyringe";

import { HideoutHelper } from "../helpers/HideoutHelper";
import { InventoryHelper } from "../helpers/InventoryHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { Bonus, HideoutSlot } from "../models/eft/common/tables/IBotBase";
import {
    IPmcDataRepeatableQuest, IRepeatableQuest
} from "../models/eft/common/tables/IRepeatableQuests";
import { StageBonus } from "../models/eft/hideout/IHideoutArea";
import { IAkiProfile } from "../models/eft/profile/IAkiProfile";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { HideoutAreas } from "../models/enums/HideoutAreas";
import { QuestStatus } from "../models/enums/QuestStatus";
import { Traders } from "../models/enums/Traders";
import { ICoreConfig } from "../models/spt/config/ICoreConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { TimeUtil } from "../utils/TimeUtil";
import { Watermark } from "../utils/Watermark";
import { LocalisationService } from "./LocalisationService";

@injectable()
export class ProfileFixerService
{
    protected coreConfig: ICoreConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("Watermark") protected watermark: Watermark,
        @inject("HideoutHelper") protected hideoutHelper: HideoutHelper,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
    }

    /**
     * Find issues in the pmc profile data that may cause issues and fix them
     * @param pmcProfile profile to check and fix
     */
    public checkForAndFixPmcProfileIssues(pmcProfile: IPmcData): void
    {
        this.removeDanglingConditionCounters(pmcProfile);
        this.removeDanglingBackendCounters(pmcProfile);
        this.addMissingRepeatableQuestsProperty(pmcProfile);
        this.addLighthouseKeeperIfMissing(pmcProfile);
        this.addUnlockedInfoObjectIfMissing(pmcProfile);

        if (pmcProfile.Hideout)
        {
            this.addMissingBonusesProperty(pmcProfile);
            this.addMissingArmorRepairSkill(pmcProfile);
            this.addMissingWorkbenchWeaponSkills(pmcProfile);
            this.addMissingWallImprovements(pmcProfile);

            this.removeResourcesFromSlotsInHideoutWithoutLocationIndexValue(pmcProfile);

            this.reorderHideoutAreasWithResouceInputs(pmcProfile);

            if (pmcProfile.Hideout.Areas[HideoutAreas.GENERATOR].slots.length < 
                (6 + this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.EliteSlots.Generator.Slots))
            {
                this.logger.debug("Updating generator area slots to a size of 6 + hideout management skill");
                this.addEmptyObjectsToHideoutAreaSlots(HideoutAreas.GENERATOR, (6 + this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.EliteSlots.Generator.Slots), pmcProfile);
            }

            if (pmcProfile.Hideout.Areas[HideoutAreas.WATER_COLLECTOR].slots.length < (1 + this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.EliteSlots.WaterCollector.Slots))
            {
                this.logger.debug("Updating water collector area slots to a size of 1 + hideout management skill");
                this.addEmptyObjectsToHideoutAreaSlots(HideoutAreas.WATER_COLLECTOR, (1 + this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.EliteSlots.WaterCollector.Slots), pmcProfile);
            }

            if (pmcProfile.Hideout.Areas[HideoutAreas.AIR_FILTERING].slots.length < (3 + this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.EliteSlots.AirFilteringUnit.Slots))
            {
                this.logger.debug("Updating air filter area slots to a size of 3 + hideout management skill");
                this.addEmptyObjectsToHideoutAreaSlots(HideoutAreas.AIR_FILTERING, (3 + this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.EliteSlots.AirFilteringUnit.Slots), pmcProfile);
            }

            // BTC Farm doesnt have extra slots for hideout management, but we still check for modded stuff!!
            if (pmcProfile.Hideout.Areas[HideoutAreas.BITCOIN_FARM].slots.length < (50 + this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.EliteSlots.BitcoinFarm.Slots))
            {
                this.logger.debug("Updating bitcoin farm area slots to a size of 50 + hideout management skill");
                this.addEmptyObjectsToHideoutAreaSlots(HideoutAreas.BITCOIN_FARM, (50 + this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.EliteSlots.BitcoinFarm.Slots), pmcProfile);
            }
        }

        this.fixNullTraderSalesSums(pmcProfile);
        this.updateProfilePocketsToNewId(pmcProfile);
        this.updateProfileQuestDataValues(pmcProfile);
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
            fullProfile.aki = {
                version: this.watermark.getVersionTag(),
                receivedGifts: []
            };
        }
    }

    /**
     * TODO - make this non-public - currently used by RepeatableQuestController
     * Remove unused condition counters
     * @param pmcProfile profile to remove old counters from
     */
    public removeDanglingConditionCounters(pmcProfile: IPmcData): void
    {
        if (pmcProfile.ConditionCounters)
        {
            pmcProfile.ConditionCounters.Counters = pmcProfile.ConditionCounters.Counters.filter(c => c.qid !== null);
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
                nextResupply: this.timeUtil.getTimestamp() + 3600 // now + 1 hour
            };
        }
    }

    protected addUnlockedInfoObjectIfMissing(pmcProfile: IPmcData): void
    {
        if (!pmcProfile.UnlockedInfo)
        {
            this.logger.debug("Adding UnlockedInfo object to profile");
            pmcProfile.UnlockedInfo = {
                unlockedProductionRecipe: []
            };
        }
    }

    protected removeDanglingBackendCounters(pmcProfile: IPmcData): void
    {
        if (pmcProfile.BackendCounters)
        {
            const counterKeysToRemove: string[] = [];
            const activeQuests = this.getActiveRepeatableQuests(pmcProfile.RepeatableQuests);
            for (const [key, backendCounter] of Object.entries(pmcProfile.BackendCounters))
            {
                if (pmcProfile.RepeatableQuests && activeQuests.length > 0)
                {
                    const matchingQuest = activeQuests.filter(x => x._id === backendCounter.qid);
                    const quest = pmcProfile.Quests.filter(q => q.qid === backendCounter.qid);
    
                    // if BackendCounter's quest is neither in activeQuests nor Quests it's stale
                    if (matchingQuest.length === 0 && quest.length === 0)
                    {
                        counterKeysToRemove.push(key);
                    }
                }
            }

            for (const counterKeyToRemove of counterKeysToRemove)
            {
                delete  pmcProfile.BackendCounters[counterKeyToRemove];
            }
        }
    }

    protected getActiveRepeatableQuests(repeatableQuests: IPmcDataRepeatableQuest[]): IRepeatableQuest[]
    {
        let activeQuests = [];
        repeatableQuests.forEach(x =>
        {
            if (x.activeQuests.length > 0)
            {
                // daily/weekly collection has active quests in them, add to array and return
                activeQuests = activeQuests.concat(x.activeQuests);
            }
        });

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
        if (typeof pmcProfile["Bonuses"] === "undefined")
        {
            pmcProfile["Bonuses"] = [];
            this.logger.debug("Missing Bonuses property added to profile");
        }
    }

    /**
     * Adjust profile quest status and statusTimers object values
     * quest.status is numeric e.g. 2
     * quest.statusTimers keys are numeric as strings e.g. "2"
     * @param pmcProfile profile to update
     */
    protected updateProfileQuestDataValues(pmcProfile: IPmcData): void
    {
        if (!pmcProfile.Quests)
        {
            return;
        }
        const  fixes = new Map<any, number>(); 
        for (const quest of pmcProfile.Quests)
        {
            if (quest.status && !Number(quest.status))
            {
                if (fixes.has(quest.status))
                    fixes.set(quest.status, fixes.get(quest.status) + 1);
                else
                    fixes.set(quest.status, 1);

                const newQuestStatus = QuestStatus[quest.status];
                quest.status = <QuestStatus><unknown>newQuestStatus;

                for (const statusTimer in quest.statusTimers)
                {
                    if (!Number(statusTimer))
                    {
                        const newKey = QuestStatus[statusTimer];
                        quest.statusTimers[newKey] = quest.statusTimers[statusTimer];
                        delete  quest.statusTimers[statusTimer];
                    }
                }
            }
        }

        if (fixes.size > 0)
            this.logger.debug(`Updated quests values: ${Array.from(fixes.entries()).map(([k, v]) => `(${k}: ${v} times)`).join(", ")}`);
    }

    protected addMissingRepeatableQuestsProperty(pmcProfile: IPmcData): void
    {
        if (pmcProfile.RepeatableQuests)
        {
            let repeatablesCompatible = true;
            for (const currentRepeatable of pmcProfile.RepeatableQuests)
            {
                if (
                    !(currentRepeatable.changeRequirement &&
                    currentRepeatable.activeQuests.every(x => (typeof x.changeCost !== "undefined" && typeof x.changeStandingCost !== "undefined")))
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
    }

    protected addMissingWorkbenchWeaponSkills(pmcProfile: IPmcData): void
    {
        const workbench = pmcProfile.Hideout.Areas.find(x => x.type === HideoutAreas.WORKBENCH);
        if (workbench)
        {
            if (workbench.level > 0)
            {
                const weaponRepairBonus = pmcProfile.Bonuses.find(x => x.type === "UnlockWeaponRepair");
                if (!weaponRepairBonus) 
                {
                    pmcProfile.Bonuses.push(
                        {
                            type: "UnlockWeaponRepair",
                            value: 1,
                            passive: true,
                            production: false,
                            visible: true
                        }
                    );

                    this.logger.debug("Missing UnlockWeaponRepair bonus added to profile");
                }

                const weaponModificationBonus = pmcProfile.Bonuses.find(x => x.type === "UnlockWeaponModification");
                if (!weaponModificationBonus) 
                {
                    pmcProfile.Bonuses.push(
                        {
                            type: "UnlockWeaponModification",
                            value: 1,
                            passive: true,
                            production: false,
                            visible: false
                        }
                    );

                    this.logger.debug("Missing UnlockWeaponModification bonus added to profile");
                }
            }
        }
    }

    /**
     * Some profiles have hideout maxed and therefore no improvements
     * @param pmcProfile Profile to add improvement data to
     */
    protected addMissingWallImprovements(pmcProfile: IPmcData): void
    {
        const profileWallArea = pmcProfile.Hideout.Areas[HideoutAreas.EMERGENCY_WALL];
        const wallDb = this.databaseServer.getTables().hideout.areas.find(x => x.type === HideoutAreas.EMERGENCY_WALL);

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
                    if (pmcProfile.Hideout.Improvements[improvement.id])
                    {
                        continue;
                    }

                    pmcProfile.Hideout.Improvements[improvement.id] = {
                        completed: true,
                        improveCompleteTimestamp: this.timeUtil.getTimestamp() + i // add some variability
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
            area.slots = area.slots.filter(x => "locationIndex" in x);

            // Only slots that:
            // Have an item property and it has at least one item in it
            // Or
            // Have no item property
            area.slots = area.slots.filter(x => "item" in x && x.item?.length > 0 || !("item" in x));
        }
    }

    /**
     * Hideout slots need to be in a specific order, locationIndex in ascending order
     * @param pmcProfile profile to edit
     */
    protected reorderHideoutAreasWithResouceInputs(pmcProfile: IPmcData): void
    {
        const areasToCheck = [HideoutAreas.AIR_FILTERING, HideoutAreas.GENERATOR, HideoutAreas.BITCOIN_FARM, HideoutAreas.WATER_COLLECTOR];

        for (const areaId of areasToCheck)
        {
            const area = pmcProfile.Hideout.Areas[areaId];

            if (!area)
            {
                this.logger.debug(`unable to sort ${areaId} slots, no area found`);
                continue;
            }

            if (!area.slots ||  area.slots.length === 0)
            {
                this.logger.debug(`unable to sort ${areaId} slots, no slots found`);
                continue;
            }

            area.slots = area.slots.sort( (a, b) => 
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
    protected addEmptyObjectsToHideoutAreaSlots(areaType: HideoutAreas, emptyItemCount: number, pmcProfile: IPmcData): void
    {

        const area = pmcProfile.Hideout.Areas.find(x => x.type === areaType);
        area.slots = this.addObjectsToArray(emptyItemCount, area.slots);
    }

    protected addObjectsToArray(count: number, slots: HideoutSlot[]): HideoutSlot[]
    {
        for (let i = 0; i < count; i++)
        {
            if (!slots.find(x => x.locationIndex === i))
            {
                slots.push({locationIndex: i});
            }
        }

        return slots;

    }

    /**
     * In 18876 bsg changed the pockets tplid to be one that has 3 additional special slots
     * @param pmcProfile 
     */
    protected updateProfilePocketsToNewId(pmcProfile: IPmcData): void
    {
        const pocketItem = pmcProfile.Inventory?.items?.find(x => x.slotId === "Pockets");
        if (pocketItem)
        {
            if (pocketItem._tpl === "557ffd194bdc2d28148b457f")
            {
                this.logger.success(this.localisationService.getText("fixer-updated_pockets"));
                pocketItem._tpl = "627a4e6b255f7527fb05a0f6";
            }
        }
    }

    public addMissingArmorRepairSkill(pmcProfile: IPmcData): void
    {
        const lavatory = pmcProfile.Hideout.Areas.find(x => x.type === HideoutAreas.LAVATORY);
        if (lavatory)
        {
            if (lavatory.level > 0)
            {
                const hasBonus = pmcProfile.Bonuses.find(x => x.type === "UnlockArmorRepair");
                if (!hasBonus)
                {
                    pmcProfile.Bonuses.push(
                        {
                            type: "UnlockArmorRepair",
                            value: 1,
                            passive: true,
                            production: false,
                            visible: true
                        }
                    );

                    this.logger.debug("Missing UnlockArmorRepair bonus added to profile");
                }
            }
        }
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
            const dbArea = dbHideoutAreas.find(x => x.type === areaType);
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
                    this.logger.debug(`Unable to get bonuses for hideout area: ${area.type} stage: ${level}`);
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
                        this.logger.debug(`Profile has level ${level} area ${HideoutAreas[area.type]} but no bonus found, adding ${bonus.type}`);
                        this.hideoutHelper.applyPlayerUpgradesBonuses(pmcProfile, bonus);
                    }
                }   
            }
        }
    }

    /**
     * 
     * @param profileBonuses bonuses from profile
     * @param bonus bonus to find
     * @returns matching bonus
     */
    protected getBonusFromProfile(profileBonuses: Bonus[], bonus: StageBonus): Bonus
    {
        // match by id first, used by "TextBonus" bonuses
        if (bonus.id)
        {
            return profileBonuses.find(x => x.id === bonus.id);
        }

        if (bonus.type.toLowerCase() === "stashsize")
        {
            return profileBonuses.find(
                x => x.type === bonus.type 
                && x.templateId === bonus.templateId);
        }

        if (bonus.type.toLowerCase() === "additionalslots")
        {
            return profileBonuses.find(
                x => x.type === bonus.type
                && x.value === bonus.value
                && x.visible === bonus.visible);
        }

        return profileBonuses.find(
            x => x.type === bonus.type
            && x.value === bonus.value);
    }

    /**
     * Checks profile inventiory for items that do not exist inside the items db
     * @param sessionId Session id
     * @param pmcProfile Profile to check inventory of
     */
    public checkForOrphanedModdedItems(sessionId: string, pmcProfile: IPmcData): void
    {
        const itemsDb = this.databaseServer.getTables().templates.items;

        // Get items placed in root of stash
        // TODO: extend to other areas / sub items
        const inventoryItemsToCheck = pmcProfile.Inventory.items.filter(x => ["hideout", "main"].includes(x.slotId));
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
                    this.logger.success(`Deleting item from inventory and insurance with id: ${item._id} tpl: ${item._tpl}`);

                    // Also deletes from insured array
                    this.inventoryHelper.removeItem(pmcProfile, item._id, sessionId);

                    // TODO: delete item from mail
                }
            }
        }
    }
    
    /**
     * Add `Improvements` object to hideout if missing - added in eft 13.0.21469
     * @param pmcProfile profile to update
     */
    public addMissingUpgradesPropertyToHideout(pmcProfile: IPmcData): void
    {
        if (!pmcProfile.Hideout.Improvements)
        {
            pmcProfile.Hideout.Improvements = {};
        }
    }

    /**
     * Iterate over associated profile template and check all hideout areas exist, add if not
     * @param fullProfile Profile to update
     */
    public addMissingHideoutAreasToProfile(fullProfile: IAkiProfile): void
    {
        const pmcProfile = fullProfile.characters["pmc"];
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
            if (!pmcProfile.Hideout.Areas.find(x => x.type === area.type))
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
                delete  pmcProfile.Hideout.Production[prodKey];
            }
        }
    }
}