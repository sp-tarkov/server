import { HandbookHelper } from "@spt/helpers/HandbookHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { TraderAssortHelper } from "@spt/helpers/TraderAssortHelper";
import { UtilityHelper } from "@spt/helpers/UtilityHelper";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ITraderAssort } from "@spt/models/eft/common/tables/ITrader";
import { ISearchRequestData } from "@spt/models/eft/ragfair/ISearchRequestData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { Money } from "@spt/models/enums/Money";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { RagfairLinkedItemService } from "@spt/services/RagfairLinkedItemService";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class RagfairHelper {
    protected ragfairConfig: IRagfairConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("TraderAssortHelper") protected traderAssortHelper: TraderAssortHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("RagfairLinkedItemService") protected ragfairLinkedItemService: RagfairLinkedItemService,
        @inject("UtilityHelper") protected utilityHelper: UtilityHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
    }

    /**
     * Gets currency TAG from TPL
     * @param {string} currency
     * @returns string
     */
    public getCurrencyTag(currency: string): string {
        switch (currency) {
            case Money.EUROS:
                return "EUR";

            case Money.DOLLARS:
                return "USD";

            case Money.ROUBLES:
                return "RUB";
            case Money.GP:
                return "GP";
            default:
                return "";
        }
    }

    public filterCategories(sessionID: string, request: ISearchRequestData): string[] {
        let result: string[] = [];

        // Case: weapon builds
        if (request.buildCount) {
            return Object.keys(request.buildItems);
        }

        // Case: search
        if (request.linkedSearchId) {
            const data = this.ragfairLinkedItemService.getLinkedItems(request.linkedSearchId);
            result = !data ? [] : [...data];
        }

        // Case: category
        if (request.handbookId) {
            const handbook = this.getCategoryList(request.handbookId);

            if (result.length) {
                result = this.utilityHelper.arrayIntersect(result, handbook);
            } else {
                result = handbook;
            }
        }

        return result;
    }

    public getDisplayableAssorts(sessionID: string): Record<string, ITraderAssort> {
        const result: Record<string, ITraderAssort> = {};

        for (const traderID in this.databaseService.getTraders()) {
            if (this.ragfairConfig.traders[traderID]) {
                result[traderID] = this.traderAssortHelper.getAssort(sessionID, traderID, true);
            }
        }

        return result;
    }

    protected getCategoryList(handbookId: string): string[] {
        let result: string[] = [];

        // if its "mods" great-parent category, do double recursive loop
        if (handbookId === "5b5f71a686f77447ed5636ab") {
            for (const categ of this.handbookHelper.childrenCategories(handbookId)) {
                for (const subcateg of this.handbookHelper.childrenCategories(categ)) {
                    result = [...result, ...this.handbookHelper.templatesWithParent(subcateg)];
                }
            }

            return result;
        }

        // item is in any other category
        if (this.handbookHelper.isCategory(handbookId)) {
            // list all item of the category
            result = this.handbookHelper.templatesWithParent(handbookId);

            for (const categ of this.handbookHelper.childrenCategories(handbookId)) {
                result = [...result, ...this.handbookHelper.templatesWithParent(categ)];
            }

            return result;
        }

        // its a specific item searched
        result.push(handbookId);
        return result;
    }

    /**
     * Iterate over array of identical items and merge stack count
     * Ragfair allows abnormally large stacks.
     */
    public mergeStackable(items: IItem[]): IItem[] {
        const list = [];
        let rootItem = undefined;

        for (let item of items) {
            item = this.itemHelper.fixItemStackCount(item);

            const isChild = items.some((it) => it._id === item.parentId);
            if (!isChild) {
                if (!rootItem) {
                    rootItem = this.cloner.clone(item);
                    rootItem.upd.OriginalStackObjectsCount = rootItem.upd.StackObjectsCount;
                } else {
                    rootItem.upd.StackObjectsCount += item.upd.StackObjectsCount;
                    list.push(item);
                }
            } else {
                list.push(item);
            }
        }

        return [...[rootItem], ...list];
    }

    /**
     * Return the symbol for a currency
     * e.g. 5449016a4bdc2d6f028b456f return ₽
     * @param currencyTpl currency to get symbol for
     * @returns symbol of currency
     */
    public getCurrencySymbol(currencyTpl: string): string {
        switch (currencyTpl) {
            case Money.EUROS:
                return "€";
            case Money.DOLLARS:
                return "$";
            default: // Money.ROUBLES
                return "₽";
        }
    }
}
