import { HandbookHelper } from "@spt/helpers/HandbookHelper";
import { IStaticAmmoDetails } from "@spt/models/eft/common/ILocation";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IInsuredItem } from "@spt/models/eft/common/tables/IBotBase";
import { IItem, IItemLocation, IUpd, IUpdRepairable } from "@spt/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { EquipmentSlots } from "@spt/models/enums/EquipmentSlots";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import { Money } from "@spt/models/enums/Money";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseService } from "@spt/services/DatabaseService";
import { ItemBaseClassService } from "@spt/services/ItemBaseClassService";
import { ItemFilterService } from "@spt/services/ItemFilterService";
import { LocaleService } from "@spt/services/LocaleService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { CompareUtil } from "@spt/utils/CompareUtil";
import { HashUtil } from "@spt/utils/HashUtil";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { MathUtil } from "@spt/utils/MathUtil";
import { ProbabilityObject, ProbabilityObjectArray, RandomUtil } from "@spt/utils/RandomUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class ItemHelper {
    protected readonly defaultInvalidBaseTypes: string[] = [
        BaseClasses.LOOT_CONTAINER,
        BaseClasses.MOB_CONTAINER,
        BaseClasses.STASH,
        BaseClasses.SORTING_TABLE,
        BaseClasses.INVENTORY,
        BaseClasses.STATIONARY_CONTAINER,
        BaseClasses.POCKETS,
    ];

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("MathUtil") protected mathUtil: MathUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("ItemBaseClassService") protected itemBaseClassService: ItemBaseClassService,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("LocaleService") protected localeService: LocaleService,
        @inject("CompareUtil") protected compareUtil: CompareUtil,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {}

    /**
     * Does the provided pool of items contain the desired item
     * @param itemPool Item collection to check
     * @param item Item to look for
     * @param slotId OPTIONAL - slotid of desired item
     * @returns True if pool contains item
     */
    public hasItemWithTpl(itemPool: IItem[], item: ItemTpl, slotId?: string): boolean {
        // Filter the pool by slotId if provided
        const filteredPool = slotId ? itemPool.filter((item) => item.slotId?.startsWith(slotId)) : itemPool;

        // Check if any item in the filtered pool matches the provided item
        return filteredPool.some((poolItem) => poolItem._tpl === item);
    }

    /**
     * Get the first item from provided pool with the desired tpl
     * @param itemPool Item collection to search
     * @param item Item to look for
     * @param slotId OPTIONAL - slotid of desired item
     * @returns Item or undefined
     */
    public getItemFromPoolByTpl(itemPool: IItem[], item: ItemTpl, slotId?: string): IItem | undefined {
        // Filter the pool by slotId if provided
        const filteredPool = slotId ? itemPool.filter((item) => item.slotId?.startsWith(slotId)) : itemPool;

        // Check if any item in the filtered pool matches the provided item
        return filteredPool.find((poolItem) => poolItem._tpl === item);
    }

    /**
     * This method will compare two items (with all its children) and see if the are equivalent.
     * This method will NOT compare IDs on the items
     * @param item1 first item with all its children to compare
     * @param item2 second item with all its children to compare
     * @param compareUpdProperties Upd properties to compare between the items
     * @returns true if they are the same, false if they arent
     */
    public isSameItems(item1: IItem[], item2: IItem[], compareUpdProperties?: Set<string>): boolean {
        if (item1.length !== item2.length) {
            return false;
        }
        for (const itemOf1 of item1) {
            const itemOf2 = item2.find((i2) => i2._tpl === itemOf1._tpl);
            if (itemOf2 === undefined) {
                return false;
            }
            if (!this.isSameItem(itemOf1, itemOf2, compareUpdProperties)) {
                return false;
            }
        }
        return true;
    }

    /**
     * This method will compare two items and see if the are equivalent.
     * This method will NOT compare IDs on the items
     * @param item1 first item to compare
     * @param item2 second item to compare
     * @param compareUpdProperties Upd properties to compare between the items
     * @returns true if they are the same, false if they arent
     */
    public isSameItem(item1: IItem, item2: IItem, compareUpdProperties?: Set<string>): boolean {
        if (item1._tpl !== item2._tpl) {
            return false;
        }

        if (compareUpdProperties) {
            return Array.from(compareUpdProperties.values()).every((p) =>
                this.compareUtil.recursiveCompare(item1.upd?.[p], item2.upd?.[p]),
            );
        }

        return this.compareUtil.recursiveCompare(item1.upd, item2.upd);
    }

    /**
     * Helper method to generate a Upd based on a template
     * @param itemTemplate the item template to generate a Upd for
     * @returns A Upd with all the default properties set
     */
    public generateUpdForItem(itemTemplate: ITemplateItem): IUpd {
        const itemProperties: IUpd = {};

        // armors, etc
        if (itemTemplate._props.MaxDurability) {
            itemProperties.Repairable = {
                Durability: itemTemplate._props.MaxDurability,
                MaxDurability: itemTemplate._props.MaxDurability,
            };
        }

        if (itemTemplate._props.HasHinge) {
            itemProperties.Togglable = { On: true };
        }

        if (itemTemplate._props.Foldable) {
            itemProperties.Foldable = { Folded: false };
        }

        if (itemTemplate._props.weapFireType?.length) {
            if (itemTemplate._props.weapFireType.includes("fullauto")) {
                itemProperties.FireMode = { FireMode: "fullauto" };
            } else {
                itemProperties.FireMode = { FireMode: this.randomUtil.getArrayValue(itemTemplate._props.weapFireType) };
            }
        }

        if (itemTemplate._props.MaxHpResource) {
            itemProperties.MedKit = { HpResource: itemTemplate._props.MaxHpResource };
        }

        if (itemTemplate._props.MaxResource && itemTemplate._props.foodUseTime) {
            itemProperties.FoodDrink = { HpPercent: itemTemplate._props.MaxResource };
        }

        if (itemTemplate._parent === BaseClasses.FLASHLIGHT) {
            itemProperties.Light = { IsActive: false, SelectedMode: 0 };
        } else if (itemTemplate._parent === BaseClasses.TACTICAL_COMBO) {
            itemProperties.Light = { IsActive: false, SelectedMode: 0 };
        }

        if (itemTemplate._parent === BaseClasses.NIGHTVISION) {
            itemProperties.Togglable = { On: false };
        }

        // Togglable face shield
        if (itemTemplate._props.HasHinge && itemTemplate._props.FaceShieldComponent) {
            itemProperties.Togglable = { On: false };
        }

        return itemProperties;
    }

    /**
     * Checks if a tpl is a valid item. Valid meaning that it's an item that be stored in stash
     * Valid means:
     *  Not quest item
     *  'Item' type
     *  Not on the invalid base types array
     *  Price above 0 roubles
     *  Not on item config blacklist
     * @param    {string}  tpl  the template id / tpl
     * @returns                 boolean; true for items that may be in player possession and not quest items
     */
    public isValidItem(tpl: string, invalidBaseTypes?: string[]): boolean {
        const baseTypes = invalidBaseTypes || this.defaultInvalidBaseTypes;
        const itemDetails = this.getItem(tpl);

        if (!itemDetails[0]) {
            return false;
        }

        return (
            !itemDetails[1]._props.QuestItem &&
            itemDetails[1]._type === "Item" &&
            baseTypes.every((x) => !this.isOfBaseclass(tpl, x)) &&
            this.getItemPrice(tpl) > 0 &&
            !this.itemFilterService.isItemBlacklisted(tpl)
        );
    }

    /**
     * Check if the tpl / template Id provided is a descendent of the baseclass
     *
     * @param   {string}    tpl             the item template id to check
     * @param   {string}    baseClassTpl    the baseclass to check for
     * @return  {boolean}                   is the tpl a descendent?
     */
    public isOfBaseclass(tpl: string, baseClassTpl: string): boolean {
        return this.itemBaseClassService.itemHasBaseClass(tpl, [baseClassTpl]);
    }

    /**
     * Check if item has any of the supplied base classes
     * @param tpl Item to check base classes of
     * @param baseClassTpls base classes to check for
     * @returns true if any supplied base classes match
     */
    public isOfBaseclasses(tpl: string, baseClassTpls: string[]): boolean {
        return this.itemBaseClassService.itemHasBaseClass(tpl, baseClassTpls);
    }

    /**
     * Does the provided item have the chance to require soft armor inserts
     * Only applies to helmets/vest/armors.
     * Not all head gear needs them
     * @param itemTpl item to check
     * @returns Does item have the possibility ot need soft inserts
     */
    public armorItemCanHoldMods(itemTpl: string): boolean {
        return this.isOfBaseclasses(itemTpl, [BaseClasses.HEADWEAR, BaseClasses.VEST, BaseClasses.ARMOR]);
    }

    /**
     * Does the provided item tpl need soft/removable inserts to function
     * @param itemTpl Armor item
     * @returns True if item needs some kind of insert
     */
    public armorItemHasRemovableOrSoftInsertSlots(itemTpl: string): boolean {
        if (!this.armorItemCanHoldMods(itemTpl)) {
            return false;
        }

        return this.armorItemHasRemovablePlateSlots(itemTpl) || this.itemRequiresSoftInserts(itemTpl);
    }

    /**
     * Does the pased in tpl have ability to hold removable plate items
     * @param itemTpl item tpl to check for plate support
     * @returns True when armor can hold plates
     */
    public armorItemHasRemovablePlateSlots(itemTpl: string): boolean {
        const itemTemplate = this.getItem(itemTpl);
        const plateSlotIds = this.getRemovablePlateSlotIds();

        return itemTemplate[1]._props.Slots.some((slot) => plateSlotIds.includes(slot._name.toLowerCase()));
    }

    /**
     * Does the provided item tpl require soft inserts to become a valid armor item
     * @param itemTpl Item tpl to check
     * @returns True if it needs armor inserts
     */
    public itemRequiresSoftInserts(itemTpl: string): boolean {
        // not a slot that takes soft-inserts
        if (!this.armorItemCanHoldMods(itemTpl)) {
            return false;
        }

        // Check is an item
        const itemDbDetails = this.getItem(itemTpl);
        if (!itemDbDetails[0]) {
            return false;
        }

        // Has no slots
        if (!(itemDbDetails[1]._props.Slots ?? []).length) {
            return false;
        }

        // Check if item has slots that match soft insert name ids
        const softInsertIds = this.getSoftInsertSlotIds();
        if (itemDbDetails[1]._props.Slots.some((slot) => softInsertIds.includes(slot._name.toLowerCase()))) {
            return true;
        }

        return false;
    }

    /**
     * Get all soft insert slot ids
     * @returns An array of soft insert ids (e.g. soft_armor_back, helmet_top)
     */
    public getSoftInsertSlotIds(): string[] {
        return [
            "groin",
            "groin_back",
            "soft_armor_back",
            "soft_armor_front",
            "soft_armor_left",
            "soft_armor_right",
            "shoulder_l",
            "shoulder_r",
            "collar",
            "helmet_top",
            "helmet_back",
            "helmet_eyes",
            "helmet_jaw",
            "helmet_ears",
        ];
    }

    /**
     * Returns the items total price based on the handbook or as a fallback from the prices.json if the item is not
     * found in the handbook. If the price can't be found at all return 0
     * @param tpls item tpls to look up the price of
     * @returns Total price in roubles
     */
    public getItemAndChildrenPrice(tpls: string[]): number {
        // Run getItemPrice for each tpl in tpls array, return sum
        return tpls.reduce((total, tpl) => total + this.getItemPrice(tpl), 0);
    }

    /**
     * Returns the item price based on the handbook or as a fallback from the prices.json if the item is not
     * found in the handbook. If the price can't be found at all return 0
     * @param tpl Item to look price up of
     * @returns Price in roubles
     */
    public getItemPrice(tpl: string): number {
        const handbookPrice = this.getStaticItemPrice(tpl);
        if (handbookPrice >= 1) {
            return handbookPrice;
        }

        const dynamicPrice = this.getDynamicItemPrice(tpl);
        if (dynamicPrice) {
            return dynamicPrice;
        }

        return 0;
    }

    /**
     * Returns the item price based on the handbook or as a fallback from the prices.json if the item is not
     * found in the handbook. If the price can't be found at all return 0
     * @param tpl Item to look price up of
     * @returns Price in roubles
     */
    public getItemMaxPrice(tpl: string): number {
        const staticPrice = this.getStaticItemPrice(tpl);
        const dynamicPrice = this.getDynamicItemPrice(tpl);

        return Math.max(staticPrice, dynamicPrice);
    }

    /**
     * Get the static (handbook) price in roubles for an item by tpl
     * @param tpl Items tpl id to look up price
     * @returns Price in roubles (0 if not found)
     */
    public getStaticItemPrice(tpl: string): number {
        const handbookPrice = this.handbookHelper.getTemplatePrice(tpl);
        if (handbookPrice >= 1) {
            return handbookPrice;
        }

        return 0;
    }

    /**
     * Get the dynamic (flea) price in roubles for an item by tpl
     * @param tpl Items tpl id to look up price
     * @returns Price in roubles (undefined if not found)
     */
    public getDynamicItemPrice(tpl: string): number {
        const dynamicPrice = this.databaseService.getPrices()[tpl];
        if (dynamicPrice) {
            return dynamicPrice;
        }

        return 0;
    }

    /**
     * Update items upd.StackObjectsCount to be 1 if its upd is missing or StackObjectsCount is undefined
     * @param item Item to update
     * @returns Fixed item
     */
    public fixItemStackCount(item: IItem): IItem {
        if (item.upd === undefined) {
            item.upd = { StackObjectsCount: 1 };
        }

        if (item.upd.StackObjectsCount === undefined) {
            item.upd.StackObjectsCount = 1;
        }
        return item;
    }

    /**
     * Get cloned copy of all item data from items.json
     * @returns array of ITemplateItem objects
     */
    public getItems(): ITemplateItem[] {
        return this.cloner.clone(Object.values(this.databaseService.getItems()));
    }

    /**
     * Gets item data from items.json
     * @param tpl items template id to look up
     * @returns bool - is valid + template item object as array
     */
    public getItem(tpl: string): [boolean, ITemplateItem] {
        // -> Gets item from <input: _tpl>
        if (tpl in this.databaseService.getItems()) {
            return [true, this.databaseService.getItems()[tpl]];
        }

        return [false, undefined];
    }

    public itemHasSlots(itemTpl: string): boolean {
        return this.getItem(itemTpl)[1]._props.Slots?.length > 0;
    }

    public isItemInDb(tpl: string): boolean {
        const itemDetails = this.getItem(tpl);

        return itemDetails[0];
    }

    /**
     * Calcualte the average quality of an item and its children
     * @param items An offers item to process
     * @param skipArmorItemsWithoutDurability Skip over armor items without durability
     * @returns % quality modifer between 0 and 1
     */
    public getItemQualityModifierForItems(items: IItem[], skipArmorItemsWithoutDurability?: boolean): number {
        if (this.isOfBaseclass(items[0]._tpl, BaseClasses.WEAPON)) {
            return this.getItemQualityModifier(items[0]);
        }

        let qualityModifier = 0;
        let itemsWithQualityCount = 0;
        for (const item of items) {
            const result = this.getItemQualityModifier(item, skipArmorItemsWithoutDurability);
            if (result === -1) {
                continue;
            }

            qualityModifier += result;
            itemsWithQualityCount++;
        }

        if (itemsWithQualityCount === 0) {
            // Can happen when rigs without soft inserts or plates are listed
            return 1;
        }

        return Math.min(qualityModifier / itemsWithQualityCount, 1);
    }

    /**
     * get normalized value (0-1) based on item condition
     * Will return -1 for base armor items with 0 durability
     * @param item
     * @param skipArmorItemsWithoutDurability return -1 for armor items that have maxdurability of 0
     * @returns Number between 0 and 1
     */
    public getItemQualityModifier(item: IItem, skipArmorItemsWithoutDurability?: boolean): number {
        // Default to 100%
        let result = 1;

        // Is armor and has 0 max durability
        const itemDetails = this.getItem(item._tpl)[1];
        if (
            skipArmorItemsWithoutDurability &&
            this.isOfBaseclass(item._tpl, BaseClasses.ARMOR) &&
            itemDetails._props.MaxDurability === 0
        ) {
            return -1;
        }

        if (item.upd) {
            const medkit = item.upd.MedKit ? item.upd.MedKit : undefined;
            const repairable = item.upd.Repairable ? item.upd.Repairable : undefined;
            const foodDrink = item.upd.FoodDrink ? item.upd.FoodDrink : undefined;
            const key = item.upd.Key ? item.upd.Key : undefined;
            const resource = item.upd.Resource ? item.upd.Resource : undefined;
            const repairKit = item.upd.RepairKit ? item.upd.RepairKit : undefined;

            if (medkit) {
                // Meds
                result = medkit.HpResource / itemDetails._props.MaxHpResource;
            } else if (repairable) {
                result = this.getRepairableItemQualityValue(itemDetails, repairable, item);
            } else if (foodDrink) {
                // food & drink
                result = foodDrink.HpPercent / itemDetails._props.MaxResource;
            } else if (key && key.NumberOfUsages > 0 && itemDetails._props.MaximumNumberOfUsage > 0) {
                // keys - keys count upwards, not down like everything else
                const maxNumOfUsages = itemDetails._props.MaximumNumberOfUsage;
                result = (maxNumOfUsages - key.NumberOfUsages) / maxNumOfUsages;
            } else if (resource && resource.UnitsConsumed > 0) {
                // Things like fuel tank
                result = resource.Value / itemDetails._props.MaxResource;
            } else if (repairKit) {
                // Repair kits
                result = repairKit.Resource / itemDetails._props.MaxRepairResource;
            }

            if (result === 0) {
                // make item non-zero but still very low
                result = 0.01;
            }

            return result;
        }

        return result;
    }

    /**
     * Get a quality value based on a repairable items (weapon/armor) current state between current and max durability
     * @param itemDetails Db details for item we want quality value for
     * @param repairable Repairable properties
     * @param item Item quality value is for
     * @returns A number between 0 and 1
     */
    protected getRepairableItemQualityValue(
        itemDetails: ITemplateItem,
        repairable: IUpdRepairable,
        item: IItem,
    ): number {
        // Edge case, max durability is below durability
        if (repairable.Durability > repairable.MaxDurability) {
            this.logger.warning(
                `Max durability: ${repairable.MaxDurability} for item id: ${item._id} was below durability: ${repairable.Durability}, adjusting values to match`,
            );
            repairable.MaxDurability = repairable.Durability;
        }

        // Attempt to get the max durability from _props. If not available, use Repairable max durability value instead.
        const maxDurability = itemDetails._props.MaxDurability
            ? itemDetails._props.MaxDurability
            : repairable.MaxDurability;
        const durability = repairable.Durability / maxDurability;

        if (!durability) {
            this.logger.error(this.localisationService.getText("item-durability_value_invalid_use_default", item._tpl));

            return 1;
        }

        return Math.sqrt(durability);
    }

    /**
     * Recursive function that looks at every item from parameter and gets their childrens Ids + includes parent item in results
     * @param items Array of items (item + possible children)
     * @param baseItemId Parent items id
     * @returns an array of strings
     */
    public findAndReturnChildrenByItems(items: IItem[], baseItemId: string): string[] {
        const list: string[] = [];

        for (const childitem of items) {
            if (childitem.parentId === baseItemId) {
                list.push(...this.findAndReturnChildrenByItems(items, childitem._id));
            }
        }

        list.push(baseItemId); // Required, push original item id onto array

        return list;
    }

    /**
     * A variant of findAndReturnChildren where the output is list of item objects instead of their ids.
     * @param items Array of items (item + possible children)
     * @param baseItemId Parent items id
     * @param modsOnly Include only mod items, exclude items stored inside root item
     * @returns An array of Item objects
     */
    public findAndReturnChildrenAsItems(items: IItem[], baseItemId: string, modsOnly = false): IItem[] {
        const list: IItem[] = [];
        for (const childItem of items) {
            // Include itself
            if (childItem._id === baseItemId) {
                list.unshift(childItem);
                continue;
            }

            // Is stored in parent and disallowed
            if (modsOnly && childItem.location) {
                continue;
            }

            // Items parentid matches root item AND returned items doesnt contain current child
            if (childItem.parentId === baseItemId && !list.some((item) => childItem._id === item._id)) {
                list.push(...this.findAndReturnChildrenAsItems(items, childItem._id));
            }
        }

        return list;
    }

    /**
     * Find children of the item in a given assort (weapons parts for example, need recursive loop function)
     * @param itemIdToFind Template id of item to check for
     * @param assort Array of items to check in
     * @returns Array of children of requested item
     */
    public findAndReturnChildrenByAssort(itemIdToFind: string, assort: IItem[]): IItem[] {
        let list: IItem[] = [];

        for (const itemFromAssort of assort) {
            if (itemFromAssort.parentId === itemIdToFind && !list.some((item) => itemFromAssort._id === item._id)) {
                list.push(itemFromAssort);
                list = list.concat(this.findAndReturnChildrenByAssort(itemFromAssort._id, assort));
            }
        }

        return list;
    }

    /**
     * Check if the passed in item has buy count restrictions
     * @param itemToCheck Item to check
     * @returns true if it has buy restrictions
     */
    public hasBuyRestrictions(itemToCheck: IItem): boolean {
        if (itemToCheck.upd?.BuyRestrictionCurrent !== undefined && itemToCheck.upd?.BuyRestrictionMax !== undefined) {
            return true;
        }

        return false;
    }

    /**
     * is the passed in template id a dog tag
     * @param tpl Template id to check
     * @returns true if it is a dogtag
     */
    public isDogtag(tpl: string): boolean {
        const dogTagTpls = [
            ItemTpl.BARTER_DOGTAG_BEAR,
            ItemTpl.BARTER_DOGTAG_BEAR_EOD,
            ItemTpl.BARTER_DOGTAG_BEAR_TUE,
            ItemTpl.BARTER_DOGTAG_USEC,
            ItemTpl.BARTER_DOGTAG_USEC_EOD,
            ItemTpl.BARTER_DOGTAG_USEC_TUE,
        ];

        return dogTagTpls.includes(<any>tpl);
    }

    /**
     * Gets the identifier for a child using slotId, locationX and locationY.
     * @param item
     * @returns "slotId OR slotid,locationX,locationY"
     */
    public getChildId(item: IItem): string {
        if (!("location" in item)) {
            return item.slotId;
        }

        return `${item.slotId},${(item.location as IItemLocation).x},${(item.location as IItemLocation).y}`;
    }

    /**
     * Can the passed in item be stacked
     * @param tpl item to check
     * @returns true if it can be stacked
     */
    public isItemTplStackable(tpl: string): boolean {
        const item = this.databaseService.getItems()[tpl];
        if (!item) {
            return undefined;
        }

        return item._props.StackMaxSize > 1;
    }

    /**
     * Split item stack if it exceeds its items StackMaxSize property into child items of passed in parent
     * @param itemToSplit Item to split into smaller stacks
     * @returns Array of root item + children
     */
    public splitStack(itemToSplit: IItem): IItem[] {
        if (itemToSplit?.upd?.StackObjectsCount === undefined) {
            return [itemToSplit];
        }

        const maxStackSize = this.getItem(itemToSplit._tpl)[1]._props.StackMaxSize;
        let remainingCount = itemToSplit.upd.StackObjectsCount;
        const rootAndChildren: IItem[] = [];

        // If the current count is already equal or less than the max
        // return the item as is.
        if (remainingCount <= maxStackSize) {
            rootAndChildren.push(this.cloner.clone(itemToSplit));

            return rootAndChildren;
        }

        while (remainingCount) {
            const amount = Math.min(remainingCount, maxStackSize);
            const newStackClone = this.cloner.clone(itemToSplit);

            newStackClone._id = this.hashUtil.generate();
            newStackClone.upd.StackObjectsCount = amount;
            remainingCount -= amount;
            rootAndChildren.push(newStackClone);
        }

        return rootAndChildren;
    }

    /**
     * Turn items like money into separate stacks that adhere to max stack size
     * @param itemToSplit Item to split into smaller stacks
     * @returns
     */
    public splitStackIntoSeparateItems(itemToSplit: IItem): IItem[][] {
        const itemTemplate = this.getItem(itemToSplit._tpl)[1];
        const itemMaxStackSize = itemTemplate._props.StackMaxSize ?? 1;

        // item already within bounds of stack size, return it
        if (itemToSplit.upd?.StackObjectsCount <= itemMaxStackSize) {
            return [[itemToSplit]];
        }

        // Split items stack into chunks
        const result: IItem[][] = [];
        let remainingCount = itemToSplit.upd.StackObjectsCount;
        while (remainingCount) {
            const amount = Math.min(remainingCount, itemMaxStackSize);
            const newItemClone = this.cloner.clone(itemToSplit);

            newItemClone._id = this.hashUtil.generate();
            newItemClone.upd.StackObjectsCount = amount;
            remainingCount -= amount;
            result.push([newItemClone]);
        }

        return result;
    }

    /**
     * Find Barter items from array of items
     * @param {string} by tpl or id
     * @param {IItem[]} itemsToSearch Array of items to iterate over
     * @param {string} desiredBarterItemIds
     * @returns Array of Item objects
     */
    public findBarterItems(by: "tpl" | "id", itemsToSearch: IItem[], desiredBarterItemIds: string | string[]): IItem[] {
        // Find required items to take after buying (handles multiple items)
        const desiredBarterIds =
            typeof desiredBarterItemIds === "string" ? [desiredBarterItemIds] : desiredBarterItemIds;

        const matchingItems: IItem[] = [];
        for (const barterId of desiredBarterIds) {
            const filterResult = itemsToSearch.filter((item) => {
                return by === "tpl" ? item._tpl === barterId : item._id === barterId;
            });

            matchingItems.push(...filterResult);
        }

        if (matchingItems.length === 0) {
            this.logger.warning(`No items found for barter Id: ${desiredBarterIds}`);
        }

        return matchingItems;
    }

    /**
     * Replace the _id value for base item + all children that are children of it
     * REPARENTS ROOT ITEM ID, NOTHING ELSE
     * @param itemWithChildren Item with mods to update
     * @param newId new id to add on chidren of base item
     */
    public replaceRootItemID(itemWithChildren: IItem[], newId = this.hashUtil.generate()): void {
        // original id on base item
        const oldId = itemWithChildren[0]._id;

        // Update base item to use new id
        itemWithChildren[0]._id = newId;

        // Update all parentIds of items attached to base item to use new id
        for (const item of itemWithChildren) {
            if (item.parentId === oldId) {
                item.parentId = newId;
            }
        }
    }

    /**
     * Regenerate all GUIDs with new IDs, for the exception of special item types (e.g. quest, sorting table, etc.) This
     * function will not mutate the original items array, but will return a new array with new GUIDs.
     *
     * @param originalItems Items to adjust the IDs of
     * @param pmcData Player profile
     * @param insuredItems Insured items that should not have their IDs replaced
     * @param fastPanel Quick slot panel
     * @returns Item[]
     */
    public replaceIDs(
        originalItems: IItem[],
        pmcData?: IPmcData,
        insuredItems?: IInsuredItem[],
        fastPanel?: any,
    ): IItem[] {
        let items = this.cloner.clone(originalItems); // Deep-clone the items to avoid mutation.
        let serialisedInventory = this.jsonUtil.serialize(items);
        const hideoutAreaStashes = Object.values(pmcData?.Inventory.hideoutAreaStashes ?? {});

        for (const item of items) {
            if (pmcData) {
                // Insured items should not be renamed. Only works for PMCs.
                if (insuredItems?.find((insuredItem) => insuredItem.itemId === item._id)) {
                    continue;
                }

                // Do not replace the IDs of specific types of items.
                if (
                    item._id === pmcData.Inventory.equipment ||
                    item._id === pmcData.Inventory.questRaidItems ||
                    item._id === pmcData.Inventory.questStashItems ||
                    item._id === pmcData.Inventory.sortingTable ||
                    item._id === pmcData.Inventory.stash ||
                    item._id === pmcData.Inventory.hideoutCustomizationStashId ||
                    hideoutAreaStashes?.includes(item._id)
                ) {
                    continue;
                }
            }

            // Replace the ID of the item in the serialised inventory using a regular expression.
            const oldId = item._id;
            const newId = this.hashUtil.generate();
            serialisedInventory = serialisedInventory.replace(new RegExp(oldId, "g"), newId);

            // Also replace in quick slot if the old ID exists.
            if (fastPanel) {
                for (const itemSlot in fastPanel) {
                    if (fastPanel[itemSlot] === oldId) {
                        fastPanel[itemSlot] = fastPanel[itemSlot].replace(new RegExp(oldId, "g"), newId);
                    }
                }
            }
        }

        items = this.jsonUtil.deserialize(serialisedInventory);

        // fix duplicate id's
        const dupes: Record<string, number> = {};
        const newParents: Record<string, IItem[]> = {};
        const childrenMapping = {};
        const oldToNewIds: Record<string, string[]> = {};

        // Finding duplicate IDs involves scanning the item three times.
        // First scan - Check which ids are duplicated.
        // Second scan - Map parents to items.
        // Third scan - Resolve IDs.
        for (const item of items) {
            dupes[item._id] = (dupes[item._id] || 0) + 1;
        }

        for (const item of items) {
            // register the parents
            if (dupes[item._id] > 1) {
                const newId = this.hashUtil.generate();

                newParents[item.parentId] = newParents[item.parentId] || [];
                newParents[item.parentId].push(item);
                oldToNewIds[item._id] = oldToNewIds[item._id] || [];
                oldToNewIds[item._id].push(newId);
            }
        }

        for (const item of items) {
            if (dupes[item._id] > 1) {
                const oldId = item._id;
                const newId = oldToNewIds[oldId].splice(0, 1)[0];
                item._id = newId;

                // Extract one of the children that's also duplicated.
                if (oldId in newParents && newParents[oldId].length > 0) {
                    childrenMapping[newId] = {};
                    for (const childIndex in newParents[oldId]) {
                        // Make sure we haven't already assigned another duplicate child of
                        // same slot and location to this parent.
                        const childId = this.getChildId(newParents[oldId][childIndex]);

                        if (!(childId in childrenMapping[newId])) {
                            childrenMapping[newId][childId] = 1;
                            newParents[oldId][childIndex].parentId = newId;
                            // Some very fucking sketchy stuff on this childIndex
                            // No clue wth was that childIndex supposed to be, but its not
                            newParents[oldId].splice(Number.parseInt(childIndex), 1);
                        }
                    }
                }
            }
        }

        return items;
    }

    /**
     * Mark the passed in array of items as found in raid.
     * Modifies passed in items
     * @param items The list of items to mark as FiR
     */
    public setFoundInRaid(items: IItem[]): void {
        for (const item of items) {
            if (!item.upd) {
                item.upd = {};
            }

            item.upd.SpawnedInSession = true;
        }
    }

    /**
     * WARNING, SLOW. Recursively loop down through an items hierarchy to see if any of the ids match the supplied list, return true if any do
     * @param {string} tpl Items tpl to check parents of
     * @param {Array} tplsToCheck Tpl values to check if parents of item match
     * @returns boolean Match found
     */
    public doesItemOrParentsIdMatch(tpl: string, tplsToCheck: string[]): boolean {
        const itemDetails = this.getItem(tpl);
        const itemExists = itemDetails[0];
        const item = itemDetails[1];

        // not an item, drop out
        if (!itemExists) {
            return false;
        }

        // no parent to check
        if (!item._parent) {
            return false;
        }

        // Does templateId match any values in tplsToCheck array
        if (tplsToCheck.includes(item._id)) {
            return true;
        }

        // Does the items parent type exist in tplsToCheck array
        if (tplsToCheck.includes(item._parent)) {
            return true;
        }

        // check items parent with same method
        return this.doesItemOrParentsIdMatch(item._parent, tplsToCheck);
    }

    /**
     * Check if item is quest item
     * @param tpl Items tpl to check quest status of
     * @returns true if item is flagged as quest item
     */
    public isQuestItem(tpl: string): boolean {
        const itemDetails = this.getItem(tpl);
        if (itemDetails[0] && itemDetails[1]._props.QuestItem) {
            return true;
        }

        return false;
    }

    /**
     * Checks to see if the item is *actually* moddable in-raid. Checks include the items existence in the database, the
     * parent items existence in the database, the existence (and value) of the items RaidModdable property, and that
     * the parents slot-required property exists, matches that of the item, and it's value.
     *
     * Note: this function does not preform any checks to see if the item and parent are *actually* related.
     *
     * @param item The item to be checked
     * @param parent The parent of the item to be checked
     * @returns True if the item is actually moddable, false if it is not, and undefined if the check cannot be performed.
     */
    public isRaidModdable(item: IItem, parent: IItem): boolean | undefined {
        // This check requires the item to have the slotId property populated.
        if (!item.slotId) {
            return undefined;
        }

        const itemTemplate = this.getItem(item._tpl);
        const parentTemplate = this.getItem(parent._tpl);

        // Check for RaidModdable property on the item template.
        let isNotRaidModdable = false;
        if (itemTemplate[0]) {
            isNotRaidModdable = itemTemplate[1]?._props?.RaidModdable === false;
        }

        // Check to see if the slot that the item is attached to is marked as required in the parent item's template.
        let isRequiredSlot = false;
        if (parentTemplate[0] && parentTemplate[1]?._props?.Slots) {
            isRequiredSlot = parentTemplate[1]._props.Slots.some(
                (slot) => slot._name === item.slotId && slot._required,
            );
        }

        return itemTemplate[0] && parentTemplate[0] && !(isNotRaidModdable || isRequiredSlot);
    }

    /**
     * Retrieves the main parent item for a given attachment item.
     *
     * This method traverses up the hierarchy of items starting from a given `itemId`, until it finds the main parent
     * item that is not an attached attachment itself. In other words, if you pass it an item id of a suppressor, it
     * will traverse up the muzzle brake, barrel, upper receiver, and return the gun that the suppressor is ultimately
     * attached to, even if that gun is located within multiple containers.
     *
     * It's important to note that traversal is expensive, so this method requires that you pass it a Map of the items
     * to traverse, where the keys are the item IDs and the values are the corresponding Item objects. This alleviates
     * some of the performance concerns, as it allows for quick lookups of items by ID.
     *
     * @param itemId - The unique identifier of the item for which to find the main parent.
     * @param itemsMap - A Map containing item IDs mapped to their corresponding Item objects for quick lookup.
     * @returns The Item object representing the top-most parent of the given item, or `undefined` if no such parent exists.
     */
    public getAttachmentMainParent(itemId: string, itemsMap: Map<string, IItem>): IItem | undefined {
        let currentItem = itemsMap.get(itemId);
        while (currentItem && this.isAttachmentAttached(currentItem)) {
            currentItem = itemsMap.get(currentItem.parentId);
            if (!currentItem) {
                return undefined;
            }
        }
        return currentItem;
    }

    /**
     * Determines if an item is an attachment that is currently attached to it's parent item.
     *
     * @param item The item to check.
     * @returns true if the item is attached attachment, otherwise false.
     */
    public isAttachmentAttached(item: IItem): boolean {
        const equipmentSlots = Object.values(EquipmentSlots).map((value) => value as string);

        return !(
            ["hideout", "main"].includes(item.slotId) ||
            equipmentSlots.includes(item.slotId) ||
            !Number.isNaN(Number(item.slotId))
        );
    }

    /**
     * Retrieves the equipment parent item for a given item.
     *
     * This method traverses up the hierarchy of items starting from a given `itemId`, until it finds the equipment
     * parent item. In other words, if you pass it an item id of a suppressor, it will traverse up the muzzle brake,
     * barrel, upper receiver, gun, nested backpack, and finally return the backpack Item that is equipped.
     *
     * It's important to note that traversal is expensive, so this method requires that you pass it a Map of the items
     * to traverse, where the keys are the item IDs and the values are the corresponding Item objects. This alleviates
     * some of the performance concerns, as it allows for quick lookups of items by ID.
     *
     * @param itemId - The unique identifier of the item for which to find the equipment parent.
     * @param itemsMap - A Map containing item IDs mapped to their corresponding Item objects for quick lookup.
     * @returns The Item object representing the equipment parent of the given item, or `undefined` if no such parent exists.
     */
    public getEquipmentParent(itemId: string, itemsMap: Map<string, IItem>): IItem | undefined {
        let currentItem = itemsMap.get(itemId);
        const equipmentSlots = Object.values(EquipmentSlots).map((value) => value as string);

        while (currentItem && !equipmentSlots.includes(currentItem.slotId)) {
            currentItem = itemsMap.get(currentItem.parentId);
            if (!currentItem) {
                return undefined;
            }
        }
        return currentItem;
    }

    /**
     * Get the inventory size of an item
     * @param items Item with children
     * @param rootItemId
     * @returns ItemSize object (width and height)
     */
    public getItemSize(items: IItem[], rootItemId: string): ItemHelper.IItemSize {
        const rootTemplate = this.getItem(items.filter((x) => x._id === rootItemId)[0]._tpl)[1];
        const width = rootTemplate._props.Width;
        const height = rootTemplate._props.Height;

        let sizeUp = 0;
        let sizeDown = 0;
        let sizeLeft = 0;
        let sizeRight = 0;

        let forcedUp = 0;
        let forcedDown = 0;
        let forcedLeft = 0;
        let forcedRight = 0;

        const children = this.findAndReturnChildrenAsItems(items, rootItemId);
        for (const ci of children) {
            const itemTemplate = this.getItem(ci._tpl)[1];

            // Calculating child ExtraSize
            if (itemTemplate._props.ExtraSizeForceAdd === true) {
                forcedUp += itemTemplate._props.ExtraSizeUp;
                forcedDown += itemTemplate._props.ExtraSizeDown;
                forcedLeft += itemTemplate._props.ExtraSizeLeft;
                forcedRight += itemTemplate._props.ExtraSizeRight;
            } else {
                sizeUp = sizeUp < itemTemplate._props.ExtraSizeUp ? itemTemplate._props.ExtraSizeUp : sizeUp;
                sizeDown = sizeDown < itemTemplate._props.ExtraSizeDown ? itemTemplate._props.ExtraSizeDown : sizeDown;
                sizeLeft = sizeLeft < itemTemplate._props.ExtraSizeLeft ? itemTemplate._props.ExtraSizeLeft : sizeLeft;
                sizeRight =
                    sizeRight < itemTemplate._props.ExtraSizeRight ? itemTemplate._props.ExtraSizeRight : sizeRight;
            }
        }

        return {
            width: width + sizeLeft + sizeRight + forcedLeft + forcedRight,
            height: height + sizeUp + sizeDown + forcedUp + forcedDown,
        };
    }

    /**
     * Get a random cartridge from an items Filter property
     * @param item Db item template to look up Cartridge filter values from
     * @returns Caliber of cartridge
     */
    public getRandomCompatibleCaliberTemplateId(item: ITemplateItem): string | undefined {
        const cartridges = item?._props?.Cartridges[0]?._props?.filters[0]?.Filter;

        if (!cartridges) {
            this.logger.warning(`Failed to find cartridge for item: ${item?._id} ${item?._name}`);
            return undefined;
        }

        return this.randomUtil.getArrayValue(cartridges);
    }

    /**
     * Add cartridges to the ammo box with correct max stack sizes
     * @param ammoBox Box to add cartridges to
     * @param ammoBoxDetails Item template from items db
     */
    public addCartridgesToAmmoBox(ammoBox: IItem[], ammoBoxDetails: ITemplateItem): void {
        const ammoBoxMaxCartridgeCount = ammoBoxDetails._props.StackSlots[0]._max_count;
        const cartridgeTpl = ammoBoxDetails._props.StackSlots[0]._props.filters[0].Filter[0];
        const cartridgeDetails = this.getItem(cartridgeTpl);
        const cartridgeMaxStackSize = cartridgeDetails[1]._props.StackMaxSize;

        // Exit if ammo already exists in box
        if (ammoBox.some((item) => item._tpl === cartridgeTpl)) {
            return;
        }

        // Add new stack-size-correct items to ammo box
        let currentStoredCartridgeCount = 0;
        const maxPerStack = Math.min(ammoBoxMaxCartridgeCount, cartridgeMaxStackSize);
        // Find location based on Max ammo box size
        let location = Math.ceil(ammoBoxMaxCartridgeCount / maxPerStack) - 1;

        while (currentStoredCartridgeCount < ammoBoxMaxCartridgeCount) {
            const remainingSpace = ammoBoxMaxCartridgeCount - currentStoredCartridgeCount;
            const cartridgeCountToAdd = remainingSpace < maxPerStack ? remainingSpace : maxPerStack;

            // Add cartridge item into items array
            const cartridgeItemToAdd = this.createCartridges(
                ammoBox[0]._id,
                cartridgeTpl,
                cartridgeCountToAdd,
                location,
                ammoBox[0].upd?.SpawnedInSession,
            );

            // In live no ammo box has the first cartridge item with a location
            if (location === 0) {
                // biome-ignore lint/performance/noDelete: Delete is fine here as we entirely want to get rid of the location.
                delete cartridgeItemToAdd.location;
            }

            ammoBox.push(cartridgeItemToAdd);

            currentStoredCartridgeCount += cartridgeCountToAdd;
            location--;
        }
    }

    /**
     * Add a single stack of cartridges to the ammo box
     * @param ammoBox Box to add cartridges to
     * @param ammoBoxDetails Item template from items db
     */
    public addSingleStackCartridgesToAmmoBox(ammoBox: IItem[], ammoBoxDetails: ITemplateItem): void {
        const ammoBoxMaxCartridgeCount = ammoBoxDetails._props.StackSlots[0]._max_count;
        const cartridgeTpl = ammoBoxDetails._props.StackSlots[0]._props.filters[0].Filter[0];
        ammoBox.push(
            this.createCartridges(
                ammoBox[0]._id,
                cartridgeTpl,
                ammoBoxMaxCartridgeCount,
                0,
                ammoBox[0].upd?.SpawnedInSession,
            ),
        );
    }

    /**
     * Check if item is stored inside of a container
     * @param itemToCheck Item to check is inside of container
     * @param desiredContainerSlotId Name of slot to check item is in e.g. SecuredContainer/Backpack
     * @param items Inventory with child parent items to check
     * @returns True when item is in container
     */
    public itemIsInsideContainer(itemToCheck: IItem, desiredContainerSlotId: string, items: IItem[]): boolean {
        // Get items parent
        const parent = items.find((item) => item._id === itemToCheck.parentId);
        if (!parent) {
            // No parent, end of line, not inside container
            return false;
        }

        if (parent.slotId === desiredContainerSlotId) {
            return true;
        }

        return this.itemIsInsideContainer(parent, desiredContainerSlotId, items);
    }

    /**
     * Add child items (cartridges) to a magazine
     * @param magazine Magazine to add child items to
     * @param magTemplate Db template of magazine
     * @param staticAmmoDist Cartridge distribution
     * @param caliber Caliber of cartridge to add to magazine
     * @param minSizePercent % the magazine must be filled to
     * @param defaultCartridgeTpl Cartridge to use when none found
     * @param weapon Weapon the magazine will be used for (if passed in uses Chamber as whitelist)
     */
    public fillMagazineWithRandomCartridge(
        magazine: IItem[],
        magTemplate: ITemplateItem,
        staticAmmoDist: Record<string, IStaticAmmoDetails[]>,
        caliber?: string,
        minSizePercent = 0.25,
        defaultCartridgeTpl?: string,
        weapon?: ITemplateItem,
    ): void {
        let chosenCaliber = caliber || this.getRandomValidCaliber(magTemplate);

        // Edge case for the Klin pp-9, it has a typo in its ammo caliber
        if (chosenCaliber === "Caliber9x18PMM") {
            chosenCaliber = "Caliber9x18PM";
        }

        // Chose a randomly weighted cartridge that fits
        const cartridgeTpl = this.drawAmmoTpl(
            chosenCaliber,
            staticAmmoDist,
            defaultCartridgeTpl,
            weapon?._props?.Chambers[0]?._props?.filters[0]?.Filter,
        );
        if (!cartridgeTpl) {
            this.logger.debug(
                `Unable to fill item: ${magazine[0]._id} ${magTemplate._name} with cartrides as none were found.`,
            );

            return;
        }

        this.fillMagazineWithCartridge(magazine, magTemplate, cartridgeTpl, minSizePercent);
    }

    /**
     * Add child items to a magazine of a specific cartridge
     * @param magazineWithChildCartridges Magazine to add child items to
     * @param magTemplate Db template of magazine
     * @param cartridgeTpl Cartridge to add to magazine
     * @param minSizeMultiplier % the magazine must be filled to
     */
    public fillMagazineWithCartridge(
        magazineWithChildCartridges: IItem[],
        magTemplate: ITemplateItem,
        cartridgeTpl: string,
        minSizeMultiplier = 0.25,
    ): void {
        // Get cartridge properties and max allowed stack size
        const cartridgeDetails = this.getItem(cartridgeTpl);
        if (!cartridgeDetails[0]) {
            this.logger.error(this.localisationService.getText("item-invalid_tpl_item", cartridgeTpl));
        }

        const cartridgeMaxStackSize = cartridgeDetails[1]._props?.StackMaxSize;
        if (!cartridgeMaxStackSize) {
            this.logger.error(`Item with tpl: ${cartridgeTpl} lacks a _props or StackMaxSize property`);
        }

        // Get max number of cartridges in magazine, choose random value between min/max
        const magazineCartridgeMaxCount = this.isOfBaseclass(magTemplate._id, BaseClasses.SPRING_DRIVEN_CYLINDER)
            ? magTemplate._props.Slots.length // Edge case for rotating grenade launcher magazine
            : magTemplate._props.Cartridges[0]?._max_count;

        if (!magazineCartridgeMaxCount) {
            this.logger.warning(
                `Magazine: ${magTemplate._id} ${magTemplate._name} lacks a Cartridges array, unable to fill magazine with ammo`,
            );

            return;
        }

        const desiredStackCount = this.randomUtil.getInt(
            Math.round(minSizeMultiplier * magazineCartridgeMaxCount),
            magazineCartridgeMaxCount,
        );

        if (magazineWithChildCartridges.length > 1) {
            this.logger.warning(`Magazine ${magTemplate._name} already has cartridges defined, this may cause issues`);
        }

        // Loop over cartridge count and add stacks to magazine
        let currentStoredCartridgeCount = 0;
        let location = 0;
        while (currentStoredCartridgeCount < desiredStackCount) {
            // Get stack size of cartridges
            let cartridgeCountToAdd =
                desiredStackCount <= cartridgeMaxStackSize ? desiredStackCount : cartridgeMaxStackSize;

            // Ensure we don't go over the max stackcount size
            const remainingSpace = desiredStackCount - currentStoredCartridgeCount;
            if (cartridgeCountToAdd > remainingSpace) {
                cartridgeCountToAdd = remainingSpace;
            }

            // Add cartridge item object into items array
            magazineWithChildCartridges.push(
                this.createCartridges(
                    magazineWithChildCartridges[0]._id,
                    cartridgeTpl,
                    cartridgeCountToAdd,
                    location,
                    magazineWithChildCartridges[0].upd?.SpawnedInSession,
                ),
            );

            currentStoredCartridgeCount += cartridgeCountToAdd;
            location++;
        }

        // Only one cartridge stack added, remove location property as its only used for 2 or more stacks
        if (location === 1) {
            // biome-ignore lint/performance/noDelete: Delete is fine here as we entirely want to get rid of the location.
            delete magazineWithChildCartridges[1].location;
        }
    }

    /**
     * Choose a random bullet type from the list of possible a magazine has
     * @param magTemplate Magazine template from Db
     * @returns Tpl of cartridge
     */
    protected getRandomValidCaliber(magTemplate: ITemplateItem): string {
        const ammoTpls = magTemplate._props.Cartridges[0]._props.filters[0].Filter;
        const calibers = [
            ...new Set(
                ammoTpls
                    .filter((x: string) => this.getItem(x)[0])
                    .map((x: string) => this.getItem(x)[1]._props.Caliber),
            ),
        ];
        return this.randomUtil.drawRandomFromList(calibers)[0];
    }

    /**
     * Chose a randomly weighted cartridge that fits
     * @param caliber Desired caliber
     * @param staticAmmoDist Cartridges and thier weights
     * @param fallbackCartridgeTpl If a cartridge cannot be found in the above staticAmmoDist param, use this instead
     * @param cartridgeWhitelist OPTIONAL whitelist for cartridges
     * @returns Tpl of cartridge
     */
    protected drawAmmoTpl(
        caliber: string,
        staticAmmoDist: Record<string, IStaticAmmoDetails[]>,
        fallbackCartridgeTpl: string,
        cartridgeWhitelist?: string[],
    ): string | undefined {
        const ammos = staticAmmoDist[caliber];
        if (!ammos && fallbackCartridgeTpl) {
            this.logger.error(
                `Unable to pick a cartridge for caliber: ${caliber} as staticAmmoDist has no data. using fallback value of ${fallbackCartridgeTpl}`,
            );

            return fallbackCartridgeTpl;
        }

        if (!Array.isArray(ammos) && fallbackCartridgeTpl) {
            this.logger.error(
                `Unable to pick a cartridge for caliber: ${caliber}, the chosen staticAmmoDist data is not an array. Using fallback value of ${fallbackCartridgeTpl}`,
            );

            return fallbackCartridgeTpl;
        }

        if (!ammos && !fallbackCartridgeTpl) {
            this.logger.debug(
                `Unable to pick a cartridge for caliber: ${caliber} as staticAmmoDist has no data. No fallback value provided`,
            );

            return;
        }
        const ammoArray = new ProbabilityObjectArray<string>(this.mathUtil, this.cloner);
        for (const icd of ammos) {
            // Whitelist exists and tpl not inside it, skip
            // Fixes 9x18mm kedr issues
            if (cartridgeWhitelist && !cartridgeWhitelist.includes(icd.tpl)) {
                continue;
            }

            ammoArray.push(new ProbabilityObject(icd.tpl, icd.relativeProbability));
        }
        return ammoArray.draw(1)[0];
    }

    /**
     * Create a basic cartrige object
     * @param parentId container cartridges will be placed in
     * @param ammoTpl Cartridge to insert
     * @param stackCount Count of cartridges inside parent
     * @param location Location inside parent (e.g. 0, 1)
     * @param foundInRaid OPTIONAL - Are cartridges found in raid (SpawnedInSession)
     * @returns Item
     */
    public createCartridges(
        parentId: string,
        ammoTpl: string,
        stackCount: number,
        location: number,
        foundInRaid = false,
    ): IItem {
        return {
            _id: this.hashUtil.generate(),
            _tpl: ammoTpl,
            parentId: parentId,
            slotId: "cartridges",
            location: location,
            upd: { StackObjectsCount: stackCount, SpawnedInSession: foundInRaid },
        };
    }

    /**
     * Get the size of a stack, return 1 if no stack object count property found
     * @param item Item to get stack size of
     * @returns size of stack
     */
    public getItemStackSize(item: IItem): number {
        if (item.upd?.StackObjectsCount) {
            return item.upd.StackObjectsCount;
        }

        return 1;
    }

    /**
     * Get the name of an item from the locale file using the item tpl
     * @param itemTpl Tpl of item to get name of
     * @returns Full name, short name if not found
     */
    public getItemName(itemTpl: string): string {
        const localeDb = this.localeService.getLocaleDb();
        const result = localeDb[`${itemTpl} Name`];
        if (result?.length > 0) {
            return result;
        }

        return localeDb[`${itemTpl} ShortName`];
    }

    /**
     * Get all item tpls with a desired base type
     * @param desiredBaseType Item base type wanted
     * @returns Array of tpls
     */
    public getItemTplsOfBaseType(desiredBaseType: string): string[] {
        return Object.values(this.databaseService.getItems())
            .filter((item) => item._parent === desiredBaseType)
            .map((item) => item._id);
    }

    /**
     * Add child slot items to an item, chooses random child item if multiple choices exist
     * @param itemToAdd array with single object (root item)
     * @param itemToAddTemplate Db tempalte for root item
     * @param modSpawnChanceDict Optional dictionary of mod name + % chance mod will be included in item (e.g. front_plate: 100)
     * @param requiredOnly Only add required mods
     * @returns Item with children
     */
    public addChildSlotItems(
        itemToAdd: IItem[],
        itemToAddTemplate: ITemplateItem,
        modSpawnChanceDict?: Record<string, number>,
        requiredOnly = false,
    ): IItem[] {
        const result = itemToAdd;
        const incompatibleModTpls: Set<string> = new Set();
        for (const slot of itemToAddTemplate._props.Slots) {
            // If only required mods is requested, skip non-essential
            if (requiredOnly && !slot._required) {
                continue;
            }

            // Roll chance for non-required slot mods
            if (modSpawnChanceDict && !slot._required) {
                // only roll chance to not include mod if dict exists and has value for this mod type (e.g. front_plate)
                const modSpawnChance = modSpawnChanceDict[slot._name.toLowerCase()];
                if (modSpawnChance) {
                    if (!this.randomUtil.getChance100(modSpawnChance)) {
                        continue;
                    }
                }
            }

            const itemPool = slot._props.filters[0].Filter ?? [];
            if (itemPool.length === 0) {
                this.logger.debug(
                    `Unable to choose a mod for slot: ${slot._name} on item: ${itemToAddTemplate._id} ${itemToAddTemplate._name}, parents' 'Filter' array is empty, skipping`,
                );

                continue;
            }

            const chosenTpl = this.getCompatibleTplFromArray(itemPool, incompatibleModTpls);
            if (!chosenTpl) {
                this.logger.debug(
                    `Unable to choose a mod for slot: ${slot._name} on item: ${itemToAddTemplate._id} ${itemToAddTemplate._name}, no compatible tpl found in pool of ${itemPool.length}, skipping`,
                );

                continue;
            }

            // Create basic item structure ready to add to weapon array
            const modItemToAdd = {
                _id: this.hashUtil.generate(),
                _tpl: chosenTpl,
                parentId: result[0]._id,
                slotId: slot._name,
            };

            // Add chosen item to weapon array
            result.push(modItemToAdd);

            const modItemDbDetails = this.getItem(modItemToAdd._tpl)[1];

            // Include conflicting items of newly added mod in pool to be used for next mod choice
            modItemDbDetails._props.ConflictingItems.forEach(incompatibleModTpls.add, incompatibleModTpls);
        }

        return result;
    }

    /**
     * Get a compatible tpl from the array provided where it is not found in the provided incompatible mod tpls parameter
     * @param possibleTpls Tpls to randomly choose from
     * @param incompatibleModTpls Incompatible tpls to not allow
     * @returns Chosen tpl or undefined
     */
    public getCompatibleTplFromArray(possibleTpls: string[], incompatibleModTpls: Set<string>): string | undefined {
        if (possibleTpls.length === 0) {
            return undefined;
        }

        let chosenTpl: string | undefined = undefined;
        let count = 0;
        while (!chosenTpl) {
            // Loop over choosing a random tpl until one is found or count varaible reaches the same size as the possible tpls array
            const tpl = this.randomUtil.getArrayValue(possibleTpls);
            if (incompatibleModTpls.has(tpl)) {
                // Incompatible tpl was chosen, try again
                count++;
                if (count >= possibleTpls.length) {
                    return undefined;
                }
                continue;
            }

            chosenTpl = tpl;
        }

        return chosenTpl;
    }

    /**
     * Is the provided item._props.Slots._name property a plate slot
     * @param slotName Name of slot (_name) of Items Slot array
     * @returns True if its a slot that holds a removable palte
     */
    public isRemovablePlateSlot(slotName: string): boolean {
        return this.getRemovablePlateSlotIds().includes(slotName.toLowerCase());
    }

    /**
     * Get a list of slot names that hold removable plates
     * @returns Array of slot ids (e.g. front_plate)
     */
    public getRemovablePlateSlotIds(): string[] {
        return ["front_plate", "back_plate", "left_side_plate", "right_side_plate"];
    }

    /**
     * Generate new unique ids for child items while preserving hierarchy
     * @param rootItem Base/primary item
     * @param itemWithChildren Primary item + children of primary item
     * @returns Item array with updated IDs
     */
    public reparentItemAndChildren(rootItem: IItem, itemWithChildren: IItem[]): IItem[] {
        const oldRootId = itemWithChildren[0]._id;
        const idMappings = {};

        idMappings[oldRootId] = rootItem._id;

        for (const mod of itemWithChildren) {
            if (idMappings[mod._id] === undefined) {
                idMappings[mod._id] = this.hashUtil.generate();
            }

            // Has parentId + no remapping exists for its parent
            if (mod.parentId !== undefined && idMappings[mod.parentId] === undefined) {
                // Make remapping for items parentId
                idMappings[mod.parentId] = this.hashUtil.generate();
            }

            mod._id = idMappings[mod._id];
            if (mod.parentId !== undefined) {
                mod.parentId = idMappings[mod.parentId];
            }
        }

        // Force item's details into first location of presetItems
        if (itemWithChildren[0]._tpl !== rootItem._tpl) {
            this.logger.warning(`Reassigning root item from ${itemWithChildren[0]._tpl} to ${rootItem._tpl}`);
        }

        itemWithChildren[0] = rootItem;

        return itemWithChildren;
    }

    /**
     * Update a root items _id property value to be unique
     * @param itemWithChildren Item to update root items _id property
     * @param newId Optional: new id to use
     * @returns New root id
     */
    public remapRootItemId(itemWithChildren: IItem[], newId = this.hashUtil.generate()): string {
        const rootItemExistingId = itemWithChildren[0]._id;

        for (const item of itemWithChildren) {
            // Root, update id
            if (item._id === rootItemExistingId) {
                item._id = newId;

                continue;
            }

            // Child with parent of root, update
            if (item.parentId === rootItemExistingId) {
                item.parentId = newId;
            }
        }

        return newId;
    }

    /**
     * Adopts orphaned items by resetting them as root "hideout" items. Helpful in situations where a parent has been
     * deleted from a group of items and there are children still referencing the missing parent. This method will
     * remove the reference from the children to the parent and set item properties to root values.
     *
     * @param rootId The ID of the "root" of the container.
     * @param items Array of Items that should be adjusted.
     * @returns Array of Items that have been adopted.
     */
    public adoptOrphanedItems(rootId: string, items: IItem[]): IItem[] {
        for (const item of items) {
            // Check if the item's parent exists.
            const parentExists = items.some((parentItem) => parentItem._id === item.parentId);

            // If the parent does not exist and the item is not already a 'hideout' item, adopt the orphaned item by
            // setting the parent ID to the PMCs inventory equipment ID, the slot ID to 'hideout', and remove the location.
            if (!parentExists && item.parentId !== rootId && item.slotId !== "hideout") {
                item.parentId = rootId;
                item.slotId = "hideout";
                // biome-ignore lint/performance/noDelete: Delete is fine here as we entirely want to get rid of the location.
                delete item.location;
            }
        }

        return items;
    }

    /**
     * Populate a Map object of items for quick lookup using their ID.
     *
     * @param items An array of Items that should be added to a Map.
     * @returns A Map where the keys are the item IDs and the values are the corresponding Item objects.
     */
    public generateItemsMap(items: IItem[]): Map<string, IItem> {
        const itemsMap = new Map<string, IItem>();
        for (const item of items) {
            itemsMap.set(item._id, item);
        }
        return itemsMap;
    }

    /**
     * Add a blank upd object to passed in item if it does not exist already
     * @param item item to add upd to
     * @param warningMessageWhenMissing text to write to log when upd object was not found
     * @returns True when upd object was added
     */
    public addUpdObjectToItem(item: IItem, warningMessageWhenMissing?: string): boolean {
        if (!item.upd) {
            item.upd = {};

            if (warningMessageWhenMissing) {
                this.logger.debug(warningMessageWhenMissing);
            }

            return true;
        }

        return false;
    }

    /**
     * Return all tpls from Money enum
     * @returns string tpls
     */
    public getMoneyTpls(): string[] {
        return Object.values(Money);
    }

    /**
     * Get a randomsied stack size for the passed in ammo
     * @param ammoItemTemplate Ammo to get stack size for
     * @param maxLimit default: Limit to 60 to prevent crazy values when players use stack increase mods
     * @returns number
     */
    public getRandomisedAmmoStackSize(ammoItemTemplate: ITemplateItem, maxLimit = 60): number {
        return ammoItemTemplate._props.StackMaxSize === 1
            ? 1
            : this.randomUtil.getInt(
                  ammoItemTemplate._props.StackMinRandom,
                  Math.min(ammoItemTemplate._props.StackMaxRandom, maxLimit),
              );
    }

    public getItemBaseType(tpl: string, rootOnly = true) {
        const result = this.getItem(tpl);
        if (!result[0]) {
            // Not an item
            return undefined;
        }

        let currentItem = result[1];
        while (currentItem) {
            if (currentItem._type === "Node" && !rootOnly) {
                // Hit first base type
                return currentItem._id;
            }

            if (!currentItem._parent) {
                // No parent, reached root
                return currentItem._id;
            }

            // Get parent item and start loop again
            currentItem = this.getItem(tpl)[1];
        }
    }

    /**
     * Remove FiR status from passed in items
     * @param items Items to update FiR status of
     */
    public removeSpawnedInSessionPropertyFromItems(items: IItem[]): void {
        for (const item of items) {
            if (item.upd) {
                // biome-ignore lint/performance/noDelete: Delete is fine here as we're removing the entire property.
                delete item.upd.SpawnedInSession;
            }
        }
    }
}

namespace ItemHelper {
    export interface IItemSize {
        width: number;
        height: number;
    }
}
