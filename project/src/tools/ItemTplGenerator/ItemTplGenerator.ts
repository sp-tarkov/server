/**
 * Dynamically generate the following two files:
 * - src/models/enums/ItemTpl.ts
 * - src/models/enums/Weapons.ts
 *
 * Based on data from the assets/database folders.
 *
 * Usage:
 * - Run this script using npm: `npm run gen:items`
 *
 * Notes:
 * - Ensure that all necessary Node.js modules are installed before running the script: `npm install`
 * - The following rules are used for determining item base names:
 * -- Certain items are manually overridden by itemOverrides.ts, when the names are not unique enough
 * -- Random containers, built in inserts and stashes utilize the item's _name property
 * -- Ammo, ammo boxes, and magazines utilize the item's English locale ShortName property
 * -- All other items utilize the item's English locale Name property
 * -- In the event the above rules fail, the fallback order is the Englick locale Name property, then the item's _name property
 * -- Trailing and leading whitespace is stripped, special characters are removed, and spaces are replaced with underscores
 * - Item caliber data is cleaned of the words "CALIBER", "PARA" and "NATO", as well as replacing "1143x23ACP" with "45ACP" for consistency
 * - Damaged ammo boxes are suffixed with "_DAMAGED"
 * - The parent item type prefix is grouped more than the base item list, see "getParentName" for the rules around this
 * - Finalized enum names are created as a combination of the parent name, prefix, item name, and suffix
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { OnLoad } from "@spt/di/OnLoad";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import { Weapons } from "@spt/models/enums/Weapons";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { LocaleService } from "@spt/services/LocaleService";
import * as itemTplOverrides from "@spt/tools/ItemTplGenerator/itemOverrides";
import { inject, injectAll, injectable } from "tsyringe";

@injectable()
export class ItemTplGenerator {
    private enumDir: string;
    private items: Record<string, ITemplateItem>;
    private itemOverrides: Record<string, string>;
    private collidedEnumKeys: string[] = [];

    constructor(
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("LocaleService") protected localeService: LocaleService,
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @injectAll("OnLoad") protected onLoadComponents: OnLoad[],
    ) {}

    async run(): Promise<void> {
        // Load all of the onload components, this gives us access to most of SPTs injections
        for (const onLoad of this.onLoadComponents) {
            await onLoad.onLoad();
        }

        // Figure out our source and target directories
        const currentDir = path.dirname(__filename);
        const projectDir = path.resolve(currentDir, "..", "..", "..");
        this.enumDir = path.join(projectDir, "src", "models", "enums");
        this.items = this.databaseServer.getTables().templates.items;
        this.itemOverrides = itemTplOverrides.default;

        // Generate an object containing all item name to ID associations
        const orderedItemsObject = this.generateItemsObject();

        // Log any changes to enum values, so the source can be updated as required
        this.logEnumValueChanges(orderedItemsObject, "ItemTpl", ItemTpl);
        const itemTplOutPath = path.join(this.enumDir, "ItemTpl.ts");
        this.writeEnumsToFile(itemTplOutPath, { ItemTpl: orderedItemsObject });

        // Handle the weapon type enums
        const weaponsObject = this.generateWeaponsObject();
        this.logEnumValueChanges(weaponsObject, "Weapons", Weapons);
        const weaponTypeOutPath = path.join(this.enumDir, "Weapons.ts");
        this.writeEnumsToFile(weaponTypeOutPath, { Weapons: weaponsObject });

        this.logger.info("Generating items finished");
    }

    /**
     * Return an object containing all items in the game with a generated name
     * @returns An object containing a generated item name to item ID association
     */
    private generateItemsObject(): Record<string, string> {
        const itemsObject = {};
        for (const item of Object.values(this.items)) {
            // Skip invalid items (Non-Item types, and shrapnel)
            if (!this.isValidItem(item)) continue;

            const itemParentName = this.getParentName(item);
            const itemPrefix = this.getItemPrefix(item);
            let itemName = this.getItemName(item);
            const itemSuffix = this.getItemSuffix(item);

            // Handle the case where the item starts with the parent category name. Avoids things like 'POCKETS_POCKETS'
            if (itemParentName === itemName.substring(1, itemParentName.length + 1) && itemPrefix === "") {
                itemName = itemName.substring(itemParentName.length + 1);
                if (itemName.length > 0 && itemName.at(0) !== "_") {
                    itemName = `_${itemName}`;
                }
            }

            // Handle the case where the item ends with the parent category name. Avoids things like 'KEY_DORM_ROOM_103_KEY'
            if (itemParentName === itemName.substring(itemName.length - itemParentName.length)) {
                itemName = itemName.substring(0, itemName.length - itemParentName.length);

                if (itemName.substring(itemName.length - 1) === "_") {
                    itemName = itemName.substring(0, itemName.length - 1);
                }
            }

            let itemKey = `${itemParentName}${itemPrefix}${itemName}${itemSuffix}`;

            // Strip out any remaining special characters
            itemKey = this.sanitizeEnumKey(itemKey);

            // If the key already exists, see if we can add a suffix to both this, and the existing conflicting item
            if (Object.keys(itemsObject).includes(itemKey) || this.collidedEnumKeys.includes(itemKey)) {
                // Keep track, so we can handle 3+ conflicts
                this.collidedEnumKeys.push(itemKey);

                const itemNameSuffix = this.getItemNameSuffix(item);
                if (itemNameSuffix) {
                    // Try to update the old key reference if we haven't already
                    if (itemsObject[itemKey]) {
                        const oldItemId = itemsObject[itemKey];
                        const oldItemNameSuffix = this.getItemNameSuffix(this.items[oldItemId]);
                        if (oldItemNameSuffix) {
                            const oldItemNewKey = this.sanitizeEnumKey(`${itemKey}_${oldItemNameSuffix}`);
                            delete itemsObject[itemKey];
                            itemsObject[oldItemNewKey] = oldItemId;
                        }
                    }

                    itemKey = this.sanitizeEnumKey(`${itemKey}_${itemNameSuffix}`);

                    // If we still collide, log an error
                    if (Object.keys(itemsObject).includes(itemKey)) {
                        this.logger.error(
                            `After rename, itemsObject already contains ${itemKey}  ${itemsObject[itemKey]} => ${item._id}`,
                        );
                    }
                } else {
                    this.logger.error(
                        `New itemOverride entry required: itemsObject already contains ${itemKey}  ${itemsObject[itemKey]} => ${item._id}`,
                    );
                    continue;
                }
            }

            itemsObject[itemKey] = item._id;
        }

        // Sort the items object
        const orderedItemsObject = Object.keys(itemsObject)
            .sort()
            .reduce((obj, key) => {
                obj[key] = itemsObject[key];
                return obj;
            }, {});

        return orderedItemsObject;
    }

    /**
     *
     * @param orderedItemsObject The previously generated object of item name to item ID associations
     * @returns
     */
    private generateWeaponsObject(): Record<string, string> {
        const weaponsObject = {};
        for (const [itemId, item] of Object.entries(this.items)) {
            if (!this.itemHelper.isOfBaseclass(itemId, BaseClasses.WEAPON)) {
                continue;
            }

            const caliber = this.cleanCaliber(item._props.ammoCaliber.toUpperCase());
            let weaponShortName = this.localeService.getLocaleDb()[`${itemId} ShortName`]?.toUpperCase();

            // Special case for the weird duplicated grenade launcher
            if (itemId === "639c3fbbd0446708ee622ee9") {
                weaponShortName = "FN40GL_2";
            }

            // Include any bracketed suffixes that exist, handles the case of colored gun variants
            const weaponFullName = this.localeService.getLocaleDb()[`${itemId} Name`]?.toUpperCase();
            const itemNameBracketSuffix = weaponFullName.match(/\((.+?)\)$/);
            if (itemNameBracketSuffix && !weaponShortName.endsWith(itemNameBracketSuffix[1])) {
                weaponShortName += `_${itemNameBracketSuffix[1]}`;
            }

            const parentName = this.getParentName(item);

            // Handle special characters
            const weaponName = `${parentName}_${caliber}_${weaponShortName}`
                .replace(/[- ]/g, "_")
                .replace(/[^a-zA-Z0-9_]/g, "")
                .toUpperCase();

            if (weaponsObject[weaponName]) {
                this.logger.error(`Error, weapon ${weaponName} already exists`);
                continue;
            }

            weaponsObject[weaponName] = itemId;
        }

        // Sort the weapons object
        const orderedWeaponsObject = Object.keys(weaponsObject)
            .sort()
            .reduce((obj, key) => {
                obj[key] = weaponsObject[key];
                return obj;
            }, {});

        return orderedWeaponsObject;
    }

    /**
     * Clear any non-alpha numeric characters, and fix multiple underscores
     * @param enumKey The enum key to sanitize
     * @returns The sanitized enum key
     */
    private sanitizeEnumKey(enumKey: string): string {
        return enumKey
            .toUpperCase()
            .replace(/[^A-Z0-9_]/g, "")
            .replace(/_+/g, "_");
    }

    private getParentName(item: ITemplateItem): string {
        if (item._props.QuestItem) {
            return "QUEST";
        }
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.BARTER_ITEM)) {
            return "BARTER";
        }
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.THROW_WEAPON)) {
            return "GRENADE";
        }
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.STIMULATOR)) {
            return "STIM";
        }
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.MAGAZINE)) {
            return "MAGAZINE";
        }
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.KEY_MECHANICAL)) {
            return "KEY";
        }
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.MOB_CONTAINER)) {
            return "SECURE";
        }
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.SIMPLE_CONTAINER)) {
            return "CONTAINER";
        }
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.PORTABLE_RANGE_FINDER)) {
            return "RANGEFINDER";
        }
        // Why are flares grenade launcher...?
        if (item._name.startsWith("weapon_rsp30")) {
            return "FLARE";
        }
        // This is a special case for the signal pistol, I'm not adding it as a Grenade Launcher
        if (item._id === "620109578d82e67e7911abf2") {
            return "SIGNALPISTOL";
        }

        const parentId = item._parent;
        return this.items[parentId]._name.toUpperCase();
    }

    private isValidItem(item: ITemplateItem): boolean {
        const shrapnelId = "5943d9c186f7745a13413ac9";

        if (item._type !== "Item") {
            return false;
        }

        if (item._proto === shrapnelId) {
            return false;
        }

        return true;
    }

    /**
     * Generate a prefix for the passed in item
     * @param item The item to generate the prefix for
     * @returns The prefix of the given item
     */
    private getItemPrefix(item: ITemplateItem): string {
        let prefix = "";

        // Prefix ammo with its caliber
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.AMMO)) {
            prefix = this.getAmmoPrefix(item);
        }
        // Prefix ammo boxes with their caliber
        else if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.AMMO_BOX)) {
            prefix = this.getAmmoBoxPrefix(item);
        }
        // Prefix magazines with their caliber
        else if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.MAGAZINE)) {
            prefix = this.getMagazinePrefix(item);
        }

        // Make sure there's an underscore separator
        if (prefix.length > 0 && prefix.at(0) !== "_") {
            prefix = `_${prefix}`;
        }

        return prefix;
    }

    private getItemSuffix(item: ITemplateItem): string {
        let suffix = "";

        // Add mag size for magazines
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.MAGAZINE)) {
            suffix = `${item._props.Cartridges[0]?._max_count?.toString()}RND`;
        }
        // Add pack size for ammo boxes
        else if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.AMMO_BOX)) {
            suffix = `${item._props.StackSlots[0]?._max_count.toString()}RND`;
        }

        // Add "DAMAGED" for damaged items
        if (item._name.toLowerCase().includes("damaged")) {
            suffix += "_DAMAGED";
        }

        // Make sure there's an underscore separator
        if (suffix.length > 0 && suffix.at(0) !== "_") {
            suffix = `_${suffix}`;
        }

        return suffix;
    }

    private getAmmoPrefix(item: ITemplateItem): string {
        const prefix = item._props.Caliber.toUpperCase();

        return this.cleanCaliber(prefix);
    }

    private cleanCaliber(ammoCaliber: string): string {
        ammoCaliber = ammoCaliber.replace("CALIBER", "");
        ammoCaliber = ammoCaliber.replace("PARA", "");
        ammoCaliber = ammoCaliber.replace("NATO", "");

        // Special case for 45ACP
        ammoCaliber = ammoCaliber.replace("1143X23ACP", "45ACP");

        return ammoCaliber;
    }

    private getAmmoBoxPrefix(item: ITemplateItem): string {
        const ammoItem = item._props.StackSlots[0]?._props.filters[0].Filter[0];

        return this.getAmmoPrefix(this.items[ammoItem]);
    }

    private getMagazinePrefix(item: ITemplateItem): string {
        const ammoItem = item._props.Cartridges[0]?._props.filters[0].Filter[0];

        return this.getAmmoPrefix(this.items[ammoItem]);
    }

    /**
     * Return the name of the passed in item, formatted for use in an enum
     * @param item The item to generate the name for
     * @returns The name of the given item
     */
    private getItemName(item) {
        let itemName: string;

        // Manual item name overrides
        if (this.itemOverrides[item._id]) {
            itemName = this.itemOverrides[item._id].toUpperCase();
        }
        // For the listed types, user the item's _name property
        else if (
            this.itemHelper.isOfBaseclasses(item._id, [
                BaseClasses.RANDOM_LOOT_CONTAINER,
                BaseClasses.BUILT_IN_INSERTS,
                BaseClasses.STASH,
            ])
        ) {
            itemName = item._name.toUpperCase();
        }
        // For the listed types, use the short name
        else if (
            this.itemHelper.isOfBaseclasses(item._id, [BaseClasses.AMMO, BaseClasses.AMMO_BOX, BaseClasses.MAGAZINE])
        ) {
            itemName = this.localeService.getLocaleDb()[`${item._id} ShortName`]?.toUpperCase();
        }
        // For everything else, use the full name
        else {
            itemName = this.localeService.getLocaleDb()[`${item._id} Name`]?.toUpperCase();
        }

        // Fall back in the event we couldn't find a name
        if (!itemName) {
            itemName = this.localeService.getLocaleDb()[`${item._id} Name`]?.toUpperCase();
        }
        if (!itemName) {
            itemName = item._name.toUpperCase();
        }

        if (!itemName) {
            console.log(`Unable to get shortname for ${item._id}`);
            return "";
        }

        itemName = itemName.trim().replace(/[-.()]/g, "");
        itemName = itemName.replace(/[ ]/g, "_");

        return `_${itemName}`;
    }

    private getItemNameSuffix(item: ITemplateItem): string {
        const itemName = this.localeService.getLocaleDb()[`${item._id} Name`];

        // Add grid size for lootable containers
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.LOOT_CONTAINER)) {
            return `${item._props.Grids[0]?._props.cellsH}X${item._props.Grids[0]?._props.cellsV}`;
        }

        // Add ammo caliber to conflicting weapons
        if (this.itemHelper.isOfBaseclass(item._id, BaseClasses.WEAPON)) {
            const caliber = this.cleanCaliber(item._props.ammoCaliber.toUpperCase());

            // If the item has a bracketed section at the end of its name, include that
            const itemNameBracketSuffix = itemName?.match(/\((.+?)\)$/);
            if (itemNameBracketSuffix) {
                return `${caliber}_${itemNameBracketSuffix[1]}`;
            }

            return caliber;
        }

        // Make sure we have a full name
        if (!itemName) {
            return "";
        }

        // If the item has a bracketed section at the end of its name, use that
        const itemNameBracketSuffix = itemName.match(/\((.+?)\)$/);
        if (itemNameBracketSuffix) {
            return itemNameBracketSuffix[1];
        }

        // If the item has a number at the end of its name, use that
        const itemNameNumberSuffix = itemName.match(/#([0-9]+)$/);
        if (itemNameNumberSuffix) {
            return itemNameNumberSuffix[1];
        }

        return "";
    }

    private logEnumValueChanges(data: Record<string, string>, enumName: string, originalEnum: Record<string, string>) {
        // First generate a mapping of the original enum values to names
        const originalEnumValues = {};
        for (const [key, value] of Object.entries(originalEnum)) {
            originalEnumValues[value as string] = key;
        }

        // Loop through our new data, and find any where the given ID's name doesn't match the original enum
        for (const [dataKey, dataValue] of Object.entries(data)) {
            if (originalEnumValues[dataValue] && originalEnumValues[dataValue] !== dataKey) {
                this.logger.warning(
                    `Enum ${enumName} key has changed for ${dataValue}, ${originalEnumValues[dataValue]} => ${dataKey}`,
                );
            }
        }
    }

    private writeEnumsToFile(outputPath: string, enumEntries: Record<string, Record<string, string>>): void {
        let enumFileData = "// This is an auto generated file, do not modify. Re-generate with `npm run gen:items`";

        for (const [enumName, data] of Object.entries(enumEntries)) {
            enumFileData += `\nexport enum ${enumName}\n{\n`;

            for (const [key, value] of Object.entries(data)) {
                enumFileData += `    ${key} = "${value}",\n`;
            }

            enumFileData += "}\n";
        }

        fs.writeFileSync(outputPath, enumFileData, "utf-8");
    }
}
