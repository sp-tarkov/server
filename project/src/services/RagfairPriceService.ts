import { inject, injectable } from "tsyringe";

import { OnLoad } from "../di/OnLoad";
import { HandbookHelper } from "../helpers/HandbookHelper";
import { ItemHelper } from "../helpers/ItemHelper";
import { PresetHelper } from "../helpers/PresetHelper";
import { TraderHelper } from "../helpers/TraderHelper";
import { Preset } from "../models/eft/common/IGlobals";
import { Item } from "../models/eft/common/tables/IItem";
import { IBarterScheme } from "../models/eft/common/tables/ITrader";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { Money } from "../models/enums/Money";
import { IRagfairConfig } from "../models/spt/config/IRagfairConfig";
import { IRagfairServerPrices } from "../models/spt/ragfair/IRagfairServerPrices";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { RandomUtil } from "../utils/RandomUtil";

/**
 * Stores flea prices for items as well as methods to interact with them
 */
@injectable()
export class RagfairPriceService implements OnLoad
{
    protected ragfairConfig: IRagfairConfig;
    protected generatedDynamicPrices: boolean;
    protected generatedStaticPrices: boolean;

    protected prices: IRagfairServerPrices = {
        static: {},
        dynamic: {}
    };

    constructor(
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
    }

    /**
     * Generate static (handbook) and dynamic (prices.json) flea prices, store inside class as dictionaries
     */
    public async onLoad(): Promise<void> 
    {
        if (!this.generatedStaticPrices)
        {
            this.generateStaticPrices();
            this.generatedStaticPrices = true;
        }

        if (!this.generatedDynamicPrices)
        {
            this.generateDynamicPrices();
            this.generatedDynamicPrices = true;
        }
    }

    public getRoute(): string 
    {
        return "RagfairPriceService";
    }

    /**
     * Iterate over all items of type "Item" in db and get template price, store in cache
     */
    public generateStaticPrices(): void
    {
        for (const item of Object.values(this.databaseServer.getTables().templates.items).filter(x => x._type === "Item"))
        {
            this.prices.static[item._id] = Math.round(this.handbookHelper.getTemplatePrice(item._id));
        }
    }

    /**
     * Create a dictionary and store prices from prices.json in it
     */
    protected generateDynamicPrices(): void
    {
        Object.assign(this.prices.dynamic, this.databaseServer.getTables().templates.prices);
    }

    /**
     * Get the dynamic price for an item. If value doesn't exist, use static (handbook) value.
     * if no static value, return 1
     * @param tplId Item tpl id to get price for
     * @returns price in roubles
     */
    public getFleaPriceForItem(tplId: string): number
    {
        // Get dynamic price (templates/prices), if that doesnt exist get price from static array (templates/handbook)
        let itemPrice = this.getDynamicPriceForItem(tplId);
        if (!itemPrice || itemPrice === 1)
        {
            itemPrice = this.getStaticPriceForItem(tplId);
        }

        if (!itemPrice)
        {
            this.logger.debug(`Missing item price for ${tplId}`);
            itemPrice = 1;
        }

        return itemPrice;
    }

    /**
     * get the dynamic (flea) price for an item
     * Grabs prices from prices.json and stores in class if none currently exist
     * @param itemTpl item template id to look up
     * @returns price in roubles
     */
    public getDynamicPriceForItem(itemTpl: string): number
    {
        if (!this.generatedDynamicPrices)
        {
            this.generateDynamicPrices();
        }

        return this.prices.dynamic[itemTpl];
    }

    /**
     * Grab the static (handbook) for an item by its tplId
     * @param itemTpl item template id to look up
     * @returns price in roubles
     */
    public getStaticPriceForItem(itemTpl: string): number
    {
        if (!this.generatedStaticPrices)
        {
            this.generateStaticPrices();
        }

        return this.prices.static[itemTpl];
    }

    /**
     * Get prices for all items on flea, priorities dynamic prices from prices.json, use handbook prices if missing
     * @returns Dictionary of item tpls and rouble cost
     */
    public getAllFleaPrices(): Record<string, number>
    {
        // assign static values first, then overwrite them with dynamic, any values not stored in dynamic data will be covered by static data
        return { ...this.prices.static, ...this.prices.dynamic };
    }

    public getAllStaticPrices(): Record<string, number>
    {
        return {...this.prices.static};
    }

    /**
     * Get the percentage difference between two values
     * @param a numerical value a
     * @param b numerical value b
     * @returns different in percent
     */
    protected getPriceDifference(a: number, b: number): number
    {
        return 100 * a / (a + b);
    }

    /**
     * Get the rouble price for an assorts barter scheme
     * @param barterScheme 
     * @returns Rouble price
     */
    public getBarterPrice(barterScheme: IBarterScheme[]): number
    {
        let price = 0;

        for (const item of barterScheme)
        {
            price += (this.prices.static[item._tpl] * item.count);
        }

        return Math.round(price);
    }

    /**
     * Generate a currency cost for an item and its mods
     * @param items Item with mods to get price for
     * @param desiredCurrency Currency price desired in
     * @returns cost of item in desired currency
     */
    public getDynamicOfferPrice(items: Item[], desiredCurrency: string): number
    {
        // Price to return
        let price = 0;

        let endLoop = false;
        let isPreset = false;
        for (const item of items)
        {
            // Get dynamic price, fallback to handbook price if value of 1 found
            let itemPrice = this.getFleaPriceForItem(item._tpl);

            if (this.ragfairConfig.dynamic.offerAdjustment.adjustPriceWhenBelowHandbookPrice)
            {
                itemPrice = this.adjustPriceIfBelowHandbook(itemPrice, item._tpl);
            }

            if (this.ragfairConfig.dynamic.useTraderPriceForOffersIfHigher)
            {
                // Get highest trader price for item, if greater than value found so far, use it
                const traderPrice = this.traderHelper.getHighestTraderPriceRouble(item._tpl);
                if (traderPrice > itemPrice)
                {
                    itemPrice = traderPrice;
                }
            }
            
            // Check if item type is weapon preset, handle differently
            const itemDetails = this.itemHelper.getItem(item._tpl);
            if (this.presetHelper.isPreset(item._id) && itemDetails[1]._props.weapFireType)
            {
                itemPrice = this.getWeaponPresetPrice(item, items, itemPrice);
                endLoop = true;
                isPreset = true;
            }

            // Convert to different currency if desiredCurrency param is not roubles
            if (desiredCurrency !== Money.ROUBLES)
            {
                itemPrice = this.handbookHelper.fromRUB(itemPrice, desiredCurrency);
            }

            // Multiply dynamic price by quality modifier
            const itemQualityModifier = this.itemHelper.getItemQualityModifier(item);
            price += itemPrice * itemQualityModifier;

            // Stop loop if weapon preset price function has been run
            if (endLoop)
            {
                break;
            }
        }

        // Use different min/max values if the item is a preset
        price = this.randomisePrice(price, isPreset);
        
        if (price < 1)
        {
            price = 1;
        }

        return price;
    }

    /**
     * Check to see if an items price is below its handbook price and adjust accoring to values set to config/ragfair.json
     * @param itemPrice price of item
     * @param itemTpl item template Id being checked
     * @returns adjusted price value in roubles
     */
    protected adjustPriceIfBelowHandbook(itemPrice: number, itemTpl: string): number
    {
        const itemHandbookPrice = this.getStaticPriceForItem(itemTpl);
        const priceDifferencePercent = this.getPriceDifference(itemHandbookPrice, itemPrice);

        // Only adjust price if difference is > a percent AND item price passes threshhold set in config
        if (priceDifferencePercent > this.ragfairConfig.dynamic.offerAdjustment.maxPriceDifferenceBelowHandbookPercent
            && itemPrice >= this.ragfairConfig.dynamic.offerAdjustment.priceThreshholdRub)
        {
            //const itemDetails = this.itemHelper.getItem(itemTpl);
            //this.logger.debug(`item below handbook price ${itemDetails[1]._name} handbook: ${itemHandbookPrice} flea: ${itemPrice} ${priceDifferencePercent}%`);
            itemPrice = Math.round(itemHandbookPrice * this.ragfairConfig.dynamic.offerAdjustment.handbookPriceMultipier);
        }

        return itemPrice;
    }

    /**
     * Multiply the price by a randomised curve where n = 2, shift = 2
     * @param existingPrice price to alter
     * @param isPreset is the item we're multiplying a preset
     * @returns multiplied price
     */
    protected randomisePrice(existingPrice: number, isPreset: boolean): number
    {
        const min = (isPreset)
            ? this.ragfairConfig.dynamic.presetPrice.min
            : this.ragfairConfig.dynamic.price.min;

        const max = (isPreset)
            ? this.ragfairConfig.dynamic.presetPrice.max
            : this.ragfairConfig.dynamic.price.max;
    
        // Multiply by 100 to get 2 decimal places of precision
        const multiplier = this.randomUtil.getBiasedRandomNumber(min * 100, max * 100, 2, 2);

        // return multiplier back to its original decimal place location
        return existingPrice * (multiplier / 100);
    }

    /**
     * Calculate the cost of a weapon preset by adding together the price of its mods + base price of default weapon preset
     * @param item base weapon
     * @param items weapon plus mods
     * @param existingPrice price of existing base weapon
     * @returns 
     */
    protected getWeaponPresetPrice(item: Item, items: Item[], existingPrice: number): number
    {
        // Find all presets for this weapon type
        // If no presets found, return existing price
        const presets = this.presetHelper.getPresets(item._tpl);
        if (!presets || presets.length === 0)
        {
            this.logger.warning(`Item Id: ${item._tpl} has no presets`);

            return existingPrice;
        }

        // Get the default preset for this weapon
        const presetResult = this.getWeaponPreset(presets, item);
        if (presetResult.isDefault)
        {
            return this.getFleaPriceForItem(item._tpl);
        }

        // Get mods on current gun not in default preset
        const newOrReplacedModsInPresetVsDefault = items.filter(x => !presetResult.preset._items.some(y => y._tpl === x._tpl));

        // Add up extra mods price
        let extraModsPrice = 0;
        for (const mod of newOrReplacedModsInPresetVsDefault)
        {
            // Use handbook or trader price, whatever is higher (dont use dynamic flea price as purchased item cannot be relisted)
            extraModsPrice += this.getHighestHandbookOrTraderPriceAsRouble(mod._tpl);
        }

        // Only deduct cost of replaced mods if there's replaced/new mods
        if (newOrReplacedModsInPresetVsDefault.length >= 1)
        {
            // Add up cost of mods replaced
            const modsReplacedByNewMods = newOrReplacedModsInPresetVsDefault.filter(x => presetResult.preset._items.some(y => y.slotId === x.slotId));

            // Add up replaced mods price
            let replacedModsPrice = 0;
            for (const replacedMod of modsReplacedByNewMods)
            {
                replacedModsPrice += this.getHighestHandbookOrTraderPriceAsRouble(replacedMod._tpl);
            }

            // Subtract replaced mods total from extra mods total
            extraModsPrice -= replacedModsPrice;
        }

        // return extra mods price + base gun price
        return existingPrice += extraModsPrice;
    }

    /**
     * Get the highest price for an item that is stored in handbook or trader assorts
     * @param itemTpl Item to get highest price of
     * @returns rouble cost
     */
    protected getHighestHandbookOrTraderPriceAsRouble(itemTpl: string): number
    {
        let price = this.getStaticPriceForItem(itemTpl);
        const traderPrice = this.traderHelper.getHighestTraderPriceRouble(itemTpl);
        if (traderPrice > price)
        {
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
    protected getWeaponPreset(presets: Preset[], weapon: Item): {isDefault: boolean, preset: Preset}
    {
        const defaultPreset = presets.find(x => x._encyclopedia);
        if (defaultPreset)
        {
            return {
                isDefault: true,
                preset: defaultPreset
            };
        }

        if (presets.length === 1)
        {
            this.logger.debug(`Item Id: ${weapon._tpl} has no default encyclopedia entry but only one preset (${presets[0]._name}), choosing preset (${presets[0]._name})`);
        }
        else
        {
            this.logger.debug(`Item Id: ${weapon._tpl} has no default encyclopedia entry, choosing first preset (${presets[0]._name}) of ${presets.length}`);
        }

        return {
            isDefault: false,
            preset: presets[0]
        };
    }
}