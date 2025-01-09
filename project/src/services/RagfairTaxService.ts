import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { IStorePlayerOfferTaxAmountRequestData } from "@spt/models/eft/ragfair/IStorePlayerOfferTaxAmountRequestData";
import { BonusType } from "@spt/models/enums/BonusType";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseService } from "@spt/services/DatabaseService";
import { RagfairPriceService } from "@spt/services/RagfairPriceService";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class RagfairTaxService {
    protected playerOfferTaxCache: Record<string, IStorePlayerOfferTaxAmountRequestData> = {};

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {}

    public storeClientOfferTaxValue(sessionId: string, offer: IStorePlayerOfferTaxAmountRequestData): void {
        this.playerOfferTaxCache[offer.id] = offer;
    }

    public clearStoredOfferTaxById(offerIdToRemove: string): void {
        delete this.playerOfferTaxCache[offerIdToRemove];
    }

    public getStoredClientOfferTaxValueById(offerIdToGet: string): IStorePlayerOfferTaxAmountRequestData {
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
        item: IItem,
        pmcData: IPmcData,
        requirementsValue: number,
        offerItemCount: number,
        sellInOnePiece: boolean,
    ): number {
        if (!requirementsValue) {
            return 0;
        }

        if (!offerItemCount) {
            return 0;
        }

        const globals = this.databaseService.getGlobals();

        const itemTemplate = this.itemHelper.getItem(item._tpl)[1];
        const itemWorth = this.calculateItemWorth(item, itemTemplate, offerItemCount, pmcData);
        const requirementsPrice = requirementsValue * (sellInOnePiece ? 1 : offerItemCount);

        const itemTaxMult = globals.config.RagFair.communityItemTax / 100.0;
        const requirementTaxMult = globals.config.RagFair.communityRequirementTax / 100.0;

        let itemPriceMult = Math.log10(itemWorth / requirementsPrice);
        let requirementPriceMult = Math.log10(requirementsPrice / itemWorth);

        if (requirementsPrice >= itemWorth) {
            requirementPriceMult = requirementPriceMult ** 1.08;
        } else {
            itemPriceMult = itemPriceMult ** 1.08;
        }

        itemPriceMult = 4 ** itemPriceMult;
        requirementPriceMult = 4 ** requirementPriceMult;

        const hideoutFleaTaxDiscountBonusSum = this.profileHelper.getBonusValueFromProfile(
            pmcData,
            BonusType.RAGFAIR_COMMISSION,
        );
        // A negative bonus implies a lower discount, since we subtract later, invert the value here
        const taxDiscountPercent = -(hideoutFleaTaxDiscountBonusSum / 100.0);

        const tax =
            itemWorth * itemTaxMult * itemPriceMult + requirementsPrice * requirementTaxMult * requirementPriceMult;
        const discountedTax = tax * (1.0 - taxDiscountPercent);
        const itemComissionMult = itemTemplate._props.RagFairCommissionModifier
            ? itemTemplate._props.RagFairCommissionModifier
            : 1;

        // if (item.upd.Buff)
        // {
        // TODO: enhance tax calc with client implementation from GClass1932/CalculateTaxPrice()
        // }

        const taxValue = Math.round(discountedTax * itemComissionMult);
        this.logger.debug(`Tax Calculated to be: ${taxValue}`);

        return taxValue;
    }

    // This method is trying to replicate the item worth calculation method found in the client code.
    // Any inefficiencies or style issues are intentional and should not be fixed, to preserve the client-side code mirroring.
    protected calculateItemWorth(
        item: IItem,
        itemTemplate: ITemplateItem,
        itemCount: number,
        pmcData: IPmcData,
        isRootItem = true,
    ): number {
        let worth = this.ragfairPriceService.getFleaPriceForItem(item._tpl);

        // In client, all item slots are traversed and any items contained within have their values added
        if (isRootItem) {
            // Since we get a flat list of all child items, we only want to recurse from parent item
            const itemChildren = this.itemHelper.findAndReturnChildrenAsItems(pmcData.Inventory.items, item._id);
            if (itemChildren.length > 1) {
                const itemChildrenClone = this.cloner.clone(itemChildren); // Clone is expensive, only run if necessary
                for (const child of itemChildrenClone) {
                    if (child._id === item._id) {
                        continue;
                    }

                    if (!child.upd) {
                        child.upd = {};
                    }

                    worth += this.calculateItemWorth(
                        child,
                        this.itemHelper.getItem(child._tpl)[1],
                        child.upd.StackObjectsCount ?? 1,
                        pmcData,
                        false,
                    );
                }
            }
        }

        const upd = item.upd ?? {};

        if (upd.Dogtag) {
            worth *= upd.Dogtag.Level;
        }
        if (upd.Key && (itemTemplate._props?.MaximumNumberOfUsage ?? 0) > 0) {
            worth =
                (worth / (itemTemplate._props?.MaximumNumberOfUsage ?? 1)) *
                ((itemTemplate._props?.MaximumNumberOfUsage ?? 1) - upd.Key.NumberOfUsages);
        }
        if (upd.Resource && (itemTemplate._props?.MaxResource ?? 0) > 0) {
            worth = worth * 0.1 + ((worth * 0.9) / (itemTemplate._props?.MaxResource ?? 1)) * upd.Resource.Value;
        }
        if (upd.SideEffect && (itemTemplate._props?.MaxResource ?? 0) > 0) {
            worth = worth * 0.1 + ((worth * 0.9) / (itemTemplate._props?.MaxResource ?? 1)) * upd.SideEffect.Value;
        }
        if (upd.MedKit && (itemTemplate._props?.MaxHpResource ?? 0) > 0) {
            worth = (worth / (itemTemplate._props?.MaxHpResource ?? 1)) * upd.MedKit.HpResource;
        }
        if (upd.FoodDrink && (itemTemplate._props?.MaxResource ?? 0) > 0) {
            worth = (worth / (itemTemplate._props?.MaxResource ?? 1)) * upd.FoodDrink.HpPercent;
        }
        if (upd.Repairable && Number(itemTemplate._props?.armorClass ?? 0) > 0) {
            const num2 = 0.01 * 0.0 ** upd.Repairable.MaxDurability;
            worth =
                worth * (upd.Repairable.MaxDurability / (itemTemplate._props?.Durability ?? 1) - num2) -
                Math.floor(
                    (itemTemplate._props?.RepairCost ?? 0) * (upd.Repairable.MaxDurability - upd.Repairable.Durability),
                );
        }

        return worth * itemCount;
    }
}
