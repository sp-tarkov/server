import { ItemHelper } from "@spt/helpers/ItemHelper";
import { IProps, ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import {
    CreateItemResult,
    LocaleDetails,
    NewItemDetails,
    NewItemFromCloneDetails,
} from "@spt/models/spt/mod/NewItemDetails";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseService } from "@spt/services/DatabaseService";
import { ItemBaseClassService } from "@spt/services/ItemBaseClassService";
import { HashUtil } from "@spt/utils/HashUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class CustomItemService {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ItemBaseClassService") protected itemBaseClassService: ItemBaseClassService,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {}

    /**
     * Create a new item from a cloned item base
     * WARNING - If no item id is supplied, an id will be generated, this id will be random every time you add an item and will not be the same on each subsequent server start
     * Add to the items db
     * Add to the flea market
     * Add to the handbook
     * Add to the locales
     * @param newItemDetails Item details for the new item to be created
     * @returns tplId of the new item created
     */
    public createItemFromClone(newItemDetails: NewItemFromCloneDetails): CreateItemResult {
        const result = new CreateItemResult();
        const tables = this.databaseService.getTables();

        // Generate new id for item if none supplied
        const newItemId = this.getOrGenerateIdForItem(newItemDetails.newId);

        // Fail if itemId already exists
        if (tables.templates.items[newItemId]) {
            result.errors.push(`ItemId already exists. ${tables.templates.items[newItemId]._name}`);
            result.success = false;
            result.itemId = newItemId;

            return result;
        }

        // Clone existing item
        const itemClone = this.cloner.clone(tables.templates.items[newItemDetails.itemTplToClone]);

        // Update id and parentId of item
        itemClone._id = newItemId;
        itemClone._parent = newItemDetails.parentId;

        this.updateBaseItemPropertiesWithOverrides(newItemDetails.overrideProperties, itemClone);

        this.addToItemsDb(newItemId, itemClone);

        this.addToHandbookDb(newItemId, newItemDetails.handbookParentId, newItemDetails.handbookPriceRoubles);

        this.addToLocaleDbs(newItemDetails.locales, newItemId);

        this.addToFleaPriceDb(newItemId, newItemDetails.fleaPriceRoubles);

        this.itemBaseClassService.hydrateItemBaseClassCache();

        if (this.itemHelper.isOfBaseclass(itemClone._id, BaseClasses.WEAPON)) {
            this.addToWeaponShelf(newItemId);
        }

        result.success = true;
        result.itemId = newItemId;

        return result;
    }

    /**
     * Create a new item without using an existing item as a template
     * Add to the items db
     * Add to the flea market
     * Add to the handbook
     * Add to the locales
     * @param newItemDetails Details on what the item to be created
     * @returns CreateItemResult containing the completed items Id
     */
    public createItem(newItemDetails: NewItemDetails): CreateItemResult {
        const result = new CreateItemResult();
        const tables = this.databaseService.getTables();

        const newItem = newItemDetails.newItem;

        // Fail if itemId already exists
        if (tables.templates.items[newItem._id]) {
            result.errors.push(`ItemId already exists. ${tables.templates.items[newItem._id]._name}`);
            return result;
        }

        this.addToItemsDb(newItem._id, newItem);

        this.addToHandbookDb(newItem._id, newItemDetails.handbookParentId, newItemDetails.handbookPriceRoubles);

        this.addToLocaleDbs(newItemDetails.locales, newItem._id);

        this.addToFleaPriceDb(newItem._id, newItemDetails.fleaPriceRoubles);

        this.itemBaseClassService.hydrateItemBaseClassCache();

        if (this.itemHelper.isOfBaseclass(newItem._id, BaseClasses.WEAPON)) {
            this.addToWeaponShelf(newItem._id);
        }

        result.itemId = newItemDetails.newItem._id;
        result.success = true;

        return result;
    }

    /**
     * If the id provided is an empty string, return a randomly generated guid, otherwise return the newId parameter
     * @param newId id supplied to code
     * @returns item id
     */
    protected getOrGenerateIdForItem(newId: string): string {
        return newId === "" ? this.hashUtil.generate() : newId;
    }

    /**
     * Iterates through supplied properties and updates the cloned items properties with them
     * Complex objects cannot have overrides, they must be fully hydrated with values if they are to be used
     * @param overrideProperties new properties to apply
     * @param itemClone item to update
     */
    protected updateBaseItemPropertiesWithOverrides(overrideProperties: IProps, itemClone: ITemplateItem): void {
        for (const propKey in overrideProperties) {
            itemClone._props[propKey] = overrideProperties[propKey];
        }
    }

    /**
     * Addd a new item object to the in-memory representation of items.json
     * @param newItemId id of the item to add to items.json
     * @param itemToAdd Item to add against the new id
     */
    protected addToItemsDb(newItemId: string, itemToAdd: ITemplateItem): void {
        this.databaseService.getItems()[newItemId] = itemToAdd;
    }

    /**
     * Add a handbook price for an item
     * @param newItemId id of the item being added
     * @param parentId parent id of the item being added
     * @param priceRoubles price of the item being added
     */
    protected addToHandbookDb(newItemId: string, parentId: string, priceRoubles: number): void {
        this.databaseService
            .getTemplates()
            .handbook.Items.push({ Id: newItemId, ParentId: parentId, Price: priceRoubles });
    }

    /**
     * Iterate through the passed in locale data and add to each locale in turn
     * If data is not provided for each langauge eft uses, the first object will be used in its place
     * e.g.
     * en[0]
     * fr[1]
     *
     * No jp provided, so english will be used as a substitute
     * @param localeDetails key is language, value are the new locale details
     * @param newItemId id of the item being created
     */
    protected addToLocaleDbs(localeDetails: Record<string, LocaleDetails>, newItemId: string): void {
        const languages = this.databaseService.getLocales().languages;
        for (const shortNameKey in languages) {
            // Get locale details passed in, if not provided by caller use first record in newItemDetails.locales
            let newLocaleDetails = localeDetails[shortNameKey];
            if (!newLocaleDetails) {
                newLocaleDetails = localeDetails[Object.keys(localeDetails)[0]];
            }

            // Create new record in locale file
            const globals = this.databaseService.getLocales();
            globals.global[shortNameKey][`${newItemId} Name`] = newLocaleDetails.name;
            globals.global[shortNameKey][`${newItemId} ShortName`] = newLocaleDetails.shortName;
            globals.global[shortNameKey][`${newItemId} Description`] = newLocaleDetails.description;
        }
    }

    /**
     * Add a price to the in-memory representation of prices.json, used to inform the flea of an items price on the market
     * @param newItemId id of the new item
     * @param fleaPriceRoubles Price of the new item
     */
    protected addToFleaPriceDb(newItemId: string, fleaPriceRoubles: number): void {
        this.databaseService.getTemplates().prices[newItemId] = fleaPriceRoubles;
    }

    /**
     * Add a weapon to the hideout weapon shelf whitelist
     * @param newItemId Weapon id to add
     */
    protected addToWeaponShelf(newItemId: string): void {
        // Ids for wall stashes in db
        const wallStashIds = [
            ItemTpl.HIDEOUTAREACONTAINER_WEAPONSTAND_STASH_1,
            ItemTpl.HIDEOUTAREACONTAINER_WEAPONSTAND_STASH_2,
            ItemTpl.HIDEOUTAREACONTAINER_WEAPONSTAND_STASH_3,
        ];
        for (const wallId of wallStashIds) {
            const wall = this.itemHelper.getItem(wallId);
            if (wall[0]) {
                wall[1]._props.Grids[0]._props.filters[0].Filter.push(newItemId);
            }
        }
    }

    /**
     * Add a custom weapon to PMCs loadout
     * @param weaponTpl Custom weapon tpl to add to PMCs
     * @param weaponWeight The weighting for the weapon to be picked vs other weapons
     * @param weaponSlot The slot the weapon should be added to (e.g. FirstPrimaryWeapon/SecondPrimaryWeapon/Holster)
     */
    public addCustomWeaponToPMCs(weaponTpl: string, weaponWeight: number, weaponSlot: string): void {
        const weapon = this.itemHelper.getItem(weaponTpl);
        if (!weapon[0]) {
            this.logger.warning(
                `Unable to add custom weapon ${weaponTpl} to PMCs as it cannot be found in the Item db`,
            );

            return;
        }
        const baseWeaponModObject = {};

        // Get all slots weapon has and create a dictionary of them with possible mods that slot into each
        const weaponSlots = weapon[1]._props.Slots;
        for (const slot of weaponSlots) {
            baseWeaponModObject[slot._name] = slot._props.filters[0].Filter;
        }

        // Get PMCs
        const botTypes = this.databaseService.getBots().types;

        // Add weapon base+mods into bear/usec data
        botTypes.usec.inventory.mods[weaponTpl] = baseWeaponModObject;
        botTypes.bear.inventory.mods[weaponTpl] = baseWeaponModObject;

        // Add weapon to array of allowed weapons + weighting to be picked
        botTypes.usec.inventory.equipment[weaponSlot][weaponTpl] = weaponWeight;
        botTypes.bear.inventory.equipment[weaponSlot][weaponTpl] = weaponWeight;
    }
}
