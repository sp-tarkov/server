import { HideoutHelper } from "@spt/helpers/HideoutHelper";
import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { QuestRewardHelper } from "@spt/helpers/QuestRewardHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IBonus, IHideoutSlot } from "@spt/models/eft/common/tables/IBotBase";
import { IQuest, IQuestReward } from "@spt/models/eft/common/tables/IQuest";
import { IPmcDataRepeatableQuest, IRepeatableQuest } from "@spt/models/eft/common/tables/IRepeatableQuests";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { IStageBonus } from "@spt/models/eft/hideout/IHideoutArea";
import { IEquipmentBuild, IMagazineBuild, ISptProfile, IWeaponBuild } from "@spt/models/eft/profile/ISptProfile";
import { BonusType } from "@spt/models/enums/BonusType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { HideoutAreas } from "@spt/models/enums/HideoutAreas";
import { QuestRewardType } from "@spt/models/enums/QuestRewardType";
import { QuestStatus } from "@spt/models/enums/QuestStatus";
import { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HashUtil } from "@spt/utils/HashUtil";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { Timer } from "@spt/utils/Timer";
import { Watermark } from "@spt/utils/Watermark";
import type { ICloner } from "@spt/utils/cloners/ICloner";
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
        @inject("QuestRewardHelper") protected questRewardHelper: QuestRewardHelper,
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
        this.verifyQuestProductionUnlocks(pmcProfile);
        this.fixFavorites(pmcProfile);

        if (pmcProfile.Hideout) {
            this.addHideoutEliteSlots(pmcProfile);
        }

        if (pmcProfile.Skills) {
            this.checkForSkillsOverMaxLevel(pmcProfile);
        }
    }

    /**
     * Resolve any dialogue attachments that were accidentally created using the player's equipment ID as
     * the stash root object ID
     * @param fullProfile
     */
    public checkForAndFixDialogueAttachments(fullProfile: ISptProfile): void {
        for (const traderDialogues of Object.values(fullProfile.dialogues)) {
            if (traderDialogues?.messages) {
                for (const message of traderDialogues.messages) {
                    // Skip any messages without attached items
                    if (!message.items?.data || !message.items?.stash) {
                        continue;
                    }

                    // Skip any messages that don't have a stashId collision with the player's equipment ID
                    if (message.items?.stash !== fullProfile.characters?.pmc?.Inventory?.equipment) {
                        continue;
                    }

                    // Otherwise we need to generate a new unique stash ID for this message's attachments
                    message.items.stash = this.hashUtil.generate();
                    message.items.data = this.itemHelper.adoptOrphanedItems(message.items.stash, message.items.data);

                    // Because `adoptOrphanedItems` sets the slotId to `hideout`, we need to re-set it to `main` to work with mail
                    for (const item of message.items.data) {
                        if (item.slotId === "hideout") {
                            item.slotId = "main";
                        }
                    }
                }
            }
        }
    }

    /**
     * Find issues in the scav profile data that may cause issues
     * @param scavProfile profile to check and fix
     */
    public checkForAndFixScavProfileIssues(scavProfile: IPmcData): void {}

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
     * TODO - make this non-public - currently used by RepeatableQuestController
     * Remove unused condition counters
     * @param pmcProfile profile to remove old counters from
     */
    public removeDanglingConditionCounters(pmcProfile: IPmcData): void {
        if (!pmcProfile.TaskConditionCounters) {
            return;
        }

        for (const counterId in pmcProfile.TaskConditionCounters) {
            const counter = pmcProfile.TaskConditionCounters[counterId];
            if (!counter.sourceId) {
                delete pmcProfile.TaskConditionCounters[counterId];
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

    /**
     * Verify that all quest production unlocks have been applied to the PMC Profile
     * @param pmcProfile The profile to validate quest productions for
     */
    protected verifyQuestProductionUnlocks(pmcProfile: IPmcData): void {
        const timer = new Timer();

        const quests = this.databaseService.getQuests();
        const profileQuests = pmcProfile.Quests;

        for (const profileQuest of profileQuests) {
            const quest = quests[profileQuest.qid];
            if (!quest) {
                continue;
            }

            // For started or successful quests, check for unlocks in the `Started` rewards
            if (profileQuest.status === QuestStatus.Started || profileQuest.status === QuestStatus.Success) {
                const productionRewards = quest.rewards.Started?.filter(
                    (reward) => reward.type === QuestRewardType.PRODUCTIONS_SCHEME,
                );

                if (productionRewards) {
                    for (const reward of productionRewards) {
                        this.verifyQuestProductionUnlock(pmcProfile, reward, quest);
                    }
                }
            }

            // For successful quests, check for unlocks in the `Success` rewards
            if (profileQuest.status === QuestStatus.Success) {
                const productionRewards = quest.rewards.Success?.filter(
                    (reward) => reward.type === QuestRewardType.PRODUCTIONS_SCHEME,
                );

                if (productionRewards) {
                    for (const reward of productionRewards) {
                        this.verifyQuestProductionUnlock(pmcProfile, reward, quest);
                    }
                }
            }
        }

        this.logger.debug(`Quest production unlock validation took ${timer.getTime("ms")}ms`);
    }

    /**
     * Validate that the given profile has the given quest reward production scheme unlocked, and add it if not
     * @param pmcProfile Profile to check
     * @param productionUnlockReward The quest reward to validate
     * @param questDetails The quest the reward belongs to
     * @returns
     */
    protected verifyQuestProductionUnlock(
        pmcProfile: IPmcData,
        productionUnlockReward: IQuestReward,
        questDetails: IQuest,
    ): void {
        const matchingProductions = this.questRewardHelper.getRewardProductionMatch(
            productionUnlockReward,
            questDetails,
        );
        if (matchingProductions.length !== 1) {
            this.logger.error(
                this.localisationService.getText("quest-unable_to_find_matching_hideout_production", {
                    questName: questDetails.QuestName,
                    matchCount: matchingProductions.length,
                }),
            );

            return;
        }

        // Add above match to pmc profile
        const matchingProductionId = matchingProductions[0]._id;
        if (!pmcProfile.UnlockedInfo.unlockedProductionRecipe.includes(matchingProductionId)) {
            pmcProfile.UnlockedInfo.unlockedProductionRecipe.push(matchingProductionId);
            this.logger.debug(
                `Added production ${matchingProductionId} to unlocked production recipes for ${questDetails.QuestName}`,
            );
        }
    }

    /**
     * Initial release of SPT 3.10 used an incorrect favorites structure, reformat
     * the structure to the correct MongoID array structure
     * @param pmcProfile
     */
    protected fixFavorites(pmcProfile: IPmcData): void {
        const favoritesAsAny = pmcProfile.Inventory?.favoriteItems as any;
        if (favoritesAsAny) {
            const correctedFavorites = favoritesAsAny.map((favorite) => {
                return favorite._id ?? favorite;
            });

            pmcProfile.Inventory.favoriteItems = correctedFavorites ?? [];
        }
    }

    /**
     * If the profile has elite Hideout Managment skill, add the additional slots from globals
     * NOTE: This seems redundant, but we will leave it here just incase.
     * @param pmcProfile profile to add slots to
     */
    protected addHideoutEliteSlots(pmcProfile: IPmcData): void {
        const globals = this.databaseService.getGlobals();

        const generator = pmcProfile.Hideout.Areas.find((area) => area.type === HideoutAreas.GENERATOR);
        if (generator) {
            const genSlots = generator.slots.length;
            const extraGenSlots = globals.config.SkillsSettings.HideoutManagement.EliteSlots.Generator.Slots;

            if (genSlots < 6 + extraGenSlots) {
                this.logger.debug("Updating generator area slots to a size of 6 + hideout management skill");
                this.addEmptyObjectsToHideoutAreaSlots(HideoutAreas.GENERATOR, 6 + extraGenSlots, pmcProfile);
            }
        }

        const waterCollSlots = pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.WATER_COLLECTOR).slots
            .length;
        const extraWaterCollSlots = globals.config.SkillsSettings.HideoutManagement.EliteSlots.WaterCollector.Slots;

        if (waterCollSlots < 1 + extraWaterCollSlots) {
            this.logger.debug("Updating water collector area slots to a size of 1 + hideout management skill");
            this.addEmptyObjectsToHideoutAreaSlots(HideoutAreas.WATER_COLLECTOR, 1 + extraWaterCollSlots, pmcProfile);
        }

        const filterSlots = pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.AIR_FILTERING).slots.length;
        const extraFilterSlots = globals.config.SkillsSettings.HideoutManagement.EliteSlots.AirFilteringUnit.Slots;

        if (filterSlots < 3 + extraFilterSlots) {
            this.logger.debug("Updating air filter area slots to a size of 3 + hideout management skill");
            this.addEmptyObjectsToHideoutAreaSlots(HideoutAreas.AIR_FILTERING, 3 + extraFilterSlots, pmcProfile);
        }

        const btcFarmSlots = pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.BITCOIN_FARM).slots.length;
        const extraBtcSlots = globals.config.SkillsSettings.HideoutManagement.EliteSlots.BitcoinFarm.Slots;

        // BTC Farm doesnt have extra slots for hideout management, but we still check for modded stuff!!
        if (btcFarmSlots < 50 + extraBtcSlots) {
            this.logger.debug("Updating bitcoin farm area slots to a size of 50 + hideout management skill");
            this.addEmptyObjectsToHideoutAreaSlots(HideoutAreas.BITCOIN_FARM, 50 + extraBtcSlots, pmcProfile);
        }

        const cultistAreaSlots = pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.CIRCLE_OF_CULTISTS).slots
            .length;
        if (cultistAreaSlots < 1) {
            this.logger.debug("Updating cultist area slots to a size of 1");
            this.addEmptyObjectsToHideoutAreaSlots(HideoutAreas.CIRCLE_OF_CULTISTS, 1, pmcProfile);
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
    ): void {
        const area = pmcProfile.Hideout.Areas.find((x) => x.type === areaType);
        area.slots = this.addObjectsToArray(emptyItemCount, area.slots);
    }

    protected addObjectsToArray(count: number, slots: IHideoutSlot[]): IHideoutSlot[] {
        for (let i = 0; i < count; i++) {
            if (!slots.some((x) => x.locationIndex === i)) {
                slots.push({ locationIndex: i });
            }
        }

        return slots;
    }

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
                    this.logger.warning(
                        `Non-default trader: ${traderId} purchase removed from traderPurchases list in profile`,
                    );
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
     * REQUIRED for dev profiles
     * Iterate over players hideout areas and find what's build, look for missing bonuses those areas give and add them if missing
     * @param pmcProfile Profile to update
     */
    public addMissingHideoutBonusesToProfile(pmcProfile: IPmcData): void {
        const profileHideoutAreas = pmcProfile.Hideout.Areas;
        const profileBonuses = pmcProfile.Bonuses;
        const dbHideoutAreas = this.databaseService.getHideout().areas;

        for (const profileArea of profileHideoutAreas) {
            const areaType = profileArea.type;
            const level = profileArea.level;

            if (level === 0) {
                continue;
            }

            // Get array of hideout area upgrade levels to check for bonuses
            // Zero indexed
            const areaLevelsToCheck: number[] = [];
            for (let index = 0; index < level + 1; index++) {
                areaLevelsToCheck.push(index);
            }

            // Iterate over area levels, check for bonuses, add if needed
            const dbArea = dbHideoutAreas.find((x) => x.type === areaType);
            if (!dbArea) {
                continue;
            }

            for (const level of areaLevelsToCheck) {
                // Get areas level bonuses from db
                const levelBonuses = dbArea.stages[level]?.bonuses;
                if (!levelBonuses || levelBonuses.length === 0) {
                    continue;
                }

                // Iterate over each bonus for the areas level
                for (const bonus of levelBonuses) {
                    // Check if profile has bonus
                    const profileBonus = this.getBonusFromProfile(profileBonuses, bonus);
                    if (!profileBonus) {
                        // no bonus, add to profile
                        this.logger.debug(
                            `Profile has level ${level} area ${
                                HideoutAreas[profileArea.type]
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
    protected getBonusFromProfile(profileBonuses: IBonus[], bonus: IStageBonus): IBonus | undefined {
        // match by id first, used by "TextBonus" bonuses
        if (bonus.id) {
            return profileBonuses.find((x) => x.id === bonus.id);
        }

        if (bonus.type === BonusType.STASH_SIZE) {
            return profileBonuses.find((x) => x.type === bonus.type && x.templateId === bonus.templateId);
        }

        if (bonus.type === BonusType.ADDITIONAL_SLOTS) {
            return profileBonuses.find(
                (x) => x.type === bonus.type && x.value === bonus.value && x.visible === bonus.visible,
            );
        }

        return profileBonuses.find((x) => x.type === bonus.type && x.value === bonus.value);
    }

    public checkForAndRemoveInvalidTraders(fullProfile: ISptProfile) {
        for (const traderId in fullProfile.characters.pmc.TradersInfo) {
            if (!this.traderHelper.traderEnumHasValue(traderId)) {
                this.logger.error(this.localisationService.getText("fixer-trader_found", traderId));
                if (this.coreConfig.fixes.removeInvalidTradersFromProfile) {
                    this.logger.warning(
                        `Non-default trader: ${traderId} removed from PMC TradersInfo in: ${fullProfile.info.id} profile`,
                    );
                    delete fullProfile.characters.pmc.TradersInfo[traderId];
                }
            }
        }

        for (const traderId in fullProfile.characters.scav.TradersInfo) {
            if (!this.traderHelper.traderEnumHasValue(traderId)) {
                this.logger.error(this.localisationService.getText("fixer-trader_found", traderId));
                if (this.coreConfig.fixes.removeInvalidTradersFromProfile) {
                    this.logger.warning(
                        `Non-default trader: ${traderId} removed from Scav TradersInfo in: ${fullProfile.info.id} profile`,
                    );
                    delete fullProfile.characters.scav.TradersInfo[traderId];
                }
            }
        }
    }
}
