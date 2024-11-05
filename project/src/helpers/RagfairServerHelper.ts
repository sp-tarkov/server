import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { MessageType } from "@spt/models/enums/MessageType";
import { Traders } from "@spt/models/enums/Traders";
import { IQuestConfig } from "@spt/models/spt/config/IQuestConfig";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { ItemFilterService } from "@spt/services/ItemFilterService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

/**
 * Helper class for common ragfair server actions
 */
@injectable()
export class RagfairServerHelper {
    protected ragfairConfig: IRagfairConfig;
    protected questConfig: IQuestConfig;
    protected static goodsReturnedTemplate = "5bdabfe486f7743e1665df6e 0"; // Your item was not sold

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
    }

    /**
     * Is item valid / on blacklist / quest item
     * @param itemDetails
     * @returns boolean
     */
    public isItemValidRagfairItem(itemDetails: [boolean, ITemplateItem]): boolean {
        const blacklistConfig = this.ragfairConfig.dynamic.blacklist;

        // Skip invalid items
        if (!itemDetails[0]) {
            return false;
        }

        if (!this.itemHelper.isValidItem(itemDetails[1]._id)) {
            return false;
        }

        // Skip bsg blacklisted items
        if (blacklistConfig.enableBsgList && !itemDetails[1]._props.CanSellOnRagfair) {
            return false;
        }

        // Skip custom blacklisted items and flag as unsellable by players
        if (this.isItemOnCustomFleaBlacklist(itemDetails[1]._id)) {
            itemDetails[1]._props.CanSellOnRagfair = false;

            return false;
        }

        // Skip custom category blacklisted items
        if (
            blacklistConfig.enableCustomItemCategoryList &&
            this.isItemCategoryOnCustomFleaBlacklist(itemDetails[1]._parent)
        ) {
            return false;
        }

        // Skip quest items
        if (blacklistConfig.enableQuestList && this.itemHelper.isQuestItem(itemDetails[1]._id)) {
            return false;
        }

        // Don't include damaged ammo packs
        if (
            this.ragfairConfig.dynamic.blacklist.damagedAmmoPacks &&
            itemDetails[1]._parent === BaseClasses.AMMO_BOX &&
            itemDetails[1]._name.includes("_damaged")
        ) {
            return false;
        }

        return true;
    }

    /**
     * Is supplied item tpl on the ragfair custom blacklist from configs/ragfair.json/dynamic
     * @param itemTemplateId Item tpl to check is blacklisted
     * @returns True if its blacklsited
     */
    protected isItemOnCustomFleaBlacklist(itemTemplateId: string): boolean {
        return this.ragfairConfig.dynamic.blacklist.custom.includes(itemTemplateId);
    }

    /**
     * Is supplied parent id on the ragfair custom item category blacklist
     * @param parentId Parent Id to check is blacklisted
     * @returns true if blacklisted
     */
    protected isItemCategoryOnCustomFleaBlacklist(itemParentId: string): boolean {
        return this.ragfairConfig.dynamic.blacklist.customItemCategoryList.includes(itemParentId);
    }

    /**
     * is supplied id a trader
     * @param traderId
     * @returns True if id was a trader
     */
    public isTrader(traderId: string): boolean {
        return traderId in this.databaseService.getTraders();
    }

    /**
     * Send items back to player
     * @param sessionID Player to send items to
     * @param returnedItems Items to send to player
     */
    public returnItems(sessionID: string, returnedItems: IItem[]): void {
        this.mailSendService.sendLocalisedNpcMessageToPlayer(
            sessionID,
            this.traderHelper.getTraderById(Traders.RAGMAN),
            MessageType.MESSAGE_WITH_ITEMS,
            RagfairServerHelper.goodsReturnedTemplate,
            returnedItems,
            this.timeUtil.getHoursAsSeconds(
                this.databaseService.getGlobals().config.RagFair.yourOfferDidNotSellMaxStorageTimeInHour,
            ),
        );
    }

    public calculateDynamicStackCount(tplId: string, isWeaponPreset: boolean): number {
        const config = this.ragfairConfig.dynamic;

        // Lookup item details - check if item not found
        const itemDetails = this.itemHelper.getItem(tplId);
        if (!itemDetails[0]) {
            throw new Error(
                this.localisationService.getText(
                    "ragfair-item_not_in_db_unable_to_generate_dynamic_stack_count",
                    tplId,
                ),
            );
        }

        // Item Types to return one of
        if (
            isWeaponPreset ||
            this.itemHelper.isOfBaseclasses(itemDetails[1]._id, this.ragfairConfig.dynamic.showAsSingleStack)
        ) {
            return 1;
        }

        // Get max stack count
        const maxStackCount = itemDetails[1]._props.StackMaxSize;

        // non-stackable - use different values to calculate stack size
        if (!maxStackCount || maxStackCount === 1) {
            return Math.round(this.randomUtil.getInt(config.nonStackableCount.min, config.nonStackableCount.max));
        }

        const stackPercent = Math.round(
            this.randomUtil.getInt(config.stackablePercent.min, config.stackablePercent.max),
        );

        return Math.round((maxStackCount / 100) * stackPercent);
    }

    /**
     * Choose a currency at random with bias
     * @returns currency tpl
     */
    public getDynamicOfferCurrency(): string {
        const currencies = this.ragfairConfig.dynamic.currencies;
        const bias: string[] = [];

        for (const item in currencies) {
            for (let i = 0; i < currencies[item]; i++) {
                bias.push(item);
            }
        }

        return bias[Math.floor(Math.random() * bias.length)];
    }

    /**
     * Given a preset id from globals.json, return an array of items[] with unique ids
     * @param item Preset item
     * @returns Array of weapon and its children
     */
    public getPresetItems(item: IItem): IItem[] {
        const preset = this.cloner.clone(this.databaseService.getGlobals().ItemPresets[item._id]._items);
        return this.itemHelper.reparentItemAndChildren(item, preset);
    }

    /**
     * Possible bug, returns all items associated with an items tpl, could be multiple presets from globals.json
     * @param item Preset item
     * @returns
     */
    public getPresetItemsByTpl(item: IItem): IItem[] {
        const presets = [];
        for (const itemId in this.databaseService.getGlobals().ItemPresets) {
            if (this.databaseService.getGlobals().ItemPresets[itemId]._items[0]._tpl === item._tpl) {
                const presetItems = this.cloner.clone(this.databaseService.getGlobals().ItemPresets[itemId]._items);
                presets.push(this.itemHelper.reparentItemAndChildren(item, presetItems));
            }
        }

        return presets;
    }
}
