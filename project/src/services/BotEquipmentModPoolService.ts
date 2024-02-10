import { inject, injectable } from "tsyringe";

import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { Mods } from "@spt-aki/models/eft/common/tables/IBotType";
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IBotConfig } from "@spt-aki/models/spt/config/IBotConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { VFS } from "@spt-aki/utils/VFS";

/** Store a mapping between weapons, their slots and the items that fit those slots */
@injectable()
export class BotEquipmentModPoolService
{
    protected botConfig: IBotConfig;
    protected weaponModPool: Mods = {};
    protected gearModPool: Mods = {};
    protected weaponPoolGenerated = false;
    protected armorPoolGenerated = false;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("VFS") protected vfs: VFS,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
    }

    /**
     * Store dictionary of mods for each item passed in
     * @param items items to find related mods and store in modPool
     */
    protected generatePool(items: ITemplateItem[], poolType: string): void
    {
        if (!items)
        {
            this.logger.error(`No items provided when attempting to generate ${poolType} pool, skipping`);

            return;
        }

        // Get weapon or gear pool
        const pool = poolType === "weapon" ? this.weaponModPool : this.gearModPool;
        for (const item of items)
        {
            if (!item._props)
            {
                this.logger.error(
                    this.localisationService.getText("bot-item_missing_props_property", {
                        itemTpl: item._id,
                        name: item._name,
                    }),
                );

                continue;
            }

            // skip item witout slots
            if (!item._props.Slots || item._props.Slots.length === 0)
            {
                continue;
            }

            // Add tpl to pool when missing
            if (!pool[item._id])
            {
                pool[item._id] = {};
            }

            // No slots, skip
            if (!item._props.Slots)
            {
                return;
            }

            for (const slot of item._props.Slots)
            {
                const itemsThatFit = slot._props.filters[0].Filter;
                for (const itemToAdd of itemsThatFit)
                {
                    if (!pool[item._id][slot._name])
                    {
                        pool[item._id][slot._name] = [];
                    }

                    // only add item to pool if it doesnt already exist
                    if (!pool[item._id][slot._name].some((x) => x === itemToAdd))
                    {
                        pool[item._id][slot._name].push(itemToAdd);

                        // Check item added into array for slots, need to iterate over those
                        const subItemDetails = this.databaseServer.getTables().templates.items[itemToAdd];
                        const hasSubItemsToAdd = subItemDetails?._props?.Slots?.length > 0;
                        if (hasSubItemsToAdd && !pool[subItemDetails._id])
                        {
                            // Recursive call
                            this.generatePool([subItemDetails], poolType);
                        }
                    }
                }
            }
        }
    }

    /**
     * Empty the mod pool
     */
    public resetPool(): void
    {
        this.weaponModPool = {};
    }

    /**
     * Get array of compatible mods for an items mod slot (generate pool if it doesnt exist already)
     * @param itemTpl item to look up
     * @param slotName slot to get compatible mods for
     * @returns tpls that fit the slot
     */
    public getCompatibleModsForWeaponSlot(itemTpl: string, slotName: string): string[]
    {
        if (!this.weaponPoolGenerated)
        {
            // Get every weapon in db and generate mod pool
            this.generateWeaponPool();
        }

        return this.weaponModPool[itemTpl][slotName];
    }

    /**
     * Get array of compatible mods for an items mod slot (generate pool if it doesnt exist already)
     * @param itemTpl item to look up
     * @param slotName slot to get compatible mods for
     * @returns tpls that fit the slot
     */
    public getCompatibleModsFoGearSlot(itemTpl: string, slotName: string): string[]
    {
        if (!this.armorPoolGenerated)
        {
            this.generateGearPool();
        }

        return this.gearModPool[itemTpl][slotName];
    }

    /**
     * Get mods for a piece of gear by its tpl
     * @param itemTpl items tpl to look up mods for
     * @returns Dictionary of mods (keys are mod slot names) with array of compatible mod tpls as value
     */
    public getModsForGearSlot(itemTpl: string): Record<string, string[]>
    {
        if (!this.armorPoolGenerated)
        {
            this.generateGearPool();
        }

        return this.gearModPool[itemTpl];
    }

    /**
     * Get mods for a weapon by its tpl
     * @param itemTpl Weapons tpl to look up mods for
     * @returns Dictionary of mods (keys are mod slot names) with array of compatible mod tpls as value
     */
    public getModsForWeaponSlot(itemTpl: string): Record<string, string[]>
    {
        if (!this.weaponPoolGenerated)
        {
            this.generateWeaponPool();
        }

        return this.weaponModPool[itemTpl];
    }

    /**
     * Create weapon mod pool and set generated flag to true
     */
    protected generateWeaponPool(): void
    {
        const weapons = Object.values(this.databaseServer.getTables().templates.items).filter((x) =>
            x._type === "Item" && this.itemHelper.isOfBaseclass(x._id, BaseClasses.WEAPON)
        );
        this.generatePool(weapons, "weapon");

        // Flag pool as being complete
        this.weaponPoolGenerated = true;
    }

    /**
     * Create gear mod pool and set generated flag to true
     */
    protected generateGearPool(): void
    {
        const gear = Object.values(this.databaseServer.getTables().templates.items).filter((x) =>
            x._type === "Item"
            && this.itemHelper.isOfBaseclasses(x._id, [
                BaseClasses.ARMORED_EQUIPMENT,
                BaseClasses.VEST,
                BaseClasses.ARMOR,
                BaseClasses.HEADWEAR,
            ])
        );
        this.generatePool(gear, "gear");

        // Flag pool as being complete
        this.armorPoolGenerated = true;
    }
}
