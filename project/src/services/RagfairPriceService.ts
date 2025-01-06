import { OnLoad } from "@spt/di/OnLoad";
import { HandbookHelper } from "@spt/helpers/HandbookHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { MinMax } from "@spt/models/common/MinMax";
import { IPreset } from "@spt/models/eft/common/IGlobals";
import { IHandbookItem } from "@spt/models/eft/common/tables/IHandbookBase";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IBarterScheme } from "@spt/models/eft/common/tables/ITrader";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { Money } from "@spt/models/enums/Money";
import { IRagfairConfig, IUnreasonableModPrices } from "@spt/models/spt/config/IRagfairConfig";
import { IRagfairServerPrices } from "@spt/models/spt/ragfair/IRagfairServerPrices";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { inject, injectable } from "tsyringe";

/**
 * Stores flea prices for items as well as methods to interact with them
 */
@injectable()
export class RagfairPriceService implements OnLoad {
    protected ragfairConfig: IRagfairConfig;

    protected prices: IRagfairServerPrices = { static: {}, dynamic: {} };

    constructor(
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
    }

    /**
     * Generate static (handbook) and dynamic (prices.json) flea prices, store inside class as dictionaries
     */
    public async onLoad(): Promise<void> {
        this.refreshStaticPrices();
        this.refreshDynamicPrices();
    }

    public getRoute(): string {
        return "RagfairPriceService";
    }

    /**
     * Iterate over all items of type "Item" in db and get template price, store in cache
     */
    public refreshStaticPrices(): void {
        for (const item of Object.values(this.databaseService.getItems()).filter((x) => x._type === "Item")) {
            this.prices.static[item._id] = Math.round(this.handbookHelper.getTemplatePrice(item._id));
        }
    }

    /**
     * Copy the prices.json data into our dynamic price dictionary
     */
    public refreshDynamicPrices(): void {
        const pricesTable = this.databaseService.getPrices();
        this.prices.dynamic = { ...this.prices.dynamic, ...pricesTable };
    }

    /**
     * Get the dynamic price for an item. If value doesn't exist, use static (handbook) value.
     * if no static value, return 1
     * @param tplId Item tpl id to get price for
     * @returns price in roubles
     */
    public getFleaPriceForItem(tplId: string): number {
        // Get dynamic price (templates/prices), if that doesnt exist get price from static array (templates/handbook)
        let itemPrice = this.getDynamicPriceForItem(tplId) || this.getStaticPriceForItem(tplId);
        if (itemPrice === undefined) {
            const itemFromDb = this.itemHelper.getItem(tplId);
            const itemName = itemFromDb[0] ? itemFromDb[1]?._name : "";
            this.logger.warning(
                this.localisationService.getText("ragfair-unable_to_find_item_price_for_item_in_flea_handbook", {
                    tpl: tplId,
                    name: itemName,
                }),
            );
        }

        // If no price in dynamic/static, set to 1
        itemPrice = itemPrice || 1;

        return itemPrice;
    }

    /**
     * Get the flea price for an offers items + children
     * @param offerItems offer item + children to process
     * @returns Rouble price
     */
    public getFleaPriceForOfferItems(offerItems: IItem[]): number {
        // Preset weapons take the direct prices.json value, otherwise they're massivly inflated
        if (this.itemHelper.isOfBaseclass(offerItems[0]._tpl, BaseClasses.WEAPON)) {
            return this.getFleaPriceForItem(offerItems[0]._tpl);
        }

        let totalPrice = 0;
        for (const item of offerItems) {
            totalPrice += this.getFleaPriceForItem(item._tpl);
        }

        return totalPrice;
    }

    /**
     * get the dynamic (flea) price for an item
     * @param itemTpl item template id to look up
     * @returns price in roubles
     */
    public getDynamicPriceForItem(itemTpl: string): number {
        // If the price doesn't exist in the cache yet, try to find it
        if (!this.prices.dynamic[itemTpl]) {
            this.prices.dynamic[itemTpl] = this.databaseService.getPrices()[itemTpl];
        }

        return this.prices.dynamic[itemTpl];
    }

    /**
     * Grab the static (handbook) for an item by its tplId
     * @param itemTpl item template id to look up
     * @returns price in roubles
     */
    public getStaticPriceForItem(itemTpl: string): number {
        // If the price doesn't exist in the cache yet, try to find it
        if (!this.prices.static[itemTpl]) {
            // Store the price in the cache only if it exists
            const itemPrice = Math.round(this.handbookHelper.getTemplatePrice(itemTpl));
            if (itemPrice !== 0) {
                this.prices.static[itemTpl] = itemPrice;
            }
        }

        return this.prices.static[itemTpl];
    }

    /**
     * Get prices for all items on flea, prioritize handbook prices first, use prices from prices.json if missing
     * This will refresh the caches prior to building the output
     * @returns Dictionary of item tpls and rouble cost
     */
    public getAllFleaPrices(): Record<string, number> {
        // Refresh the caches so we include any newly added custom items
        this.refreshDynamicPrices();
        this.refreshStaticPrices();

        // assign dynamic (prices.json) values first, then overwrite them with static (handbook.json)
        // any values not stored in static data will be covered by dynamic data
        return { ...this.prices.dynamic, ...this.prices.static };
    }

    public getAllStaticPrices(): Record<string, number> {
        // Refresh the cache so we include any newly added custom items
        this.refreshStaticPrices();

        return { ...this.prices.static };
    }

    /**
     * Get the percentage difference between two values
     * @param a numerical value a
     * @param b numerical value b
     * @returns different in percent
     */
    protected getPriceDifference(a: number, b: number): number {
        return (100 * a) / (a + b);
    }

    /**
     * Get the rouble price for an assorts barter scheme
     * @param barterScheme
     * @returns Rouble price
     */
    public getBarterPrice(barterScheme: IBarterScheme[]): number {
        let price = 0;

        for (const item of barterScheme) {
            price += this.getStaticPriceForItem(item._tpl) * item.count;
        }

        return Math.round(price);
    }

    /**
     * Generate a currency cost for an item and its mods
     * @param offerItems Item with mods to get price for
     * @param desiredCurrency Currency price desired in
     * @param isPackOffer Price is for a pack type offer
     * @returns cost of item in desired currency
     */
    public getDynamicOfferPriceForOffer(offerItems: IItem[], desiredCurrency: string, isPackOffer: boolean): number {
        // Price to return.
        let price = 0;

        // Iterate over each item in the offer.
        for (const item of offerItems) {
            // Skip over armour inserts as those are not factored into item prices.
            if (this.itemHelper.isOfBaseclass(item._tpl, BaseClasses.BUILT_IN_INSERTS)) {
                continue;
            }

            price += this.getDynamicItemPrice(item._tpl, desiredCurrency, item, offerItems, isPackOffer);

            // Check if the item is a weapon preset.
            if (
                item?.upd?.sptPresetId &&
                this.presetHelper.isPresetBaseClass(item.upd.sptPresetId, BaseClasses.WEAPON)
            ) {
                // This is a weapon preset, which has it's own price calculation that takes into account the mods in the
                // preset. Since we've already calculated the price for the preset entire preset in
                // `getDynamicItemPrice`, we can skip the rest of the items in the offer.
                break;
            }
        }

        return Math.round(price);
    }

    /**
     * @param itemTemplateId items tpl value
     * @param desiredCurrency Currency to return result in
     * @param item Item object (used for weapon presets)
     * @param offerItems
     * @param isPackOffer
     * @returns
     */
    public getDynamicItemPrice(
        itemTemplateId: string,
        desiredCurrency: string,
        item?: IItem,
        offerItems?: IItem[],
        isPackOffer?: boolean,
    ): number {
        let isPreset = false;
        let price = this.getFleaPriceForItem(itemTemplateId);

        // Adjust price if below handbook price, based on config.
        if (this.ragfairConfig.dynamic.offerAdjustment.adjustPriceWhenBelowHandbookPrice) {
            price = this.adjustPriceIfBelowHandbook(price, itemTemplateId);
        }

        // Use trader price if higher, based on config.
        if (this.ragfairConfig.dynamic.useTraderPriceForOffersIfHigher) {
            const traderPrice = this.traderHelper.getHighestSellToTraderPrice(itemTemplateId);
            if (traderPrice > price) {
                price = traderPrice;
            }
        }

        // Prices for weapon presets are handled differently.
        if (
            item?.upd?.sptPresetId &&
            offerItems &&
            this.presetHelper.isPresetBaseClass(item.upd.sptPresetId, BaseClasses.WEAPON)
        ) {
            price = this.getWeaponPresetPrice(item, offerItems, price);
            isPreset = true;
        }

        // Check for existence of manual price adjustment multiplier
        const multiplier = this.ragfairConfig.dynamic.itemPriceMultiplier[itemTemplateId];
        if (multiplier) {
            price *= multiplier;
        }

        // The quality of the item affects the price + not on the ignore list
        if (item && !this.ragfairConfig.dynamic.ignoreQualityPriceVarianceBlacklist.includes(itemTemplateId)) {
            const qualityModifier = this.itemHelper.getItemQualityModifier(item);
            price *= qualityModifier;
        }

        // Make adjustments for unreasonably priced items.
        for (const baseClassTemplateId of Object.keys(this.ragfairConfig.dynamic.unreasonableModPrices)) {
            if (this.itemHelper.isOfBaseclass(itemTemplateId, baseClassTemplateId)) {
                // Found an unreasonable price type.
                const unreasonableModifier: IUnreasonableModPrices =
                    this.ragfairConfig.dynamic.unreasonableModPrices[baseClassTemplateId];

                if (unreasonableModifier.enabled) {
                    price = this.adjustUnreasonablePrice(
                        this.databaseService.getHandbook().Items,
                        unreasonableModifier,
                        itemTemplateId,
                        price,
                    );
                }
            }
        }

        // Vary the price based on the type of offer.
        const range = this.getOfferTypeRangeValues(isPreset, isPackOffer ?? false);
        price = this.randomiseOfferPrice(price, range);

        // Convert to different currency if required.
        const roublesId = Money.ROUBLES;
        if (desiredCurrency !== roublesId) {
            price = this.handbookHelper.fromRUB(price, desiredCurrency);
        }

        if (price < 1) {
            return 1;
        }
        return price;
    }

    /**
     * using data from config, adjust an items price to be relative to its handbook price
     * @param handbookPrices Prices of items in handbook
     * @param unreasonableItemChange Change object from config
     * @param itemTpl Item being adjusted
     * @param price Current price of item
     * @returns Adjusted price of item
     */
    protected adjustUnreasonablePrice(
        handbookPrices: IHandbookItem[],
        unreasonableItemChange: IUnreasonableModPrices,
        itemTpl: string,
        price: number,
    ): number {
        const itemHandbookPrice = handbookPrices.find((handbookItem) => handbookItem.Id === itemTpl);
        if (!itemHandbookPrice) {
            return price;
        }

        // Flea price is over handbook price
        if (price > itemHandbookPrice.Price * unreasonableItemChange.handbookPriceOverMultiplier) {
            // Skip extreme values
            if (price <= 1) {
                return price;
            }

            // Price is over limit, adjust
            return itemHandbookPrice.Price * unreasonableItemChange.newPriceHandbookMultiplier;
        }

        return price;
    }

    /**
     * Get different min/max price multipliers for different offer types (preset/pack/default)
     * @param isPreset Offer is a preset
     * @param isPack Offer is a pack
     * @returns MinMax values
     */
    protected getOfferTypeRangeValues(isPreset: boolean, isPack: boolean): MinMax {
        // Use different min/max values if the item is a preset or pack
        const priceRanges = this.ragfairConfig.dynamic.priceRanges;
        if (isPreset) {
            return priceRanges.preset;
        }

        if (isPack) {
            return priceRanges.pack;
        }

        return priceRanges.default;
    }

    /**
     * Check to see if an items price is below its handbook price and adjust according to values set to config/ragfair.json
     * @param itemPrice price of item
     * @param itemTpl item template Id being checked
     * @returns adjusted price value in roubles
     */
    protected adjustPriceIfBelowHandbook(itemPrice: number, itemTpl: string): number {
        const itemHandbookPrice = this.getStaticPriceForItem(itemTpl);
        const priceDifferencePercent = this.getPriceDifference(itemHandbookPrice, itemPrice);

        // Only adjust price if difference is > a percent AND item price passes threshold set in config
        if (
            priceDifferencePercent >
                this.ragfairConfig.dynamic.offerAdjustment.maxPriceDifferenceBelowHandbookPercent &&
            itemPrice >= this.ragfairConfig.dynamic.offerAdjustment.priceThreshholdRub
        ) {
            // const itemDetails = this.itemHelper.getItem(itemTpl);
            // this.logger.debug(`item below handbook price ${itemDetails[1]._name} handbook: ${itemHandbookPrice} flea: ${itemPrice} ${priceDifferencePercent}%`);
            return Math.round(itemHandbookPrice * this.ragfairConfig.dynamic.offerAdjustment.handbookPriceMultipier);
        }

        return itemPrice;
    }

    /**
     * Multiply the price by a randomised curve where n = 2, shift = 2
     * @param existingPrice price to alter
     * @param rangeValues min and max to adjust price by
     * @returns multiplied price
     */
    protected randomiseOfferPrice(existingPrice: number, rangeValues: MinMax): number {
        // Multiply by 100 to get 2 decimal places of precision
        const multiplier = this.randomUtil.getBiasedRandomNumber(rangeValues.min * 100, rangeValues.max * 100, 2, 2);

        // return multiplier back to its original decimal place location
        return existingPrice * (multiplier / 100);
    }

    /**
     * Calculate the cost of a weapon preset by adding together the price of its mods + base price of default weapon preset
     * @param weaponRootItem base weapon
     * @param weaponWithChildren weapon plus mods
     * @param existingPrice price of existing base weapon
     * @returns price of weapon in roubles
     */
    protected getWeaponPresetPrice(weaponRootItem: IItem, weaponWithChildren: IItem[], existingPrice: number): number {
        // Get the default preset for this weapon
        const presetResult = this.getWeaponPreset(weaponRootItem);
        if (presetResult.isDefault) {
            return this.getFleaPriceForItem(weaponRootItem._tpl);
        }

        // Get mods on current gun not in default preset
        const newOrReplacedModsInPresetVsDefault = weaponWithChildren.filter(
            (x) => !presetResult.preset._items.some((y) => y._tpl === x._tpl),
        );

        // Add up extra mods price
        let extraModsPrice = 0;
        for (const mod of newOrReplacedModsInPresetVsDefault) {
            // Use handbook or trader price, whatever is higher (dont use dynamic flea price as purchased item cannot be relisted)
            extraModsPrice += this.getHighestHandbookOrTraderPriceAsRouble(mod._tpl);
        }

        // Only deduct cost of replaced mods if there's replaced/new mods
        if (newOrReplacedModsInPresetVsDefault.length >= 1) {
            // Add up cost of mods replaced
            const modsReplacedByNewMods = newOrReplacedModsInPresetVsDefault.filter((x) =>
                presetResult.preset._items.some((y) => y.slotId === x.slotId),
            );

            // Add up replaced mods price
            let replacedModsPrice = 0;
            for (const replacedMod of modsReplacedByNewMods) {
                replacedModsPrice += this.getHighestHandbookOrTraderPriceAsRouble(replacedMod._tpl);
            }

            // Subtract replaced mods total from extra mods total
            extraModsPrice -= replacedModsPrice;
        }

        // return extra mods price + base gun price
        return existingPrice + extraModsPrice;
    }

    /**
     * Get the highest price for an item that is stored in handbook or trader assorts
     * @param itemTpl Item to get highest price of
     * @returns rouble cost
     */
    protected getHighestHandbookOrTraderPriceAsRouble(itemTpl: string): number {
        let price = this.getStaticPriceForItem(itemTpl);
        const traderPrice = this.traderHelper.getHighestSellToTraderPrice(itemTpl);
        if (traderPrice > price) {
            price = traderPrice;
        }

        return price;
    }

    /**
     * Attempt to get the default preset for a weapon, failing that get the first preset in the array
     * (assumes default = has encyclopedia entry)
     * @param presets weapon presets to choose from
     * @returns Default preset object
     */
    protected getWeaponPreset(weapon: IItem): { isDefault: boolean; preset: IPreset } {
        const defaultPreset = this.presetHelper.getDefaultPreset(weapon._tpl);
        if (defaultPreset) {
            return { isDefault: true, preset: defaultPreset };
        }
        const nonDefaultPresets = this.presetHelper.getPresets(weapon._tpl);
        if (nonDefaultPresets.length === 1) {
            this.logger.debug(
                `Item Id: ${weapon._tpl} has no default encyclopedia entry but only one preset (${nonDefaultPresets[0]._name}), choosing preset (${nonDefaultPresets[0]._name})`,
            );
        } else {
            this.logger.debug(
                `Item Id: ${weapon._tpl} has no default encyclopedia entry, choosing first preset (${nonDefaultPresets[0]._name}) of ${nonDefaultPresets.length}`,
            );
        }

        return { isDefault: false, preset: nonDefaultPresets[0] };
    }
}
