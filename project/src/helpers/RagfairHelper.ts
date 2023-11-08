import { inject, injectable } from "tsyringe";

import { HandbookHelper } from "@spt-aki/helpers/HandbookHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { TraderAssortHelper } from "@spt-aki/helpers/TraderAssortHelper";
import { UtilityHelper } from "@spt-aki/helpers/UtilityHelper";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { ITraderAssort } from "@spt-aki/models/eft/common/tables/ITrader";
import { IGetOffersResult } from "@spt-aki/models/eft/ragfair/IGetOffersResult";
import { ISearchRequestData } from "@spt-aki/models/eft/ragfair/ISearchRequestData";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { Money } from "@spt-aki/models/enums/Money";
import { IRagfairConfig } from "@spt-aki/models/spt/config/IRagfairConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { RagfairLinkedItemService } from "@spt-aki/services/RagfairLinkedItemService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";

@injectable()
export class RagfairHelper {
    protected ragfairConfig: IRagfairConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("TraderAssortHelper") protected traderAssortHelper: TraderAssortHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("RagfairLinkedItemService") protected ragfairLinkedItemService: RagfairLinkedItemService,
        @inject("UtilityHelper") protected utilityHelper: UtilityHelper,
        @inject("ConfigServer") protected configServer: ConfigServer
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
            case "569668774bdc2da2298b4568":
                return "EUR";

            case "5696686a4bdc2da3298b456a":
                return "USD";

            case "5449016a4bdc2d6f028b456f":
                return "RUB";

            default:
                return "";
        }
    }

    public filterCategories(sessionID: string, info: ISearchRequestData): string[] {
        let result: string[] = [];

        // Case: weapon builds
        if (info.buildCount) {
            return Object.keys(info.buildItems);
        }

        // Case: search
        if (info.linkedSearchId) {
            const data = this.ragfairLinkedItemService.getLinkedItems(info.linkedSearchId);
            result = !data ? [] : [...data];
        }

        // Case: category
        if (info.handbookId) {
            const handbook = this.getCategoryList(info.handbookId);

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

        for (const traderID in this.databaseServer.getTables().traders) {
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

    /* Because of presets, categories are not always 1 */
    public countCategories(result: IGetOffersResult): void {
        const categories = {};

        for (const offer of result.offers) {
            // only the first item can have presets
            const item = offer.items[0];
            categories[item._tpl] = categories[item._tpl] || 0;
            categories[item._tpl]++;
        }

        // not in search mode, add back non-weapon items
        for (const category in result.categories) {
            if (!categories[category]) {
                categories[category] = 1;
            }
        }

        result.categories = categories;
    }

    /**
     * Merges Root Items
     * Ragfair allows abnormally large stacks.
     */
    public mergeStackable(items: Item[]): Item[] {
        const list = [];
        let rootItem = null;

        for (let item of items) {
            item = this.itemHelper.fixItemStackCount(item);
            const isChild = items.find((it) => it._id === item.parentId);

            if (!isChild) {
                if (!rootItem) {
                    rootItem = this.jsonUtil.clone(item);
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

    public getCurrencySymbol(currencyTpl: string): string {
        switch (currencyTpl) {
            case Money.EUROS:
                return "€";

            case Money.DOLLARS:
                return "$";

            case Money.ROUBLES:
            default:
                return "₽";
        }
    }
}
