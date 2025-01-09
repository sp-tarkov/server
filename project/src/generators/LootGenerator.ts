import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { MinMax } from "@spt/models/common/MinMax";
import { IPreset } from "@spt/models/eft/common/IGlobals";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { IRewardDetails, ISealedAirdropContainerSettings } from "@spt/models/spt/config/IInventoryConfig";
import { ILootRequest } from "@spt/models/spt/services/ILootRequest";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseService } from "@spt/services/DatabaseService";
import { ItemFilterService } from "@spt/services/ItemFilterService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { RagfairLinkedItemService } from "@spt/services/RagfairLinkedItemService";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { inject, injectable } from "tsyringe";

type ItemLimit = { current: number; max: number };

@injectable()
export class LootGenerator {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("RagfairLinkedItemService") protected ragfairLinkedItemService: RagfairLinkedItemService,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
    ) {}

    /**
     * Generate a list of items based on configuration options parameter
     * @param options parameters to adjust how loot is generated
     * @returns An array of loot items
     */
    public createRandomLoot(options: ILootRequest): IItem[] {
        const result: IItem[] = [];
        const itemTypeCounts = this.initItemLimitCounter(options.itemLimits);

        // Handle sealed weapon containers
        const sealedWeaponCrateCount = this.randomUtil.getInt(
            options.weaponCrateCount.min,
            options.weaponCrateCount.max,
        );
        if (sealedWeaponCrateCount > 0) {
            // Get list of all sealed containers from db - they're all the same, just for flavor
            const itemsDb = this.itemHelper.getItems();
            const sealedWeaponContainerPool = Object.values(itemsDb).filter((item) =>
                item._name.includes("event_container_airdrop"),
            );

            for (let index = 0; index < sealedWeaponCrateCount; index++) {
                // Choose one at random + add to results array
                const chosenSealedContainer = this.randomUtil.getArrayValue(sealedWeaponContainerPool);
                result.push({
                    _id: this.hashUtil.generate(),
                    _tpl: chosenSealedContainer._id,
                    upd: {
                        StackObjectsCount: 1,
                        SpawnedInSession: true,
                    },
                });
            }
        }

        // Get items from items.json that have a type of item + not in global blacklist + basetype is in whitelist
        const { itemPool, blacklist } = this.getItemRewardPool(
            options.itemBlacklist,
            options.itemTypeWhitelist,
            options.useRewardItemBlacklist,
            options.allowBossItems,
        );

        // Pool has items we could add as loot, proceed
        if (itemPool.length > 0) {
            const randomisedItemCount = this.randomUtil.getInt(options.itemCount.min, options.itemCount.max);
            for (let index = 0; index < randomisedItemCount; index++) {
                if (!this.findAndAddRandomItemToLoot(itemPool, itemTypeCounts, options, result)) {
                    // Failed to add, reduce index so we get another attempt
                    index--;
                }
            }
        }

        const globalDefaultPresets = Object.values(this.presetHelper.getDefaultPresets());
        const itemBlacklistArray = Array.from(blacklist);

        // Filter default presets to just weapons
        const randomisedWeaponPresetCount = this.randomUtil.getInt(
            options.weaponPresetCount.min,
            options.weaponPresetCount.max,
        );
        if (randomisedWeaponPresetCount > 0) {
            const weaponDefaultPresets = globalDefaultPresets.filter((preset) =>
                this.itemHelper.isOfBaseclass(preset._encyclopedia, BaseClasses.WEAPON),
            );

            if (weaponDefaultPresets.length > 0) {
                for (let index = 0; index < randomisedWeaponPresetCount; index++) {
                    if (
                        !this.findAndAddRandomPresetToLoot(
                            weaponDefaultPresets,
                            itemTypeCounts,
                            itemBlacklistArray,
                            result,
                        )
                    ) {
                        // Failed to add, reduce index so we get another attempt
                        index--;
                    }
                }
            }
        }

        // Filter default presets to just armors and then filter again by protection level
        const randomisedArmorPresetCount = this.randomUtil.getInt(
            options.armorPresetCount.min,
            options.armorPresetCount.max,
        );
        if (randomisedArmorPresetCount > 0) {
            const armorDefaultPresets = globalDefaultPresets.filter((preset) =>
                this.itemHelper.armorItemCanHoldMods(preset._encyclopedia),
            );
            const levelFilteredArmorPresets = armorDefaultPresets.filter((armor) =>
                this.isArmorOfDesiredProtectionLevel(armor, options),
            );

            // Add some armors to rewards
            if (levelFilteredArmorPresets.length > 0) {
                for (let index = 0; index < randomisedArmorPresetCount; index++) {
                    if (
                        !this.findAndAddRandomPresetToLoot(
                            levelFilteredArmorPresets,
                            itemTypeCounts,
                            itemBlacklistArray,
                            result,
                        )
                    ) {
                        // Failed to add, reduce index so we get another attempt
                        index--;
                    }
                }
            }
        }

        return result;
    }

    /**
     * Generate An array of items
     * TODO - handle weapon presets/ammo packs
     * @param forcedLootDict Dictionary of item tpls with minmax values
     * @returns Array of IItem
     */
    public createForcedLoot(forcedLootDict: Record<string, MinMax>): IItem[] {
        const result: IItem[] = [];

        const forcedItems = Object.keys(forcedLootDict);

        for (const tpl of forcedItems) {
            const details = forcedLootDict[tpl];
            const randomisedItemCount = this.randomUtil.getInt(details.min, details.max);

            // Add forced loot item to result
            const newLootItem: IItem = {
                _id: this.hashUtil.generate(),
                _tpl: tpl,
                upd: {
                    StackObjectsCount: randomisedItemCount,
                    SpawnedInSession: true,
                },
            };

            const splitResults = this.itemHelper.splitStack(newLootItem);
            result.push(...splitResults);
        }

        return result;
    }

    /**
     * Get pool of items from item db that fit passed in param criteria
     * @param itemTplBlacklist Prevent these items
     * @param itemTypeWhitelist Only allow these items
     * @param useRewardItemBlacklist Should item.json reward item config be used
     * @param allowBossItems Should boss items be allowed in result
     * @returns results of filtering + blacklist used
     */
    protected getItemRewardPool(
        itemTplBlacklist: string[],
        itemTypeWhitelist: string[],
        useRewardItemBlacklist: boolean,
        allowBossItems: boolean,
    ): { itemPool: [string, ITemplateItem][]; blacklist: Set<string> } {
        const itemsDb = this.databaseService.getItems();
        let itemBlacklist = new Set<string>([...this.itemFilterService.getBlacklistedItems(), ...itemTplBlacklist]);

        if (useRewardItemBlacklist) {
            const itemsToAdd = this.itemFilterService.getItemRewardBlacklist();

            // Get all items that match the blacklisted types and fold into item blacklist
            const itemTypeBlacklist = this.itemFilterService.getItemRewardBaseTypeBlacklist();
            const itemsMatchingTypeBlacklist = Object.values(itemsDb)
                .filter((templateItem) => this.itemHelper.isOfBaseclasses(templateItem._parent, itemTypeBlacklist))
                .map((templateItem) => templateItem._id);

            itemBlacklist = new Set([...itemBlacklist, ...itemsToAdd, ...itemsMatchingTypeBlacklist]);
        }

        if (!allowBossItems) {
            for (const bossItem of this.itemFilterService.getBossItems()) {
                itemBlacklist.add(bossItem);
            }
        }

        const items = Object.entries(itemsDb).filter(
            (item) =>
                !itemBlacklist.has(item[1]._id) &&
                item[1]._type.toLowerCase() === "item" &&
                !item[1]._props.QuestItem &&
                itemTypeWhitelist.includes(item[1]._parent),
        );

        return { itemPool: items, blacklist: itemBlacklist };
    }

    /**
     * Filter armor items by their front plates protection level - top if its a helmet
     * @param armor Armor preset to check
     * @param options Loot request options - armor level etc
     * @returns True if item has desired armor level
     */
    protected isArmorOfDesiredProtectionLevel(armor: IPreset, options: ILootRequest): boolean {
        const relevantSlots = ["front_plate", "helmet_top", "soft_armor_front"];
        for (const slotId of relevantSlots) {
            const armorItem = armor._items.find((item) => item?.slotId?.toLowerCase() === slotId);
            if (!armorItem) {
                continue;
            }

            const armorDetails = this.itemHelper.getItem(armorItem._tpl);
            const armorClass = Number.parseInt(armorDetails[1]._props.armorClass as any, 10);

            return options.armorLevelWhitelist.includes(armorClass);
        }

        return false;
    }

    /**
     * Construct item limit record to hold max and current item count for each item type
     * @param limits limits as defined in config
     * @returns record, key: item tplId, value: current/max item count allowed
     */
    protected initItemLimitCounter(limits: Record<string, number>): Record<string, ItemLimit> {
        const itemTypeCounts: Record<string, ItemLimit> = {};
        for (const itemTypeId in limits) {
            itemTypeCounts[itemTypeId] = { current: 0, max: limits[itemTypeId] };
        }

        return itemTypeCounts;
    }

    /**
     * Find a random item in items.json and add to result array
     * @param items items to choose from
     * @param itemTypeCounts item limit counts
     * @param options item filters
     * @param result array to add found item to
     * @returns true if item was valid and added to pool
     */
    protected findAndAddRandomItemToLoot(
        items: [string, ITemplateItem][],
        itemTypeCounts: Record<string, { current: number; max: number }>,
        options: ILootRequest,
        result: IItem[],
    ): boolean {
        const randomItem = this.randomUtil.getArrayValue(items)[1];

        const itemLimitCount = itemTypeCounts[randomItem._parent];
        if (itemLimitCount && itemLimitCount.current > itemLimitCount.max) {
            return false;
        }

        // Skip armors as they need to come from presets
        if (this.itemHelper.armorItemCanHoldMods(randomItem._id)) {
            return false;
        }

        const newLootItem: IItem = {
            _id: this.hashUtil.generate(),
            _tpl: randomItem._id,
            upd: {
                StackObjectsCount: 1,
                SpawnedInSession: true,
            },
        };

        // Special case - handle items that need a stackcount > 1
        if (randomItem._props.StackMaxSize > 1) {
            newLootItem.upd.StackObjectsCount = this.getRandomisedStackCount(randomItem, options);
        }

        newLootItem._tpl = randomItem._id;
        result.push(newLootItem);

        if (itemLimitCount) {
            // Increment item count as it's in limit array
            itemLimitCount.current++;
        }

        // Item added okay
        return true;
    }

    /**
     * Get a randomised stack count for an item between its StackMinRandom and StackMaxSize values
     * @param item item to get stack count of
     * @param options loot options
     * @returns stack count
     */
    protected getRandomisedStackCount(item: ITemplateItem, options: ILootRequest): number {
        let min = item._props.StackMinRandom;
        let max = item._props.StackMaxSize;

        if (options.itemStackLimits[item._id]) {
            min = options.itemStackLimits[item._id].min;
            max = options.itemStackLimits[item._id].max;
        }

        return this.randomUtil.getInt(min ?? 1, max ?? 1);
    }

    /**
     * Find a random item in items.json and add to result array
     * @param presetPool Presets to choose from
     * @param itemTypeCounts Item limit counts
     * @param itemBlacklist Items to skip
     * @param result Array to add chosen preset to
     * @returns true if preset was valid and added to pool
     */
    protected findAndAddRandomPresetToLoot(
        presetPool: IPreset[],
        itemTypeCounts: Record<string, { current: number; max: number }>,
        itemBlacklist: string[],
        result: IItem[],
    ): boolean {
        // Choose random preset and get details from item db using encyclopedia value (encyclopedia === tplId)
        const chosenPreset = this.randomUtil.getArrayValue(presetPool);
        if (!chosenPreset) {
            this.logger.warning("Unable to find random preset in given presets, skipping");

            return false;
        }

        // No `_encyclopedia` property, not possible to reliably get root item tpl
        if (!chosenPreset?._encyclopedia) {
            this.logger.debug(`Preset with id: ${chosenPreset?._id} lacks encyclopedia property, skipping`);

            return false;
        }

        // Get preset root item db details via its `_encyclopedia` property
        const itemDbDetails = this.itemHelper.getItem(chosenPreset._encyclopedia);
        if (!itemDbDetails[0]) {
            this.logger.debug(`Unable to find preset with tpl: ${chosenPreset._encyclopedia}, skipping`);

            return false;
        }

        // Skip preset if root item is blacklisted
        if (itemBlacklist.includes(chosenPreset._items[0]._tpl)) {
            return false;
        }

        // Some custom mod items lack a parent property
        if (!itemDbDetails[1]._parent) {
            this.logger.error(this.localisationService.getText("loot-item_missing_parentid", itemDbDetails[1]?._name));

            return false;
        }

        // Check chosen preset hasn't exceeded spawn limit
        const itemLimitCount = itemTypeCounts[itemDbDetails[1]._parent];
        if (itemLimitCount && itemLimitCount.current > itemLimitCount.max) {
            return false;
        }

        const presetAndMods: IItem[] = this.itemHelper.replaceIDs(chosenPreset._items);
        this.itemHelper.remapRootItemId(presetAndMods);
        // Add chosen preset tpl to result array
        for (const item of presetAndMods) {
            result.push(item);
        }

        if (itemLimitCount) {
            // Increment item count as item has been chosen and its inside itemLimitCount dictionary
            itemLimitCount.current++;
        }

        // Item added okay
        return true;
    }

    /**
     * Sealed weapon containers have a weapon + associated mods inside them + assortment of other things (food/meds)
     * @param containerSettings sealed weapon container settings
     * @returns Array of item with children arrays
     */
    public getSealedWeaponCaseLoot(containerSettings: ISealedAirdropContainerSettings): IItem[][] {
        const itemsToReturn: IItem[][] = [];

        // Choose a weapon to give to the player (weighted)
        const chosenWeaponTpl = this.weightedRandomHelper.getWeightedValue<string>(
            containerSettings.weaponRewardWeight,
        );

        // Get itemDb details of weapon
        const weaponDetailsDb = this.itemHelper.getItem(chosenWeaponTpl);
        if (!weaponDetailsDb[0]) {
            this.logger.error(
                this.localisationService.getText("loot-non_item_picked_as_sealed_weapon_crate_reward", chosenWeaponTpl),
            );

            return itemsToReturn;
        }

        // Get weapon preset - default or choose a random one from globals.json preset pool
        let chosenWeaponPreset = containerSettings.defaultPresetsOnly
            ? this.presetHelper.getDefaultPreset(chosenWeaponTpl)
            : this.randomUtil.getArrayValue(this.presetHelper.getPresets(chosenWeaponTpl));

        // No default preset found for weapon, choose a random one
        if (!chosenWeaponPreset) {
            this.logger.warning(
                this.localisationService.getText("loot-default_preset_not_found_using_random", chosenWeaponTpl),
            );
            chosenWeaponPreset = this.randomUtil.getArrayValue(this.presetHelper.getPresets(chosenWeaponTpl));
        }

        // Clean up Ids to ensure they're all unique and prevent collisions
        const presetAndMods: IItem[] = this.itemHelper.replaceIDs(chosenWeaponPreset._items);
        this.itemHelper.remapRootItemId(presetAndMods);

        // Add preset to return object
        itemsToReturn.push(presetAndMods);

        // Get a random collection of weapon mods related to chosen weawpon and add them to result array
        const linkedItemsToWeapon = this.ragfairLinkedItemService.getLinkedDbItems(chosenWeaponTpl);
        itemsToReturn.push(
            ...this.getSealedContainerWeaponModRewards(containerSettings, linkedItemsToWeapon, chosenWeaponPreset),
        );

        // Handle non-weapon mod reward types
        itemsToReturn.push(...this.getSealedContainerNonWeaponModRewards(containerSettings, weaponDetailsDb[1]));

        return itemsToReturn;
    }

    /**
     * Get non-weapon mod rewards for a sealed container
     * @param containerSettings Sealed weapon container settings
     * @param weaponDetailsDb Details for the weapon to reward player
     * @returns Array of item with children arrays
     */
    protected getSealedContainerNonWeaponModRewards(
        containerSettings: ISealedAirdropContainerSettings,
        weaponDetailsDb: ITemplateItem,
    ): IItem[][] {
        const rewards: IItem[][] = [];

        for (const rewardTypeId in containerSettings.rewardTypeLimits) {
            const settings = containerSettings.rewardTypeLimits[rewardTypeId];
            const rewardCount = this.randomUtil.getInt(settings.min, settings.max);

            if (rewardCount === 0) {
                continue;
            }

            // Edge case - ammo boxes
            if (rewardTypeId === BaseClasses.AMMO_BOX) {
                // Get ammoboxes from db
                const ammoBoxesDetails = containerSettings.ammoBoxWhitelist.map((tpl) => {
                    const itemDetails = this.itemHelper.getItem(tpl);
                    return itemDetails[1];
                });

                // Need to find boxes that matches weapons caliber
                const weaponCaliber = weaponDetailsDb._props.ammoCaliber;
                const ammoBoxesMatchingCaliber = ammoBoxesDetails.filter((x) => x._props.ammoCaliber === weaponCaliber);
                if (ammoBoxesMatchingCaliber.length === 0) {
                    this.logger.debug(`No ammo box with caliber ${weaponCaliber} found, skipping`);

                    continue;
                }

                for (let index = 0; index < rewardCount; index++) {
                    const chosenAmmoBox = this.randomUtil.getArrayValue(ammoBoxesMatchingCaliber);
                    const ammoBoxItem: IItem[] = [{ _id: this.hashUtil.generate(), _tpl: chosenAmmoBox._id }];
                    this.itemHelper.addCartridgesToAmmoBox(ammoBoxItem, chosenAmmoBox);
                    rewards.push(ammoBoxItem);
                }

                continue;
            }

            // Get all items of the desired type + not quest items + not globally blacklisted
            const rewardItemPool = Object.values(this.databaseService.getItems()).filter(
                (item) =>
                    item._parent === rewardTypeId &&
                    item._type.toLowerCase() === "item" &&
                    !this.itemFilterService.isItemBlacklisted(item._id) &&
                    !(containerSettings.allowBossItems || this.itemFilterService.isBossItem(item._id)) &&
                    !item._props.QuestItem,
            );

            if (rewardItemPool.length === 0) {
                this.logger.debug(`No items with base type of ${rewardTypeId} found, skipping`);

                continue;
            }

            for (let index = 0; index < rewardCount; index++) {
                // Choose a random item from pool
                const chosenRewardItem = this.randomUtil.getArrayValue(rewardItemPool);
                const rewardItem: IItem[] = [{ _id: this.hashUtil.generate(), _tpl: chosenRewardItem._id }];

                rewards.push(rewardItem);
            }
        }

        return rewards;
    }

    /**
     * Iterate over the container weaponModRewardLimits settings and create an array of weapon mods to reward player
     * @param containerSettings Sealed weapon container settings
     * @param linkedItemsToWeapon All items that can be attached/inserted into weapon
     * @param chosenWeaponPreset The weapon preset given to player as reward
     * @returns Array of item with children arrays
     */
    protected getSealedContainerWeaponModRewards(
        containerSettings: ISealedAirdropContainerSettings,
        linkedItemsToWeapon: ITemplateItem[],
        chosenWeaponPreset: IPreset,
    ): IItem[][] {
        const modRewards: IItem[][] = [];
        for (const rewardTypeId in containerSettings.weaponModRewardLimits) {
            const settings = containerSettings.weaponModRewardLimits[rewardTypeId];
            const rewardCount = this.randomUtil.getInt(settings.min, settings.max);

            // Nothing to add, skip reward type
            if (rewardCount === 0) {
                continue;
            }

            // Get items that fulfil reward type criteria from items that fit on gun
            const relatedItems = linkedItemsToWeapon?.filter(
                (item) => item?._parent === rewardTypeId && !this.itemFilterService.isItemBlacklisted(item._id),
            );
            if (!relatedItems || relatedItems.length === 0) {
                this.logger.debug(
                    `No items found to fulfil reward type: ${rewardTypeId} for weapon: ${chosenWeaponPreset._name}, skipping type`,
                );
                continue;
            }

            // Find a random item of the desired type and add as reward
            for (let index = 0; index < rewardCount; index++) {
                const chosenItem = this.randomUtil.drawRandomFromList(relatedItems);
                const item: IItem[] = [{ _id: this.hashUtil.generate(), _tpl: chosenItem[0]._id }];

                modRewards.push(item);
            }
        }

        return modRewards;
    }

    /**
     * Handle event-related loot containers - currently just the halloween jack-o-lanterns that give food rewards
     * @param rewardContainerDetails
     * @returns Array of item with children arrays
     */
    public getRandomLootContainerLoot(rewardContainerDetails: IRewardDetails): IItem[][] {
        const itemsToReturn: IItem[][] = [];

        // Get random items and add to newItemRequest
        for (let index = 0; index < rewardContainerDetails.rewardCount; index++) {
            // Pick random reward from pool, add to request object
            const chosenRewardItemTpl = this.pickRewardItem(rewardContainerDetails);

            if (this.presetHelper.hasPreset(chosenRewardItemTpl)) {
                const preset = this.presetHelper.getDefaultPreset(chosenRewardItemTpl);

                // Ensure preset has unique ids and is cloned so we don't alter the preset data stored in memory
                const presetAndMods: IItem[] = this.itemHelper.replaceIDs(preset._items);

                this.itemHelper.remapRootItemId(presetAndMods);
                itemsToReturn.push(presetAndMods);

                continue;
            }

            const rewardItem: IItem[] = [{ _id: this.hashUtil.generate(), _tpl: chosenRewardItemTpl }];
            itemsToReturn.push(rewardItem);
        }

        return itemsToReturn;
    }

    /**
     * Pick a reward item based on the reward details data
     * @param rewardContainerDetails
     * @returns Single tpl
     */
    protected pickRewardItem(rewardContainerDetails: IRewardDetails): string {
        if (rewardContainerDetails.rewardTplPool) {
            return this.weightedRandomHelper.getWeightedValue<string>(rewardContainerDetails.rewardTplPool);
        }

        return this.randomUtil.getArrayValue(
            this.getItemRewardPool([], rewardContainerDetails.rewardTypePool, true, true).itemPool.map(
                (item) => item[1]._id,
            ),
        );
    }
}
