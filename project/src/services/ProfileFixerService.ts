import { HideoutHelper } from "@spt/helpers/HideoutHelper";
import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { HideoutSlot } from "@spt/models/eft/common/tables/IBotBase";
import { IPmcDataRepeatableQuest, IRepeatableQuest } from "@spt/models/eft/common/tables/IRepeatableQuests";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { IEquipmentBuild, IMagazineBuild, ISptProfile, IWeaponBuild } from "@spt/models/eft/profile/ISptProfile";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { HideoutAreas } from "@spt/models/enums/HideoutAreas";
import { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HashUtil } from "@spt/utils/HashUtil";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { Watermark } from "@spt/utils/Watermark";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class ProfileFixerService {
    protected coreConfig: ICoreConfig;
    protected ragfairConfig: IRagfairConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("Watermark") protected watermark: Watermark,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("HideoutHelper") protected hideoutHelper: HideoutHelper,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
    }

    /**
     * Find issues in the pmc profile data that may cause issues and fix them
     * @param pmcProfile profile to check and fix
     */
    public checkForAndFixPmcProfileIssues(pmcProfile: IPmcData): void {
        this.removeDanglingConditionCounters(pmcProfile);
        this.removeDanglingTaskConditionCounters(pmcProfile);
        this.removeOrphanedQuests(pmcProfile);

        if (pmcProfile.Hideout) {
            const globals = this.databaseService.getGlobals();

            if (
                pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.GENERATOR).slots.length <
                6 + globals.config.SkillsSettings.HideoutManagement.EliteSlots.Generator.Slots
            ) {
                this.logger.debug("Updating generator area slots to a size of 6 + hideout management skill");
                this.addEmptyObjectsToHideoutAreaSlots(
                    HideoutAreas.GENERATOR,
                    6 + globals.config.SkillsSettings.HideoutManagement.EliteSlots.Generator.Slots,
                    pmcProfile,
                );
            }

            if (
                pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.WATER_COLLECTOR).slots.length <
                1 + globals.config.SkillsSettings.HideoutManagement.EliteSlots.WaterCollector.Slots
            ) {
                this.logger.debug("Updating water collector area slots to a size of 1 + hideout management skill");
                this.addEmptyObjectsToHideoutAreaSlots(
                    HideoutAreas.WATER_COLLECTOR,
                    1 + globals.config.SkillsSettings.HideoutManagement.EliteSlots.WaterCollector.Slots,
                    pmcProfile,
                );
            }

            if (
                pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.AIR_FILTERING).slots.length <
                3 + globals.config.SkillsSettings.HideoutManagement.EliteSlots.AirFilteringUnit.Slots
            ) {
                this.logger.debug("Updating air filter area slots to a size of 3 + hideout management skill");
                this.addEmptyObjectsToHideoutAreaSlots(
                    HideoutAreas.AIR_FILTERING,
                    3 + globals.config.SkillsSettings.HideoutManagement.EliteSlots.AirFilteringUnit.Slots,
                    pmcProfile,
                );
            }

            // BTC Farm doesnt have extra slots for hideout management, but we still check for modded stuff!!
            if (
                pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.BITCOIN_FARM).slots.length <
                50 + globals.config.SkillsSettings.HideoutManagement.EliteSlots.BitcoinFarm.Slots
            ) {
                this.logger.debug("Updating bitcoin farm area slots to a size of 50 + hideout management skill");
                this.addEmptyObjectsToHideoutAreaSlots(
                    HideoutAreas.BITCOIN_FARM,
                    50 + globals.config.SkillsSettings.HideoutManagement.EliteSlots.BitcoinFarm.Slots,
                    pmcProfile,
                );
            }
        }

        if (pmcProfile.Skills) {
            this.checkForSkillsOverMaxLevel(pmcProfile);
        }
    }

    /**
     * Find issues in the scav profile data that may cause issues
     * @param scavProfile profile to check and fix
     */
    public checkForAndFixScavProfileIssues(scavProfile: IPmcData): void {}

    /**
     * Check for and cap profile skills at 5100.
     * @param pmcProfile profile to check and fix
     */
    protected checkForSkillsOverMaxLevel(pmcProfile: IPmcData): void {
        const skills = pmcProfile.Skills.Common;

        for (const skill of skills) {
            if (skill.Progress > 5100) {
                skill.Progress = 5100;
            }
        }
    }

    /**
     * TODO - make this non-public - currently used by RepeatableQuestController
     * Remove unused condition counters
     * @param pmcProfile profile to remove old counters from
     */
    public removeDanglingConditionCounters(pmcProfile: IPmcData): void {
        if (pmcProfile.TaskConditionCounters) {
            for (const counterId in pmcProfile.TaskConditionCounters) {
                const counter = pmcProfile.TaskConditionCounters[counterId];
                if (!counter.sourceId) {
                    delete pmcProfile.TaskConditionCounters[counterId];
                }
            }
        }
    }

    /**
     * Repeatable quests leave behind TaskConditionCounter objects that make the profile bloat with time, remove them
     * @param pmcProfile Player profile to check
     */
    protected removeDanglingTaskConditionCounters(pmcProfile: IPmcData): void {
        if (pmcProfile.TaskConditionCounters) {
            const taskConditionKeysToRemove: string[] = [];
            const activeRepeatableQuests = this.getActiveRepeatableQuests(pmcProfile.RepeatableQuests);
            const achievements = this.databaseService.getAchievements();

            // Loop over TaskConditionCounters objects and add once we want to remove to counterKeysToRemove
            for (const [key, taskConditionCounter] of Object.entries(pmcProfile.TaskConditionCounters)) {
                // Only check if profile has repeatable quests
                if (pmcProfile.RepeatableQuests && activeRepeatableQuests.length > 0) {
                    const existsInActiveRepeatableQuests = activeRepeatableQuests.some(
                        (quest) => quest._id === taskConditionCounter.sourceId,
                    );
                    const existsInQuests = pmcProfile.Quests.some(
                        (quest) => quest.qid === taskConditionCounter.sourceId,
                    );
                    const isAchievementTracker = achievements.some(
                        (quest) => quest.id === taskConditionCounter.sourceId,
                    );

                    // If task conditions id is neither in activeQuests, quests or achievements - it's stale and should be cleaned up
                    if (!(existsInActiveRepeatableQuests || existsInQuests || isAchievementTracker)) {
                        taskConditionKeysToRemove.push(key);
                    }
                }
            }

            for (const counterKeyToRemove of taskConditionKeysToRemove) {
                this.logger.debug(`Removed ${counterKeyToRemove} TaskConditionCounter object`);
                delete pmcProfile.TaskConditionCounters[counterKeyToRemove];
            }
        }
    }

    protected getActiveRepeatableQuests(repeatableQuests: IPmcDataRepeatableQuest[]): IRepeatableQuest[] {
        let activeQuests: IRepeatableQuest[] = [];
        for (const repeatableQuest of repeatableQuests) {
            if (repeatableQuest.activeQuests.length > 0) {
                // daily/weekly collection has active quests in them, add to array and return
                activeQuests = activeQuests.concat(repeatableQuest.activeQuests);
            }
        }

        return activeQuests;
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
    ): void {
        const area = pmcProfile.Hideout.Areas.find((x) => x.type === areaType);
        area.slots = this.addObjectsToArray(emptyItemCount, area.slots);
    }

    protected addObjectsToArray(count: number, slots: HideoutSlot[]): HideoutSlot[] {
        for (let i = 0; i < count; i++) {
            if (!slots.some((x) => x.locationIndex === i)) {
                slots.push({ locationIndex: i });
            }
        }

        return slots;
    }

    /**
     * Checks profile inventiory for items that do not exist inside the items db
     * @param sessionId Session id
     * @param pmcProfile Profile to check inventory of
     */
    public checkForOrphanedModdedItems(sessionId: string, fullProfile: ISptProfile): void {
        const itemsDb = this.databaseService.getItems();
        const pmcProfile = fullProfile.characters.pmc;

        // Get items placed in root of stash
        // TODO: extend to other areas / sub items
        const inventoryItemsToCheck = pmcProfile.Inventory.items.filter((item) =>
            ["hideout", "main"].includes(item.slotId ?? ""),
        );
        if (inventoryItemsToCheck) {
            // Check each item in inventory to ensure item exists in itemdb
            for (const item of inventoryItemsToCheck) {
                if (!itemsDb[item._tpl]) {
                    this.logger.error(this.localisationService.getText("fixer-mod_item_found", item._tpl));

                    if (this.coreConfig.fixes.removeModItemsFromProfile) {
                        this.logger.success(
                            `Deleting item from inventory and insurance with id: ${item._id} tpl: ${item._tpl}`,
                        );

                        // Also deletes from insured array
                        this.inventoryHelper.removeItem(pmcProfile, item._id, sessionId);
                    }
                }
            }
        }

        if (fullProfile.userbuilds) {
            // Remove invalid builds from weapon, equipment and magazine build lists
            const weaponBuilds = fullProfile.userbuilds?.weaponBuilds || [];
            fullProfile.userbuilds.weaponBuilds = weaponBuilds.filter((weaponBuild) => {
                return !this.shouldRemoveWeaponEquipmentBuild("weapon", weaponBuild, itemsDb);
            });

            const equipmentBuilds = fullProfile.userbuilds?.equipmentBuilds || [];
            fullProfile.userbuilds.equipmentBuilds = equipmentBuilds.filter((equipmentBuild) => {
                return !this.shouldRemoveWeaponEquipmentBuild("equipment", equipmentBuild, itemsDb);
            });

            const magazineBuilds = fullProfile.userbuilds?.magazineBuilds || [];
            fullProfile.userbuilds.magazineBuilds = magazineBuilds.filter((magazineBuild) => {
                return !this.shouldRemoveMagazineBuild(magazineBuild, itemsDb);
            });
        }

        // Iterate over dialogs, looking for messages with items not found in item db, remove message if item found
        for (const dialogId in fullProfile.dialogues) {
            const dialog = fullProfile.dialogues[dialogId];
            if (!dialog?.messages) {
                continue; // Skip dialog with no messages
            }

            // Iterate over all messages in dialog
            for (const [_, message] of Object.entries(dialog.messages)) {
                if (!message.items?.data) {
                    continue; // Skip message with no items
                }

                // Fix message with no items but have the flags to indicate items to collect
                if (message.items.data.length === 0 && message.hasRewards) {
                    message.hasRewards = false;
                    message.rewardCollected = true;
                    continue;
                }

                // Iterate over all items in message
                for (const item of message.items.data) {
                    // Check item exists in itemsDb
                    if (!itemsDb[item._tpl]) {
                        this.logger.error(this.localisationService.getText("fixer-mod_item_found", item._tpl));

                        if (this.coreConfig.fixes.removeModItemsFromProfile) {
                            dialog.messages.splice(
                                dialog.messages.findIndex((x) => x._id === message._id),
                                1,
                            );
                            this.logger.warning(
                                `Item: ${item._tpl} has resulted in the deletion of message: ${message._id} from dialog ${dialogId}`,
                            );
                        }

                        break;
                    }
                }
            }
        }

        const clothing = this.databaseService.getTemplates().customization;
        for (const [_, suitId] of Object.entries(fullProfile.suits)) {
            if (!clothing[suitId]) {
                this.logger.error(this.localisationService.getText("fixer-clothing_item_found", suitId));
                if (this.coreConfig.fixes.removeModItemsFromProfile) {
                    fullProfile.suits.splice(fullProfile.suits.indexOf(suitId), 1);
                    this.logger.warning(`Non-default suit purchase: ${suitId} removed from profile`);
                }
            }
        }

        for (const repeatable of fullProfile.characters.pmc.RepeatableQuests ?? []) {
            for (const [_, activeQuest] of Object.entries(repeatable.activeQuests ?? [])) {
                if (!this.traderHelper.traderEnumHasValue(activeQuest.traderId)) {
                    this.logger.error(this.localisationService.getText("fixer-trader_found", activeQuest.traderId));
                    if (this.coreConfig.fixes.removeModItemsFromProfile) {
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

                for (const successReward of activeQuest.rewards.Success) {
                    if (successReward.type === "Item") {
                        for (const rewardItem of successReward.items) {
                            if (!itemsDb[rewardItem._tpl]) {
                                this.logger.error(
                                    this.localisationService.getText("fixer-mod_item_found", rewardItem._tpl),
                                );
                                if (this.coreConfig.fixes.removeModItemsFromProfile) {
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

        for (const traderId in fullProfile.traderPurchases) {
            if (!this.traderHelper.traderEnumHasValue(traderId)) {
                this.logger.error(this.localisationService.getText("fixer-trader_found", traderId));
                if (this.coreConfig.fixes.removeModItemsFromProfile) {
                    this.logger.warning(`Non-default trader: ${traderId} removed from traderPurchases list in profile`);
                    delete fullProfile.traderPurchases[traderId];
                }
            }
        }
    }

    /**
     * @param buildType The type of build, used for logging only
     * @param build The build to check for invalid items
     * @param itemsDb The items database to use for item lookup
     * @returns True if the build should be removed from the build list, false otherwise
     */
    protected shouldRemoveWeaponEquipmentBuild(
        buildType: string,
        build: IWeaponBuild | IEquipmentBuild,
        itemsDb: Record<string, ITemplateItem>,
    ): boolean {
        for (const item of build.Items) {
            // Check item exists in itemsDb
            if (!itemsDb[item._tpl]) {
                this.logger.error(this.localisationService.getText("fixer-mod_item_found", item._tpl));

                if (this.coreConfig.fixes.removeModItemsFromProfile) {
                    this.logger.warning(
                        `Item: ${item._tpl} has resulted in the deletion of ${buildType} build: ${build.Name}`,
                    );

                    return true;
                }

                break;
            }
        }

        return false;
    }

    /**
     * @param magazineBuild The magazine build to check for validity
     * @param itemsDb The items database to use for item lookup
     * @returns True if the build should be removed from the build list, false otherwise
     */
    protected shouldRemoveMagazineBuild(
        magazineBuild: IMagazineBuild,
        itemsDb: Record<string, ITemplateItem>,
    ): boolean {
        for (const item of magazineBuild.Items) {
            // Magazine builds can have undefined items in them, skip those
            if (!item) {
                continue;
            }

            // Check item exists in itemsDb
            if (!itemsDb[item.TemplateId]) {
                this.logger.error(this.localisationService.getText("fixer-mod_item_found", item.TemplateId));

                if (this.coreConfig.fixes.removeModItemsFromProfile) {
                    this.logger.warning(
                        `Item: ${item.TemplateId} has resulted in the deletion of magazine build: ${magazineBuild.Name}`,
                    );

                    return true;
                }

                break;
            }
        }

        return false;
    }

    /**
     * Attempt to fix common item issues that corrupt profiles
     * @param pmcProfile Profile to check items of
     */
    public fixProfileBreakingInventoryItemIssues(pmcProfile: IPmcData): void {
        // Create a mapping of all inventory items, keyed by _id value
        const itemMapping = pmcProfile.Inventory.items.reduce((acc, curr) => {
            acc[curr._id] = acc[curr._id] || [];
            acc[curr._id].push(curr);

            return acc;
        }, {});

        for (const key in itemMapping) {
            // Only one item for this id, not a dupe
            if (itemMapping[key].length === 1) {
                continue;
            }

            this.logger.warning(`${itemMapping[key].length - 1} duplicate(s) found for item: ${key}`);
            const itemAJson = this.jsonUtil.serialize(itemMapping[key][0]);
            const itemBJson = this.jsonUtil.serialize(itemMapping[key][1]);
            if (itemAJson === itemBJson) {
                // Both items match, we can safely delete one
                const indexOfItemToRemove = pmcProfile.Inventory.items.findIndex((x) => x._id === key);
                pmcProfile.Inventory.items.splice(indexOfItemToRemove, 1);
                this.logger.warning(`Deleted duplicate item: ${key}`);
            } else {
                // Items are different, replace ID with unique value
                // Only replace ID if items have no children, we dont want orphaned children
                const itemsHaveChildren = pmcProfile.Inventory.items.some((x) => x.parentId === key);
                if (!itemsHaveChildren) {
                    const itemToAdjust = pmcProfile.Inventory.items.find((x) => x._id === key);
                    itemToAdjust._id = this.hashUtil.generate();
                    this.logger.warning(`Replace duplicate item Id: ${key} with ${itemToAdjust._id}`);
                }
            }
        }

        // Iterate over all inventory items
        for (const item of pmcProfile.Inventory.items.filter((x) => x.slotId)) {
            if (!item.upd) {
                // Ignore items without a upd object
                continue;
            }

            // Check items with a tag that contains non alphanumeric characters
            const regxp = /([/w"\\'])/g;
            if (item.upd.Tag?.Name && regxp.test(item.upd.Tag?.Name)) {
                this.logger.warning(`Fixed item: ${item._id}s Tag value, removed invalid characters`);
                item.upd.Tag.Name = item.upd.Tag.Name.replace(regxp, "");
            }

            // Check items with StackObjectsCount (undefined)
            if (item.upd?.StackObjectsCount === undefined) {
                this.logger.warning(`Fixed item: ${item._id}s undefined StackObjectsCount value, now set to 1`);
                item.upd.StackObjectsCount = 1;
            }
        }

        // Iterate over clothing
        const customizationDb = this.databaseService.getTemplates().customization;
        const customizationDbArray = Object.values(customizationDb);
        const playerIsUsec = pmcProfile.Info.Side.toLowerCase() === "usec";

        // Check Head
        if (!customizationDb[pmcProfile.Customization.Head]) {
            const defaultHead = playerIsUsec
                ? customizationDbArray.find((x) => x._name === "DefaultUsecHead")
                : customizationDbArray.find((x) => x._name === "DefaultBearHead");
            pmcProfile.Customization.Head = defaultHead._id;
        }

        // check Body
        if (!customizationDb[pmcProfile.Customization.Body]) {
            const defaultBody =
                pmcProfile.Info.Side.toLowerCase() === "usec"
                    ? customizationDbArray.find((x) => x._name === "DefaultUsecBody")
                    : customizationDbArray.find((x) => x._name === "DefaultBearBody");
            pmcProfile.Customization.Body = defaultBody._id;
        }

        // check Hands
        if (!customizationDb[pmcProfile.Customization.Hands]) {
            const defaultHands =
                pmcProfile.Info.Side.toLowerCase() === "usec"
                    ? customizationDbArray.find((x) => x._name === "DefaultUsecHands")
                    : customizationDbArray.find((x) => x._name === "DefaultBearHands");
            pmcProfile.Customization.Hands = defaultHands._id;
        }

        // check Hands
        if (!customizationDb[pmcProfile.Customization.Feet]) {
            const defaultFeet =
                pmcProfile.Info.Side.toLowerCase() === "usec"
                    ? customizationDbArray.find((x) => x._name === "DefaultUsecFeet")
                    : customizationDbArray.find((x) => x._name === "DefaultBearFeet");
            pmcProfile.Customization.Feet = defaultFeet._id;
        }
    }

    /**
     * After removing mods that add quests, the quest panel will break without removing these
     * @param pmcProfile Profile to remove dead quests from
     */
    protected removeOrphanedQuests(pmcProfile: IPmcData): void {
        const quests = this.databaseService.getQuests();
        const profileQuests = pmcProfile.Quests;

        const repeatableQuests: IRepeatableQuest[] = [];
        for (const repeatableQuestType of pmcProfile.RepeatableQuests) {
            repeatableQuests.push(...repeatableQuestType.activeQuests);
        }

        for (let i = profileQuests.length - 1; i >= 0; i--) {
            if (!(quests[profileQuests[i].qid] || repeatableQuests.some((x) => x._id === profileQuests[i].qid))) {
                profileQuests.splice(i, 1);
                this.logger.success("Successfully removed orphaned quest that doesnt exist in our quest data");
            }
        }
    }
}
