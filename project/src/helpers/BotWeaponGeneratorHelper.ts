import { inject, injectable } from "tsyringe";

import { ContainerHelper } from "@spt-aki/helpers/ContainerHelper";
import { InventoryHelper } from "@spt-aki/helpers/InventoryHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { WeightedRandomHelper } from "@spt-aki/helpers/WeightedRandomHelper";
import { Inventory } from "@spt-aki/models/eft/common/tables/IBotBase";
import { GenerationData } from "@spt-aki/models/eft/common/tables/IBotType";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { Grid, ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { EquipmentSlots } from "@spt-aki/models/enums/EquipmentSlots";
import { ItemAddedResult } from "@spt-aki/models/enums/ItemAddedResult";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

@injectable()
export class BotWeaponGeneratorHelper
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ContainerHelper") protected containerHelper: ContainerHelper,
    )
    {}

    /**
     * Get a randomized number of bullets for a specific magazine
     * @param magCounts Weights of magazines
     * @param magTemplate magazine to generate bullet count for
     * @returns bullet count number
     */
    public getRandomizedBulletCount(magCounts: GenerationData, magTemplate: ITemplateItem): number
    {
        const randomizedMagazineCount = this.getRandomizedMagazineCount(magCounts);
        const parentItem = this.itemHelper.getItem(magTemplate._parent)[1];
        let chamberBulletCount = 0;
        if (this.magazineIsCylinderRelated(parentItem._name))
        {
            const firstSlotAmmoTpl = magTemplate._props.Cartridges[0]._props.filters[0].Filter[0];
            const ammoMaxStackSize = this.itemHelper.getItem(firstSlotAmmoTpl)[1]?._props?.StackMaxSize ?? 1;
            chamberBulletCount = (ammoMaxStackSize === 1)
                ? 1 // Rotating grenade launcher
                : magTemplate._props.Slots.length; // Shotguns/revolvers. We count the number of camoras as the _max_count of the magazine is 0
        }
        else if (parentItem._id === BaseClasses.UBGL)
        {
            // Underbarrel launchers can only have 1 chambered grenade
            chamberBulletCount = 1;
        }
        else
        {
            chamberBulletCount = magTemplate._props.Cartridges[0]._max_count;
        }

        /* Get the amount of bullets that would fit in the internal magazine
        * and multiply by how many magazines were supposed to be created */
        return chamberBulletCount * randomizedMagazineCount;
    }

    /**
     * Get a randomized count of magazines
     * @param magCounts min and max value returned value can be between
     * @returns numerical value of magazine count
     */
    public getRandomizedMagazineCount(magCounts: GenerationData): number
    {
        // const range = magCounts.max - magCounts.min;
        // return this.randomUtil.getBiasedRandomNumber(magCounts.min, magCounts.max, Math.round(range * 0.75), 4);

        return Number.parseInt(this.weightedRandomHelper.getWeightedValue(magCounts.weights));
    }

    /**
     * Is this magazine cylinder related (revolvers and grenade launchers)
     * @param magazineParentName the name of the magazines parent
     * @returns true if it is cylinder related
     */
    public magazineIsCylinderRelated(magazineParentName: string): boolean
    {
        return ["CylinderMagazine", "SpringDrivenCylinder"].includes(magazineParentName);
    }

    /**
     * Create a magazine using the parameters given
     * @param magazineTpl Tpl of the magazine to create
     * @param ammoTpl Ammo to add to magazine
     * @param magTemplate template object of magazine
     * @returns Item array
     */
    public createMagazineWithAmmo(magazineTpl: string, ammoTpl: string, magTemplate: ITemplateItem): Item[]
    {
        const magazine: Item[] = [{ _id: this.hashUtil.generate(), _tpl: magazineTpl }];

        this.itemHelper.fillMagazineWithCartridge(magazine, magTemplate, ammoTpl, 1);

        return magazine;
    }

    /**
     * Add a specific number of cartridges to a bots inventory (defaults to vest and pockets)
     * @param ammoTpl Ammo tpl to add to vest/pockets
     * @param cartridgeCount number of cartridges to add to vest/pockets
     * @param inventory bot inventory to add cartridges to
     * @param equipmentSlotsToAddTo what equipment slots should bullets be added into
     */
    public addAmmoIntoEquipmentSlots(
        ammoTpl: string,
        cartridgeCount: number,
        inventory: Inventory,
        equipmentSlotsToAddTo: EquipmentSlots[] = [EquipmentSlots.TACTICAL_VEST, EquipmentSlots.POCKETS],
    ): void
    {
        const ammoItems = this.itemHelper.splitStack({
            _id: this.hashUtil.generate(),
            _tpl: ammoTpl,
            upd: { StackObjectsCount: cartridgeCount },
        });

        for (const ammoItem of ammoItems)
        {
            const result = this.addItemWithChildrenToEquipmentSlot(equipmentSlotsToAddTo, ammoItem._id, ammoItem._tpl, [
                ammoItem,
            ], inventory);

            if (result !== ItemAddedResult.SUCCESS)
            {
                this.logger.debug(`Unable to add ammo: ${ammoItem._tpl} to bot inventory, ${ItemAddedResult[result]}`);

                if (result === ItemAddedResult.NO_SPACE || result === ItemAddedResult.NO_CONTAINERS)
                {
                    // If there's no space for 1 stack or no containers to hold item, there's no space for the others
                    break;
                }
            }
        }
    }

    /**
     * Get a weapons default magazine template id
     * @param weaponTemplate weapon to get default magazine for
     * @returns tpl of magazine
     */
    public getWeaponsDefaultMagazineTpl(weaponTemplate: ITemplateItem): string
    {
        return weaponTemplate._props.defMagType;
    }

    /**
     * TODO - move into BotGeneratorHelper, this is not the class for it
     * Adds an item with all its children into specified equipmentSlots, wherever it fits.
     * @param equipmentSlots Slot to add item+children into
     * @param rootItemId Root item id to use as mod items parentid
     * @param rootItemTplId Root itms tpl id
     * @param itemWithChildren Item to add
     * @param inventory Inventory to add item+children into
     * @returns ItemAddedResult result object
     */
    public addItemWithChildrenToEquipmentSlot(
        equipmentSlots: string[],
        rootItemId: string,
        rootItemTplId: string,
        itemWithChildren: Item[],
        inventory: Inventory,
    ): ItemAddedResult
    {
        /** Track how many containers are unable to be found */
        let missingContainerCount = 0;
        for (const equipmentSlotId of equipmentSlots)
        {
            // Get container to put item into
            const container = inventory.items.find((item) => item.slotId === equipmentSlotId);
            if (!container)
            {
                missingContainerCount++;
                if (missingContainerCount === equipmentSlots.length)
                {
                    // Bot doesnt have any containers we want to add item to
                    this.logger.debug(
                        `Unable to add item: ${
                            itemWithChildren[0]._tpl
                        } to bot as it lacks the following containers: ${equipmentSlots.join(",")}`,
                    );

                    return ItemAddedResult.NO_CONTAINERS
                }

                // No container of desired type found, skip to next container type
                continue;
            }

            // Get container details from db
            const containerTemplate = this.itemHelper.getItem(container._tpl);
            if (!containerTemplate[0])
            {
                this.logger.warning(this.localisationService.getText("bot-missing_container_with_tpl", container._tpl));

                // Bad item, skip
                continue;
            }

            if (!containerTemplate[1]._props.Grids?.length)
            {
                // Container has no slots to hold items
                continue;
            }

            // Get x/y grid size of item
            const itemSize = this.inventoryHelper.getItemSize(rootItemTplId, rootItemId, itemWithChildren);

            // Iterate over each grid in the container and look for a big enough space for the item to be placed in
            let currentGridCount = 1;
            const totalSlotGridCount = containerTemplate[1]._props.Grids.length;
            for (const slotGrid of containerTemplate[1]._props.Grids)
            {
                // Grid is empty, skip
                if (slotGrid._props.cellsH === 0 || slotGrid._props.cellsV === 0)
                {
                    continue;
                }

                // Can't put item type in grid, skip all grids as we're assuming they have the same rules
                if (!this.itemAllowedInContainer(slotGrid, rootItemTplId))
                {
                    // Only one possible slot and item is incompatible, exit function and inform caller
                    if (equipmentSlots.length === 1)
                    {
                        return ItemAddedResult.INCOMPATIBLE_ITEM;
                    }

                    // Multiple containers, maybe next one allows item, only break out of loop for this containers grids
                    break;
                }

                // Get all root items in found container
                const existingContainerItems = inventory.items.filter((item) =>
                    item.parentId === container._id && item.slotId === slotGrid._name
                );

                // Get root items in container we can iterate over to find out what space is free
                const containerItemsToCheck = existingContainerItems.filter((x) => x.slotId === slotGrid._name);
                for (const item of containerItemsToCheck)
                {
                    // Look for children on items, insert into array if found
                    // (used later when figuring out how much space weapon takes up)
                    const itemWithChildren = this.itemHelper.findAndReturnChildrenAsItems(inventory.items, item._id);
                    if (itemWithChildren.length > 1)
                    {
                        existingContainerItems.splice(existingContainerItems.indexOf(item), 1, ...itemWithChildren);
                    }
                }

                // Get rid of items free/used spots in current grid
                const slotGridMap = this.inventoryHelper.getContainerMap(
                    slotGrid._props.cellsH,
                    slotGrid._props.cellsV,
                    existingContainerItems,
                    container._id,
                );

                // Try to fit item into grid
                const findSlotResult = this.containerHelper.findSlotForItem(slotGridMap, itemSize[0], itemSize[1]);

                // Open slot found, add item to inventory
                if (findSlotResult.success)
                {
                    const parentItem = itemWithChildren.find((i) => i._id === rootItemId);

                    // Set items parent to container id
                    parentItem.parentId = container._id;
                    parentItem.slotId = slotGrid._name;
                    parentItem.location = {
                        x: findSlotResult.x,
                        y: findSlotResult.y,
                        r: findSlotResult.rotation ? 1 : 0,
                    };

                    inventory.items.push(...itemWithChildren);

                    return ItemAddedResult.SUCCESS;
                }

                // If we've checked all grids in container and reached this point, there's no space for item
                if (currentGridCount >= totalSlotGridCount)
                {
                    return ItemAddedResult.NO_SPACE;
                }
                currentGridCount++;

                // No space in this grid, move to next container grid and try again
            }
        }

        return ItemAddedResult.UNKNOWN;
    }

    /**
     * Is the provided item allowed inside a container
     * @param slotGrid Items sub-grid we want to place item inside
     * @param itemTpl Item tpl being placed
     * @returns True if allowed
     */
    protected itemAllowedInContainer(slotGrid: Grid, itemTpl: string): boolean
    {
        const propFilters = slotGrid._props.filters;
        const excludedFilter = propFilters[0]?.ExcludedFilter;
        const filter = propFilters[0]?.Filter;

        if (propFilters.length === 0)
        {
            // no filters, item is fine to add
            return true;
        }

        // Check if item base type is excluded
        if (excludedFilter || filter)
        {
            const itemDetails = this.itemHelper.getItem(itemTpl)[1];

            // if item to add is found in exclude filter, not allowed
            if (excludedFilter.includes(itemDetails._parent))
            {
                return false;
            }

            // If Filter array only contains 1 filter and its for basetype 'item', allow it
            if (filter.length === 1 && filter.includes(BaseClasses.ITEM))
            {
                return true;
            }

            // If allowed filter has something in it + filter doesnt have basetype 'item', not allowed
            if (filter.length > 0 && !filter.includes(itemDetails._parent))
            {
                return false;
            }
        }

        return true;
    }
}
