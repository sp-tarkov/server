import { inject, injectable } from "tsyringe";

import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { IStorePlayerOfferTaxAmountRequestData } from "@spt-aki/models/eft/ragfair/IStorePlayerOfferTaxAmountRequestData";
import { BonusType } from "@spt-aki/models/enums/BonusType";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { RagfairPriceService } from "@spt-aki/services/RagfairPriceService";

@injectable()
export class RagfairTaxService
{
    protected playerOfferTaxCache: Record<string, IStorePlayerOfferTaxAmountRequestData> = {};

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
    )
    {}

    public storeClientOfferTaxValue(sessionId: string, offer: IStorePlayerOfferTaxAmountRequestData): void
    {
        this.playerOfferTaxCache[offer.id] = offer;
    }

    public clearStoredOfferTaxById(offerIdToRemove: string): void
    {
        delete this.playerOfferTaxCache[offerIdToRemove];
    }

    public getStoredClientOfferTaxValueById(offerIdToGet: string): IStorePlayerOfferTaxAmountRequestData
    {
        return this.playerOfferTaxCache[offerIdToGet];
    }

    /**
    // This method, along with calculateItemWorth, is trying to mirror the client-side code found in the method "CalculateTaxPrice".
    // It's structured to resemble the client-side code as closely as possible - avoid making any big structure changes if it's not necessary.
     * @param item Item being sold on flea
     * @param pmcData player profile
     * @param requirementsValue
     * @param offerItemCount Number of offers being created
     * @param sellInOnePiece
     * @returns Tax in roubles
     */
    public calculateTax(
        item: Item,
        pmcData: IPmcData,
        requirementsValue: number,
        offerItemCount: number,
        sellInOnePiece: boolean,
    ): number
    {
        if (!requirementsValue)
        {
            return 0;
        }

        if (!offerItemCount)
        {
            return 0;
        }

        const itemTemplate = this.itemHelper.getItem(item._tpl)[1];
        const itemWorth = this.calculateItemWorth(item, itemTemplate, offerItemCount, pmcData);
        const requirementsPrice = requirementsValue * (sellInOnePiece ? 1 : offerItemCount);

        const itemTaxMult = this.databaseServer.getTables().globals.config.RagFair.communityItemTax / 100.0;
        const requirementTaxMult = this.databaseServer.getTables().globals.config.RagFair.communityRequirementTax
            / 100.0;

        let itemPriceMult = Math.log10(itemWorth / requirementsPrice);
        let requirementPriceMult = Math.log10(requirementsPrice / itemWorth);

        if (requirementsPrice >= itemWorth)
        {
            requirementPriceMult = requirementPriceMult ** 1.08;
        }
        else
        {
            itemPriceMult = itemPriceMult ** 1.08;
        }

        itemPriceMult = 4 ** itemPriceMult;
        requirementPriceMult = 4 ** requirementPriceMult;

        const hideoutFleaTaxDiscountBonus = pmcData.Bonuses.find((b) => b.type === BonusType.RAGFAIR_COMMISSION);
        const taxDiscountPercent = hideoutFleaTaxDiscountBonus ? Math.abs(hideoutFleaTaxDiscountBonus.value) : 0;

        const tax = itemWorth * itemTaxMult * itemPriceMult
            + requirementsPrice * requirementTaxMult * requirementPriceMult;
        const discountedTax = tax * (1.0 - taxDiscountPercent / 100.0);
        const itemComissionMult = itemTemplate._props.RagFairCommissionModifier
            ? itemTemplate._props.RagFairCommissionModifier
            : 1;

        if (item.upd.Buff)
        {
            // TODO: enhance tax calc with client implementation from GClass1932/CalculateTaxPrice()
        }

        const taxValue = Math.round(discountedTax * itemComissionMult);
        this.logger.debug(`Tax Calculated to be: ${taxValue}`);

        return taxValue;
    }

    // This method is trying to replicate the item worth calculation method found in the client code.
    // Any inefficiencies or style issues are intentional and should not be fixed, to preserve the client-side code mirroring.
    protected calculateItemWorth(
        item: Item,
        itemTemplate: ITemplateItem,
        itemCount: number,
        pmcData: IPmcData,
        isRootItem = true,
    ): number
    {
        let worth = this.ragfairPriceService.getFleaPriceForItem(item._tpl);

        // In client, all item slots are traversed and any items contained within have their values added
        if (isRootItem)
        { // Since we get a flat list of all child items, we only want to recurse from parent item
            const itemChildren = this.itemHelper.findAndReturnChildrenAsItems(pmcData.Inventory.items, item._id);
            if (itemChildren.length > 1)
            {
                for (const child of itemChildren)
                {
                    if (child._id === item._id)
                    {
                        continue;
                    }

                    worth += this.calculateItemWorth(
                        child,
                        this.itemHelper.getItem(child._tpl)[1],
                        child.upd.StackObjectsCount,
                        pmcData,
                        false,
                    );
                }
            }
        }

        if ("Dogtag" in item.upd)
        {
            worth *= item.upd.Dogtag.Level;
        }

        if ("Key" in item.upd && itemTemplate._props.MaximumNumberOfUsage > 0)
        {
            worth = worth / itemTemplate._props.MaximumNumberOfUsage
                * (itemTemplate._props.MaximumNumberOfUsage - item.upd.Key.NumberOfUsages);
        }

        if ("Resource" in item.upd && itemTemplate._props.MaxResource > 0)
        {
            worth = worth * 0.1 + worth * 0.9 / itemTemplate._props.MaxResource * item.upd.Resource.Value;
        }

        if ("SideEffect" in item.upd && itemTemplate._props.MaxResource > 0)
        {
            worth = worth * 0.1 + worth * 0.9 / itemTemplate._props.MaxResource * item.upd.SideEffect.Value;
        }

        if ("MedKit" in item.upd && itemTemplate._props.MaxHpResource > 0)
        {
            worth = worth / itemTemplate._props.MaxHpResource * item.upd.MedKit.HpResource;
        }

        if ("FoodDrink" in item.upd && itemTemplate._props.MaxResource > 0)
        {
            worth = worth / itemTemplate._props.MaxResource * item.upd.FoodDrink.HpPercent;
        }

        if ("Repairable" in item.upd && <number>itemTemplate._props.armorClass > 0)
        {
            const num2 = 0.01 * (0.0 ** item.upd.Repairable.MaxDurability);
            worth = worth * ((item.upd.Repairable.MaxDurability / itemTemplate._props.Durability) - num2)
                - Math.floor(
                    itemTemplate._props.RepairCost
                        * (item.upd.Repairable.MaxDurability - item.upd.Repairable.Durability),
                );
        }

        return worth * itemCount;
    }
}
