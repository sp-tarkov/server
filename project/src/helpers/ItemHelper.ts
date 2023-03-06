import { inject, injectable } from "tsyringe";

import { IPmcData } from "../models/eft/common/IPmcData";
import { InsuredItem } from "../models/eft/common/tables/IBotBase";
import { Item, Location, Repairable } from "../models/eft/common/tables/IItem";
import { IStaticAmmoDetails } from "../models/eft/common/tables/ILootBase";
import { ITemplateItem } from "../models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "../models/enums/BaseClasses";
import { Money } from "../models/enums/Money";
import { ILogger } from "../models/spt/utils/ILogger";
import { DatabaseServer } from "../servers/DatabaseServer";
import { ItemBaseClassService } from "../services/ItemBaseClassService";
import { LocaleService } from "../services/LocaleService";
import { LocalisationService } from "../services/LocalisationService";
import { HashUtil } from "../utils/HashUtil";
import { JsonUtil } from "../utils/JsonUtil";
import { MathUtil } from "../utils/MathUtil";
import { ObjectId } from "../utils/ObjectId";
import { ProbabilityObject, ProbabilityObjectArray, RandomUtil } from "../utils/RandomUtil";
import { HandbookHelper } from "./HandbookHelper";

@injectable()
class ItemHelper
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ObjectId") protected objectId: ObjectId,
        @inject("MathUtil") protected mathUtil: MathUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("ItemBaseClassService") protected itemBaseClassService: ItemBaseClassService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("LocaleService") protected localeService: LocaleService
    )
    {}

    /**
     * Checks if an id is a valid item. Valid meaning that it's an item that be stored in stash
     * @param       {string}    tpl       the template id / tpl
     * @returns                             boolean; true for items that may be in player possession and not quest items
     */
    public isValidItem(tpl: string, invalidBaseTypes: string[] = null): boolean
    {
        const defaultInvalidBaseTypes: string[] = [
            BaseClasses.LOOT_CONTAINER,
            BaseClasses.MOD_CONTAINER,
            BaseClasses.STASH,
            BaseClasses.SORTING_TABLE,
            BaseClasses.INVENTORY,
            BaseClasses.STATIONARY_CONTAINER,
            BaseClasses.POCKETS
        ];

        if (invalidBaseTypes === null)
        {
            invalidBaseTypes = defaultInvalidBaseTypes;
        }

        const blacklist = [
            "5cffa483d7ad1a049e54ef1c", // mag_utes_ckib_nsv_belt_127x108_100
            "6087e570b998180e9f76dc24", // weapon_hultafors_db5000 Dead Blow Hammer
            "5d53f4b7a4b936793d58c780"  // scope_ags_npz_pag17_2,7x
        ];
        const itemDetails = this.getItem(tpl);

        if (!itemDetails[0])
        {
            return false;
        }

        // Is item valid
        return !itemDetails[1]._props.QuestItem
            && itemDetails[1]._type === "Item"
            && invalidBaseTypes.every(x => !this.isOfBaseclass(tpl, x))
            && this.getItemPrice(tpl) > 0
            && blacklist.every(v => !this.isOfBaseclass(tpl, v));
    }

    /**
     * Check if the tpl / template Id provided is a descendent of the baseclass
     *
     * @param   {string}    tpl             the item template id to check
     * @param   {string}    baseClassTpl    the baseclass to check for
     * @return  {boolean}                   is the tpl a descendent?
     */
    public isOfBaseclass(tpl: string, baseClassTpl: string): boolean
    {
        return this.itemBaseClassService.itemHasBaseClass(tpl, [baseClassTpl]);
    }

    /**
     * Check if item has any of the supplied base classes
     * @param tpl Item to check base classes of
     * @param baseClassTpls base classes to check for
     * @returns true if any supplied base classes match
     */
    public isOfBaseclasses(tpl: string, baseClassTpls: string[]): boolean
    {
        return this.itemBaseClassService.itemHasBaseClass(tpl, baseClassTpls);
    }

    /**
     * Returns the item price based on the handbook or as a fallback from the prices.json if the item is not
     * found in the handbook. If the price can't be found at all return 0
     *
     * @param {string}      tpl           the item template to check
     * @returns {integer}                   The price of the item or 0 if not found
     */
    public getItemPrice(tpl: string): number
    {
        const handbookPrice = this.handbookHelper.getTemplatePrice(tpl);
        if (handbookPrice > 1)
        {
            return handbookPrice;
        }

        const dynamicPrice = this.databaseServer.getTables().templates.prices[tpl];
        if (dynamicPrice)
        {
            return dynamicPrice;
        }

        // we don't need to spam the logs as we know there are some items which are not priced yet
        // we check in ItemsHelper.getRewardableItems() for ItemPrice > 0, only then is it a valid
        // item to be given as reward or requested in a Completion quest
        //Logger.warning(`DailyQuest - No price found for tpl: ${tpl} price defaulting to 0`);
        return 0;
    }

    public fixItemStackCount(item: Item): Item
    {
        if (item.upd === undefined)
        {
            item.upd = {
                StackObjectsCount: 1
            };
        }

        if (item.upd.StackObjectsCount === undefined)
        {
            item.upd.StackObjectsCount = 1;
        }
        return item;
    }

    /**
     * AmmoBoxes contain StackSlots which need to be filled for the AmmoBox to have content.
     * Here's what a filled AmmoBox looks like:
     *   {
     *       "_id": "b1bbe982daa00ac841d4ae4d",
     *       "_tpl": "57372c89245977685d4159b1",
     *       "parentId": "5fe49a0e2694b0755a504876",
     *       "slotId": "hideout",
     *       "location": {
     *           "x": 3,
     *           "y": 4,
     *           "r": 0
     *       },
     *       "upd": {
     *           "StackObjectsCount": 1
     *       }
     *   },
     *   {
     *       "_id": "b997b4117199033afd274a06",
     *       "_tpl": "56dff061d2720bb5668b4567",
     *       "parentId": "b1bbe982daa00ac841d4ae4d",
     *       "slotId": "cartridges",
     *       "location": 0,
     *       "upd": {
     *           "StackObjectsCount": 30
     *       }
     *   }
     * Given the AmmoBox Item (first object) this function generates the StackSlot (second object) and returns it.
     * StackSlots are only used for AmmoBoxes which only have one element in StackSlots. However, it seems to be generic
     * to possibly also have more than one StackSlot. As good as possible, without seeing items having more than one
     * StackSlot, this function takes account of this and creates and returns an array of StackSlotItems
     *
     * @param {object}      item            The item template of the AmmoBox as given in items.json
     * @param {string}      parentId        The id of the AmmoBox instance these StackSlotItems should be children of
     * @returns {array}                     The array of StackSlotItems
     */
    public generateItemsFromStackSlot(item: ITemplateItem, parentId: string): Item[]
    {
        const stackSlotItems: Item[] = [];
        // This is a AmmoBox or something other with Stackslots (nothing exists yet besides AmmoBoxes afaik)
        for (const stackSlot of item._props.StackSlots)
        {
            const slotId = stackSlot._name;
            const count = stackSlot._max_count;
            // those are all arrays. For AmmoBoxes it's only one element each so we take 0 hardcoded
            // not sure if at any point there will be more than one element - but what so take then?
            const ammoTpl = stackSlot._props.filters[0].Filter[0];
            if (ammoTpl)
            {
                const stackSlotItem: Item = {
                    _id: this.hashUtil.generate(),
                    _tpl: ammoTpl,
                    parentId: parentId,
                    slotId: slotId,
                    location: 0,
                    upd: {
                        StackObjectsCount: count
                    }
                };
                stackSlotItems.push(stackSlotItem);
            }
            else
            {
                this.logger.warning(`No ids found in Filter for StackSlot ${slotId} of Item ${item._id}.`);
            }
        }

        return stackSlotItems;
    }

    /**
     * Get cloned copy of all item data from items.json
     * @returns array of ITemplateItem objects
     */
    public getItems(): ITemplateItem[]
    {
        return this.jsonUtil.clone(Object.values(this.databaseServer.getTables().templates.items));
    }

    /**
     * Gets item data from items.json
     * @param tpl items template id to look up
     * @returns bool - is valid + template item object as array
     */
    public getItem(tpl: string): [boolean, ITemplateItem]
    {
        // -> Gets item from <input: _tpl>
        if (tpl in this.databaseServer.getTables().templates.items)
        {
            return [true, this.databaseServer.getTables().templates.items[tpl]];
        }

        return [false, undefined];
    }

    /**
     * get normalized value (0-1) based on item condition
     * @param item 
     * @returns number between 0 and 1
     */
    public getItemQualityModifier(item: Item): number
    {
        // Default to 100%
        let result = 1;

        if (item.upd)
        {
            const medkit = (item.upd.MedKit) ? item.upd.MedKit : null;
            const repairable = (item.upd.Repairable) ? item.upd.Repairable : null;
            const foodDrink = (item.upd.FoodDrink) ? item.upd.FoodDrink : null;
            const key = (item.upd.Key) ? item.upd.Key : null;
            const resource = (item.upd.Resource) ? item.upd.Resource : null;
            const repairKit = (item.upd.RepairKit) ? item.upd.RepairKit : null;

            const itemDetails = this.getItem(item._tpl)[1];

            if (medkit)
            {
                // Meds
                result = medkit.HpResource / itemDetails._props.MaxHpResource;
            }
            else if (repairable)
            {
                result = this.getRepairableItemQualityValue(itemDetails, repairable, item);
            }
            else if (foodDrink)
            {
                // food & drink
                result = foodDrink.HpPercent / itemDetails._props.MaxResource;
            }
            else if (key && key.NumberOfUsages > 0)
            {
                // keys - keys count upwards, not down like everything else
                const maxNumOfUsages = itemDetails._props.MaximumNumberOfUsage;
                result = (maxNumOfUsages - key.NumberOfUsages) / maxNumOfUsages;
            }
            else if (resource && resource.UnitsConsumed > 0)
            {
                // Things like fuel tank
                result = resource.UnitsConsumed / itemDetails._props.MaxResource;
            }
            else if (repairKit)
            {
                // Repair kits
                result = repairKit.Resource / itemDetails._props.MaxRepairResource;
            }

            if (result === 0)
            {
                // make item non-zero but still very low
                result = 0.01;
            }
        }

        return result;
    }


    /**
     * Get a quality value based on a repairable items (weapon/armor) current state between current and max durability
     * @param itemDetails 
     * @param repairable repairable object
     * @param item 
     * @returns a number between 0 and 1
     */
    protected getRepairableItemQualityValue(itemDetails: ITemplateItem, repairable: Repairable, item: Item): number
    {
        // Armor
        if (itemDetails._props.armorClass)
        {
            return repairable.Durability / itemDetails._props.MaxDurability;
        }
        else
        {
            // Weapon
            // Get max dura from props, if it isnt there use repairable max dura value
            const maxDurability = (itemDetails._props.MaxDurability)
                ? itemDetails._props.MaxDurability
                : repairable.MaxDurability;
            const durability = repairable.Durability / maxDurability;

            if (!durability)
            {
                this.logger.error(this.localisationService.getText("item-durability_value_invalid_use_default", item._tpl));

                return 1;
            }

            return Math.sqrt(durability);
        }
    }

    /**
     * Recursive function that looks at every item from parameter and gets their childrens Ids
     * @param items 
     * @param itemID 
     * @returns an array of strings
     */
    public findAndReturnChildrenByItems(items: Item[], itemID: string): string[]
    {
        const list: string[] = [];

        for (const childitem of items)
        {
            if (childitem.parentId === itemID)
            {
                list.push(...this.findAndReturnChildrenByItems(items, childitem._id));
            }
        }

        list.push(itemID); // required
        return list;
    }

    /**
     * A variant of findAndReturnChildren where the output is list of item objects instead of their ids.
     * @param items 
     * @param baseItemId 
     * @returns An array of Item objects 
     */
    public findAndReturnChildrenAsItems(items: Item[], baseItemId: string): Item[]
    {
        const list: Item[] = [];

        for (const childItem of items)
        {
            // Include itself.
            if (childItem._id === baseItemId)
            {
                list.unshift(childItem);
                continue;
            }

            if (childItem.parentId === baseItemId && !list.find(item => childItem._id === item._id))
            {
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
    public findAndReturnChildrenByAssort(itemIdToFind: string, assort: Item[]): Item[]
    {
        let list: Item[] = [];

        for (const itemFromAssort of assort)
        {
            if (itemFromAssort.parentId === itemIdToFind && !list.find(item => itemFromAssort._id === item._id))
            {
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
    public hasBuyRestrictions(itemToCheck: Item): boolean
    {
        if (itemToCheck.upd.BuyRestrictionCurrent !== undefined && itemToCheck.upd.BuyRestrictionMax !== undefined)
        {
            return true;
        }

        return false;
    }

    /**
     * is the passed in template id a dog tag
     * @param tpl Template id to check
     * @returns true if it is a dogtag
     */
    public isDogtag(tpl: string): boolean
    {
        return tpl === BaseClasses.DOG_TAG_BEAR || tpl === BaseClasses.DOG_TAG_USEC;
    }

    /**
     * Can the item passed in be sold to a trader because it is raw money
     * @param tpl Item template id to check
     * @returns true if unsellable
     */
    public isNotSellable(tpl: string): boolean
    {
        const items = [
            "544901bf4bdc2ddf018b456d", //wad of rubles
            Money.ROUBLES,
            Money.EUROS,
            Money.DOLLARS
        ];

        return items.includes(tpl);
    }

    /**
     * Gets the identifier for a child using slotId, locationX and locationY.
     * @param item 
     * @returns "slotId OR slotid,locationX,locationY"
     */
    public getChildId(item: Item): string
    {
        if (!("location" in item))
        {
            return item.slotId;
        }

        return `${item.slotId},${(item.location as Location).x},${(item.location as Location).y}`;
    }

    /**
     * Can the passed in item be stacked
     * @param tpl item to check
     * @returns true if it can be stacked
     */
    public isItemTplStackable(tpl: string): boolean
    {
        return this.databaseServer.getTables().templates.items[tpl]._props.StackMaxSize > 1;
    }

    /**
     * split item stack if it exceeds StackMaxSize
     */
    public splitStack(item: Item): Item[]
    {
        if (!(("upd" in item) && ("StackObjectsCount" in item.upd)))
        {
            return [item];
        }

        const maxStack = this.databaseServer.getTables().templates.items[item._tpl]._props.StackMaxSize;
        let count = item.upd.StackObjectsCount;
        const stacks: Item[] = [];

        // If the current count is already equal or less than the max
        // then just return the item as is.
        if (count <= maxStack)
        {
            stacks.push(this.jsonUtil.clone(item));
            return stacks;
        }

        while (count)
        {
            const amount = Math.min(count, maxStack);
            const newStack = this.jsonUtil.clone(item);

            newStack._id = this.hashUtil.generate();
            newStack.upd.StackObjectsCount = amount;
            count -= amount;
            stacks.push(newStack);
        }

        return stacks;
    }

    /**
     * Find Barter items in the inventory
     * @param {string} by
     * @param {Object} pmcData
     * @param {string} barterItemId
     * @returns Array of Item objects
     */
    public findBarterItems(by: string, pmcData: IPmcData, barterItemId: string): Item[]
    { 
        // find required items to take after buying (handles multiple items)
        const barterIDs = typeof barterItemId === "string"
            ? [barterItemId]
            : barterItemId;
        let itemsArray: Item[] = [];

        for (const barterID of barterIDs)
        {
            const filterResult = pmcData.Inventory.items.filter(item =>
            {
                return by === "tpl"
                    ? (item._tpl === barterID)
                    : (item._id === barterID);
            });

            itemsArray = Object.assign(itemsArray, filterResult);
        }
    
        return itemsArray;
    }

    /**
     * 
     * @param pmcData 
     * @param items 
     * @param insuredItems insured items to not replace ids for
     * @param fastPanel 
     * @returns 
     */
    public replaceIDs(pmcData: IPmcData, items: Item[], insuredItems: InsuredItem[] = null, fastPanel = null): any[]
    {
        // replace bsg shit long ID with proper one
        let serialisedInventory = this.jsonUtil.serialize(items);

        for (const item of items)
        {
            if (pmcData !== null)
            {
                // Insured items shouldn't be renamed
                // only works for pmcs.
                if (insuredItems?.find(insuredItem => insuredItem.itemId === item._id))
                {
                    continue;
                }

                // Do not replace important ID's
                if (item._id === pmcData.Inventory.equipment
                    || item._id === pmcData.Inventory.questRaidItems
                    || item._id === pmcData.Inventory.questStashItems
                    || item._id === pmcData.Inventory.sortingTable
                    || item._id === pmcData.Inventory.stash)
                {
                    continue;
                }
            }

            // replace id
            const oldId = item._id;
            const newId = this.hashUtil.generate();

            serialisedInventory = serialisedInventory.replace(new RegExp(oldId, "g"), newId);

            // Also replace in quick slot if the old ID exists.
            if (fastPanel !== null)
            {
                for (const itemSlot in fastPanel)
                {
                    if (fastPanel[itemSlot] === oldId)
                    {
                        fastPanel[itemSlot] = fastPanel[itemSlot].replace(new RegExp(oldId, "g"), newId);
                    }
                }
            }
        }

        items = this.jsonUtil.deserialize(serialisedInventory);

        // fix duplicate id's
        const dupes: Record<string, number> = {};
        const newParents: Record<string, Item[]> = {};
        const childrenMapping = {};
        const oldToNewIds: Record<string, string[]> = {};

        // Finding duplicate IDs involves scanning the item three times.
        // First scan - Check which ids are duplicated.
        // Second scan - Map parents to items.
        // Third scan - Resolve IDs.
        for (const item of items)
        {
            dupes[item._id] = (dupes[item._id] || 0) + 1;
        }

        for (const item of items)
        {
            // register the parents
            if (dupes[item._id] > 1)
            {
                const newId = this.hashUtil.generate();

                newParents[item.parentId] = newParents[item.parentId] || [];
                newParents[item.parentId].push(item);
                oldToNewIds[item._id] = oldToNewIds[item._id] || [];
                oldToNewIds[item._id].push(newId);
            }
        }

        for (const item of items)
        {
            if (dupes[item._id] > 1)
            {
                const oldId = item._id;
                const newId = oldToNewIds[oldId].splice(0, 1)[0];
                item._id = newId;

                // Extract one of the children that's also duplicated.
                if (oldId in newParents && newParents[oldId].length > 0)
                {
                    childrenMapping[newId] = {};
                    for (const childIndex in newParents[oldId])
                    {
                        // Make sure we haven't already assigned another duplicate child of
                        // same slot and location to this parent.
                        const childId = this.getChildId(newParents[oldId][childIndex]);

                        if (!(childId in childrenMapping[newId]))
                        {
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
     * WARNING, SLOW. Recursively loop down through an items hierarchy to see if any of the ids match the supplied list, return true if any do
     * @param {string} tpl Items tpl to check parents of
     * @param {Array} tplsToCheck Tpl values to check if parents of item match
     * @returns boolean Match found
     */
    public doesItemOrParentsIdMatch(tpl: string, tplsToCheck: string[]): boolean
    {
        const itemDetails = this.getItem(tpl);
        const itemExists = itemDetails[0];
        const item = itemDetails[1];

        // not an item, drop out
        if (!itemExists)
        {
            return false;
        }

        // no parent to check
        if (!item._parent)
        {
            return false;
        }

        // Does templateId match any values in tplsToCheck array
        if (tplsToCheck.includes(item._id))
        {
            return true;
        }

        // Does the items parent type exist in tplsToCheck array
        if (tplsToCheck.includes(item._parent))
        {
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
    public isQuestItem(tpl: string): boolean
    {
        const itemDetails = this.getItem(tpl);
        if (itemDetails[0] && itemDetails[1]._props.QuestItem)
        {
            return true;
        }

        return false;
    }


    /**
     * Get the inventory size of an item
     * @param items Item with children
     * @param rootItemId 
     * @returns ItemSize object (width and height)
     */
    public getItemSize(items: Item[], rootItemId: string): ItemHelper.ItemSize
    {
        const rootTemplate = this.getItem(items.filter(x => x._id === rootItemId)[0]._tpl)[1];
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
        for (const ci of children)
        {
            const itemTemplate = this.getItem(ci._tpl)[1];

            // Calculating child ExtraSize
            if (itemTemplate._props.ExtraSizeForceAdd === true)
            {
                forcedUp += itemTemplate._props.ExtraSizeUp;
                forcedDown += itemTemplate._props.ExtraSizeDown;
                forcedLeft += itemTemplate._props.ExtraSizeLeft;
                forcedRight += itemTemplate._props.ExtraSizeRight;
            }
            else
            {
                sizeUp = sizeUp < itemTemplate._props.ExtraSizeUp ? itemTemplate._props.ExtraSizeUp : sizeUp;
                sizeDown = sizeDown < itemTemplate._props.ExtraSizeDown ? itemTemplate._props.ExtraSizeDown : sizeDown;
                sizeLeft = sizeLeft < itemTemplate._props.ExtraSizeLeft ? itemTemplate._props.ExtraSizeLeft : sizeLeft;
                sizeRight = sizeRight < itemTemplate._props.ExtraSizeRight ? itemTemplate._props.ExtraSizeRight : sizeRight;
            }
        }

        return {
            width: width + sizeLeft + sizeRight + forcedLeft + forcedRight,
            height: height + sizeUp + sizeDown + forcedUp + forcedDown
        };
    }

    /**
     * Get a random cartridge from an items Filter property
     * @param item Db item template to look up Cartridge filter values from
     * @returns Caliber of cartridge
     */
    public getRandomCompatibleCaliberTemplateId(item: ITemplateItem): string
    {
        const cartridges = item._props.Cartridges[0]._props.filters[0].Filter;

        if (!cartridges)
        {
            this.logger.warning(`no cartridges found for item: ${item._id} ${item._name}`);
            return null;
        }

        return cartridges[Math.floor(Math.random() * item._props.Cartridges[0]._props.filters[0].Filter.length)];
    }

    /**
     * Add cartridges to the ammo box with correct max stack sizes
     * @param ammoBox Box to add cartridges to
     * @param ammoBoxDetails Item template from items db
     */
    public addCartridgesToAmmoBox(ammoBox: Item[], ammoBoxDetails: ITemplateItem): void
    {
        const ammoBoxMaxCartridgeCount = ammoBoxDetails._props.StackSlots[0]._max_count;
        const cartridgeTpl = ammoBoxDetails._props.StackSlots[0]._props.filters[0].Filter[0];
        const cartridgeDetails = this.getItem(cartridgeTpl);
        const cartridgeMaxStackSize = cartridgeDetails[1]._props.StackMaxSize;

        // Add new stack-size-correct items to ammo box
        let currentStoredCartridgeCount = 0;
        let location = 0;
        while (currentStoredCartridgeCount < ammoBoxMaxCartridgeCount)
        {
            // Get stack size of cartridges
            const cartridgeCountToAdd = (ammoBoxMaxCartridgeCount <= cartridgeMaxStackSize)
                ? ammoBoxMaxCartridgeCount
                : cartridgeMaxStackSize;

            // Add cartridge item object into items array
            ammoBox.push(this.createCartridges(ammoBox[0]._id, cartridgeTpl, cartridgeCountToAdd, location));

            currentStoredCartridgeCount += cartridgeCountToAdd;
            location ++;
        }
    }

    /**
     * Add child items (cartridges) to a magazine
     * @param magazine Magazine to add child items to
     * @param magTemplate Db template of magazine
     * @param staticAmmoDist Cartridge distribution
     * @param caliber Caliber of cartridge to add to magazine
     * @param minSizePercent % the magazine must be filled to
     */
    public fillMagazineWithRandomCartridge(
        magazine: Item[],
        magTemplate: ITemplateItem,
        staticAmmoDist: Record<string, IStaticAmmoDetails[]>,
        caliber: string = undefined,
        minSizePercent = 0.25
    ): void
    {
        // no caliber defined, choose one
        if (!caliber)
        {
            caliber = this.getRandomValidCaliber(magTemplate);
        }

        // Edge case for the Klin pp-9, it has a typo in its ammo caliber
        if (caliber === "Caliber9x18PMM")
        {
            caliber = "Caliber9x18PM";
        }

        // Chose a randomly weighted cartridge that fits
        const cartridgeTpl = this.drawAmmoTpl(caliber, staticAmmoDist);
        this.fillMagazineWithCartridge(magazine, magTemplate, cartridgeTpl, minSizePercent);
    }

    /**
     * Add child items to a magazine of a specific cartridge
     * @param magazine Magazine to add child items to
     * @param magTemplate Db template of magazine
     * @param cartridgeTpl Cartridge to add to magazine
     * @param minSizePercent % the magazine must be filled to
     */
    public fillMagazineWithCartridge(
        magazine: Item[],
        magTemplate: ITemplateItem,
        cartridgeTpl: string,
        minSizePercent = 0.25
    ): void
    {
        // Get cartrdge properties and max allowed stack size
        const cartridgeDetails = this.getItem(cartridgeTpl);
        const cartridgeMaxStackSize = cartridgeDetails[1]._props.StackMaxSize;

        // Get max number of cartridges in magazine, choose random value between min/max
        const magazineCartridgeMaxCount = magTemplate._props.Cartridges[0]._max_count;
        const desiredStackCount = this.randomUtil.getInt(Math.round(minSizePercent * magazineCartridgeMaxCount), magazineCartridgeMaxCount);

        // Loop over cartridge count and add stacks to magazine
        let currentStoredCartridgeCount = 0;
        let location = 0;
        while (currentStoredCartridgeCount < desiredStackCount)
        {
            // Get stack size of cartridges
            let cartridgeCountToAdd = (desiredStackCount <= cartridgeMaxStackSize)
                ? desiredStackCount
                : cartridgeMaxStackSize;

            // Ensure we don't go over the max stackcount size
            const remainingSpace = desiredStackCount - currentStoredCartridgeCount;
            if (cartridgeCountToAdd > remainingSpace)
            {
                cartridgeCountToAdd = remainingSpace;
            }

            // Add cartridge item object into items array
            magazine.push(this.createCartridges(magazine[0]._id, cartridgeTpl, cartridgeCountToAdd, location));

            currentStoredCartridgeCount += cartridgeCountToAdd;
            location ++;
        }
    }

    protected getRandomValidCaliber(magTemplate: ITemplateItem): string
    {
        const ammoTpls = magTemplate._props.Cartridges[0]._props.filters[0].Filter;
        const calibers = [
            ...new Set(
                ammoTpls.filter(
                    (x: string) => this.getItem(x)[0]
                ).map(
                    (x: string) => this.getItem(x)[1]._props.Caliber
                )
            )
        ];
        return this.randomUtil.drawRandomFromList(calibers)[0];
    }

    protected drawAmmoTpl(caliber: string, staticAmmoDist: Record<string, IStaticAmmoDetails[]>): string
    {
        const ammoArray = new ProbabilityObjectArray<string>(this.mathUtil);
        for (const icd of staticAmmoDist[caliber])
        {
            ammoArray.push(
                new ProbabilityObject(icd.tpl, icd.relativeProbability)
            );
        }
        return ammoArray.draw(1)[0];
    }

    /**
     * 
     * @param parentId container cartridges will be placed in
     * @param ammoTpl Cartridge to insert
     * @param stackCount Count of cartridges inside parent 
     * @param location Location inside parent (e.g. 0, 1)
     * @returns Item
     */
    public createCartridges(parentId: string, ammoTpl: string, stackCount: number, location: number): Item
    {
        return {
            _id: this.objectId.generate(),
            _tpl: ammoTpl,
            parentId: parentId,
            slotId: "cartridges",
            location: location,
            upd: { StackObjectsCount: stackCount }
        };
    }

    /**
     * Get the size of a stack, return 1 if no stack object count property found
     * @param item Item to get stack size of 
     * @returns size of stack
     */
    public getItemStackSize(item: Item): number
    {
        if (item.upd?.StackObjectsCount)
        {
            return item.upd.StackObjectsCount;
        }

        return 1;
    }

    /**
     * Get the name of an item from the locale file using the item tpl
     * @param itemTpl Tpl of item to get name of
     * @returns Name of item
     */
    public getItemName(itemTpl: string): string
    {
        return this.localeService.getLocaleDb()[`${itemTpl} Name`];
    }
}

namespace ItemHelper
{
    export interface ItemSize
    {
        width: number
        height: number
    }
}

export { ItemHelper };

