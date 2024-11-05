import { error } from "node:console";
import { HandbookHelper } from "@spt/helpers/HandbookHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { BanType } from "@spt/models/eft/common/tables/IBotBase";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IProfileTraderTemplate } from "@spt/models/eft/common/tables/IProfileTemplate";
import { ITraderAssort, ITraderBase, ITraderLoyaltyLevel } from "@spt/models/eft/common/tables/ITrader";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { GameEditions } from "@spt/models/enums/GameEditions";
import { Money } from "@spt/models/enums/Money";
import { Traders } from "@spt/models/enums/Traders";
import { ITraderConfig } from "@spt/models/spt/config/ITraderConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { FenceService } from "@spt/services/FenceService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { PlayerService } from "@spt/services/PlayerService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class TraderHelper {
    protected traderConfig: ITraderConfig;
    /** Dictionary of item tpl and the highest trader sell rouble price */
    protected highestTraderPriceItems?: Record<string, number> = undefined;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PlayerService") protected playerService: PlayerService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
    }

    /**
     * Get a trader base object, update profile to reflect players current standing in profile
     * when trader not found in profile
     * @param traderID Traders Id to get
     * @param sessionID Players id
     * @returns Trader base
     */
    public getTrader(traderID: string, sessionID: string): ITraderBase | any {
        if (traderID === "ragfair") {
            return {
                currency: "RUB",
            };
        }

        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        if (!pmcData) {
            throw new error(this.localisationService.getText("trader-unable_to_find_profile_with_id", sessionID));
        }

        // Profile has traderInfo dict (profile beyond creation stage) but no requested trader in profile
        if (pmcData.TradersInfo && !(traderID in pmcData.TradersInfo)) {
            // Add trader values to profile
            this.resetTrader(sessionID, traderID);
            this.lvlUp(traderID, pmcData);
        }

        const traderBase = this.databaseService.getTrader(traderID).base;
        if (!traderBase) {
            this.logger.error(this.localisationService.getText("trader-unable_to_find_trader_by_id", traderID));
        }

        return traderBase;
    }

    /**
     * Get all assort data for a particular trader
     * @param traderId Trader to get assorts for
     * @returns ITraderAssort
     */
    public getTraderAssortsByTraderId(traderId: string): ITraderAssort {
        return traderId === Traders.FENCE
            ? this.fenceService.getRawFenceAssorts()
            : this.databaseService.getTrader(traderId).assort;
    }

    /**
     * Retrieve the Item from a traders assort data by its id
     * @param traderId Trader to get assorts for
     * @param assortId Id of assort to find
     * @returns Item object
     */
    public getTraderAssortItemByAssortId(traderId: string, assortId: string): IItem | undefined {
        const traderAssorts = this.getTraderAssortsByTraderId(traderId);
        if (!traderAssorts) {
            this.logger.debug(`No assorts on trader: ${traderId} found`);

            return undefined;
        }

        // Find specific assort in traders data
        const purchasedAssort = traderAssorts.items.find((item) => item._id === assortId);
        if (!purchasedAssort) {
            this.logger.debug(`No assort ${assortId} on trader: ${traderId} found`);

            return undefined;
        }

        return purchasedAssort;
    }

    /**
     * Reset a profiles trader data back to its initial state as seen by a level 1 player
     * Does NOT take into account different profile levels
     * @param sessionID session id of player
     * @param traderID trader id to reset
     */
    public resetTrader(sessionID: string, traderID: string): void {
        const profiles = this.databaseService.getProfiles();
        const trader = this.databaseService.getTrader(traderID);

        const fullProfile = this.profileHelper.getFullProfile(sessionID);
        if (!fullProfile) {
            throw new error(this.localisationService.getText("trader-unable_to_find_profile_by_id", sessionID));
        }

        const pmcData = fullProfile.characters.pmc;
        const rawProfileTemplate: IProfileTraderTemplate =
            profiles[fullProfile.info.edition][pmcData.Info.Side.toLowerCase()].trader;

        pmcData.TradersInfo[traderID] = {
            disabled: false,
            loyaltyLevel: rawProfileTemplate.initialLoyaltyLevel[traderID] ?? 1,
            salesSum: rawProfileTemplate.initialSalesSum,
            standing: this.getStartingStanding(traderID, rawProfileTemplate),
            nextResupply: trader.base.nextResupply,
            unlocked: trader.base.unlockedByDefault,
        };

        // Check if trader should be locked by default
        if (rawProfileTemplate.lockedByDefaultOverride?.includes(traderID)) {
            pmcData.TradersInfo[traderID].unlocked = true;
        }

        if (rawProfileTemplate.purchaseAllClothingByDefaultForTrader?.includes(traderID)) {
            // Get traders clothing
            const clothing = this.databaseService.getTrader(traderID).suits;
            if (clothing?.length > 0) {
                // Force suit ids into profile
                this.addSuitsToProfile(
                    fullProfile,
                    clothing.map((suit) => suit.suiteId),
                );
            }
        }

        if ((rawProfileTemplate.fleaBlockedDays ?? 0) > 0) {
            const newBanDateTime = this.timeUtil.getTimeStampFromNowDays(rawProfileTemplate.fleaBlockedDays);
            const existingBan = pmcData.Info.Bans.find((ban) => ban.banType === BanType.RAGFAIR);
            if (existingBan) {
                existingBan.dateTime = newBanDateTime;
            } else {
                pmcData.Info.Bans.push({
                    banType: BanType.RAGFAIR,
                    dateTime: newBanDateTime,
                });
            }
        }

        if (traderID === Traders.JAEGER) {
            pmcData.TradersInfo[traderID].unlocked = rawProfileTemplate.jaegerUnlocked;
        }
    }

    /**
     * Get the starting standing of a trader based on the current profiles type (e.g. EoD, Standard etc)
     * @param traderId Trader id to get standing for
     * @param rawProfileTemplate Raw profile from profiles.json to look up standing from
     * @returns Standing value
     */
    protected getStartingStanding(traderId: string, rawProfileTemplate: IProfileTraderTemplate): number {
        const initialStanding =
            rawProfileTemplate.initialStanding[traderId] ?? rawProfileTemplate.initialStanding.default;
        // Edge case for Lightkeeper, 0 standing means seeing `Make Amends - Buyout` quest
        if (traderId === Traders.LIGHTHOUSEKEEPER && initialStanding === 0) {
            return 0.01;
        }

        return initialStanding;
    }

    /**
     * Add an array of suit ids to a profiles suit array, no duplicates
     * @param fullProfile Profile to add to
     * @param suitIds Suit Ids to add
     */
    protected addSuitsToProfile(fullProfile: ISptProfile, suitIds: string[]): void {
        if (!fullProfile.suits) {
            fullProfile.suits = [];
        }

        for (const suitId of suitIds) {
            // Don't add dupes
            if (!fullProfile.suits.includes(suitId)) {
                fullProfile.suits.push(suitId);
            }
        }
    }

    /**
     * Alter a traders unlocked status
     * @param traderId Trader to alter
     * @param status New status to use
     * @param sessionId Session id of player
     */
    public setTraderUnlockedState(traderId: string, status: boolean, sessionId: string): void {
        const pmcData = this.profileHelper.getPmcProfile(sessionId);
        const profileTraderData = pmcData.TradersInfo[traderId];
        if (!profileTraderData) {
            this.logger.error(
                `Unable to set trader ${traderId} unlocked state to: ${status} as trader cannot be found in profile`,
            );

            return;
        }

        profileTraderData.unlocked = status;
    }

    /**
     * Add standing to a trader and level them up if exp goes over level threshold
     * @param sessionId Session id of player
     * @param traderId Traders id to add standing to
     * @param standingToAdd Standing value to add to trader
     */
    public addStandingToTrader(sessionId: string, traderId: string, standingToAdd: number): void {
        const fullProfile = this.profileHelper.getFullProfile(sessionId);
        const pmcTraderInfo = fullProfile.characters.pmc.TradersInfo[traderId];

        // Add standing to trader
        pmcTraderInfo.standing = this.addStandingValuesTogether(pmcTraderInfo.standing, standingToAdd);

        if (traderId === Traders.FENCE) {
            // Must add rep to scav profile to ensure consistency
            fullProfile.characters.scav.TradersInfo[traderId].standing = pmcTraderInfo.standing;
        }

        this.lvlUp(traderId, fullProfile.characters.pmc);
    }

    /**
     * Add standing to current standing and clamp value if it goes too low
     * @param currentStanding current trader standing
     * @param standingToAdd stansding to add to trader standing
     * @returns current standing + added standing (clamped if needed)
     */
    protected addStandingValuesTogether(currentStanding: number, standingToAdd: number): number {
        const newStanding = currentStanding + standingToAdd;

        // Never let standing fall below 0
        return newStanding < 0 ? 0 : newStanding;
    }

    /**
     * iterate over a profiles traders and ensure they have the correct loyaltyLevel for the player
     * @param sessionId Profile to check
     */
    public validateTraderStandingsAndPlayerLevelForProfile(sessionId: string): void {
        const profile = this.profileHelper.getPmcProfile(sessionId);
        const traders = Object.keys(this.databaseService.getTraders());
        for (const trader of traders) {
            this.lvlUp(trader, profile);
        }
    }

    /**
     * Calculate traders level based on exp amount and increments level if over threshold
     * Also validates and updates player level if not correct based on XP value
     * @param traderID Trader to check standing of
     * @param pmcData Profile to update trader in
     */
    public lvlUp(traderID: string, pmcData: IPmcData): void {
        const loyaltyLevels = this.databaseService.getTrader(traderID).base.loyaltyLevels;

        // Level up player
        pmcData.Info.Level = this.playerService.calculateLevel(pmcData);

        // Level up traders
        let targetLevel = 0;

        // Round standing to 2 decimal places to address floating point inaccuracies
        pmcData.TradersInfo[traderID].standing = Math.round(pmcData.TradersInfo[traderID].standing * 100) / 100;

        for (const level in loyaltyLevels) {
            const loyalty = loyaltyLevels[level];

            if (
                loyalty.minLevel <= pmcData.Info.Level &&
                loyalty.minSalesSum <= pmcData.TradersInfo[traderID].salesSum &&
                loyalty.minStanding <= pmcData.TradersInfo[traderID].standing &&
                targetLevel < 4
            ) {
                // level reached
                targetLevel++;
            }
        }

        // set level
        pmcData.TradersInfo[traderID].loyaltyLevel = targetLevel;
    }

    /**
     * Get the next update timestamp for a trader
     * @param traderID Trader to look up update value for
     * @returns future timestamp
     */
    public getNextUpdateTimestamp(traderID: string): number {
        const time = this.timeUtil.getTimestamp();
        const updateSeconds = this.getTraderUpdateSeconds(traderID) ?? 0;
        return time + updateSeconds;
    }

    /**
     * Get the reset time between trader assort refreshes in seconds
     * @param traderId Trader to look up
     * @returns Time in seconds
     */
    public getTraderUpdateSeconds(traderId: string): number | undefined {
        const traderDetails = this.traderConfig.updateTime.find((x) => x.traderId === traderId);
        if (!traderDetails || traderDetails.seconds.min === undefined || traderDetails.seconds.max === undefined) {
            this.logger.warning(
                this.localisationService.getText("trader-missing_trader_details_using_default_refresh_time", {
                    traderId: traderId,
                    updateTime: this.traderConfig.updateTimeDefault,
                }),
            );

            this.traderConfig.updateTime.push(
                // create temporary entry to prevent logger spam
                {
                    traderId: traderId,
                    seconds: { min: this.traderConfig.updateTimeDefault, max: this.traderConfig.updateTimeDefault },
                },
            );
            return undefined;
        }

        return this.randomUtil.getInt(traderDetails.seconds.min, traderDetails.seconds.max);
    }

    public getLoyaltyLevel(traderID: string, pmcData: IPmcData): ITraderLoyaltyLevel {
        const traderBase = this.databaseService.getTrader(traderID).base;
        let loyaltyLevel = pmcData.TradersInfo[traderID].loyaltyLevel;

        if (!loyaltyLevel || loyaltyLevel < 1) {
            loyaltyLevel = 1;
        }

        if (loyaltyLevel > traderBase.loyaltyLevels.length) {
            loyaltyLevel = traderBase.loyaltyLevels.length;
        }

        return traderBase.loyaltyLevels[loyaltyLevel - 1];
    }

    /**
     * Store the purchase of an assort from a trader in the player profile
     * @param sessionID Session id
     * @param newPurchaseDetails New item assort id + count
     */
    public addTraderPurchasesToPlayerProfile(
        sessionID: string,
        newPurchaseDetails: { items: { itemId: string; count: number }[]; traderId: string },
        itemPurchased: IItem,
    ): void {
        const profile = this.profileHelper.getFullProfile(sessionID);
        const traderId = newPurchaseDetails.traderId;

        // Iterate over assorts bought and add to profile
        for (const purchasedItem of newPurchaseDetails.items) {
            const currentTime = this.timeUtil.getTimestamp();

            // Nullguard traderPurchases
            profile.traderPurchases ||= {};
            // Nullguard traderPurchases for this trader
            profile.traderPurchases[traderId] ||= {};

            // Null guard when dict doesnt exist

            if (!profile.traderPurchases[traderId][purchasedItem.itemId]) {
                profile.traderPurchases[traderId][purchasedItem.itemId] = {
                    count: purchasedItem.count,
                    purchaseTimestamp: currentTime,
                };

                continue;
            }

            if (
                profile.traderPurchases[traderId][purchasedItem.itemId].count + purchasedItem.count >
                this.getAccountTypeAdjustedTraderPurchaseLimit(
                    itemPurchased.upd.BuyRestrictionMax,
                    profile.characters.pmc.Info.GameVersion,
                )
            ) {
                throw new Error(
                    this.localisationService.getText("trader-unable_to_purchase_item_limit_reached", {
                        traderId: traderId,
                        limit: itemPurchased.upd.BuyRestrictionMax,
                    }),
                );
            }
            profile.traderPurchases[traderId][purchasedItem.itemId].count += purchasedItem.count;
            profile.traderPurchases[traderId][purchasedItem.itemId].purchaseTimestamp = currentTime;
        }
    }

    /**
     * EoD and Unheard get a 20% bonus to personal trader limit purchases
     * @param buyRestrictionMax Existing value from trader item
     * @param gameVersion Profiles game version
     * @returns buyRestrictionMax value
     */
    public getAccountTypeAdjustedTraderPurchaseLimit(buyRestrictionMax: number, gameVersion: string): number {
        if (([GameEditions.EDGE_OF_DARKNESS, GameEditions.UNHEARD] as string[]).includes(gameVersion)) {
            return Math.floor(buyRestrictionMax * 1.2);
        }

        return buyRestrictionMax;
    }

    /**
     * Get the highest rouble price for an item from traders
     * UNUSED
     * @param tpl Item to look up highest pride for
     * @returns highest rouble cost for item
     */
    public getHighestTraderPriceRouble(tpl: string): number {
        if (this.highestTraderPriceItems) {
            return this.highestTraderPriceItems[tpl];
        }

        if (!this.highestTraderPriceItems) {
            this.highestTraderPriceItems = {};
        }

        // Init dict and fill
        for (const traderName in Traders) {
            // Skip some traders
            if (traderName === Traders.FENCE) {
                continue;
            }

            // Get assorts for trader, skip trader if no assorts found
            const traderAssorts = this.databaseService.getTrader(Traders[traderName]).assort;
            if (!traderAssorts) {
                continue;
            }

            // Get all item assorts that have parentid of hideout (base item and not a mod of other item)
            for (const item of traderAssorts.items.filter((x) => x.parentId === "hideout")) {
                // Get barter scheme (contains cost of item)
                const barterScheme = traderAssorts.barter_scheme[item._id][0][0];

                // Convert into roubles
                const roubleAmount =
                    barterScheme._tpl === Money.ROUBLES
                        ? barterScheme.count
                        : this.handbookHelper.inRUB(barterScheme.count, barterScheme._tpl);

                // Existing price smaller in dict than current iteration, overwrite
                if (this.highestTraderPriceItems[item._tpl] ?? 0 < roubleAmount) {
                    this.highestTraderPriceItems[item._tpl] = roubleAmount;
                }
            }
        }

        return this.highestTraderPriceItems[tpl];
    }

    /**
     * Get the highest price item can be sold to trader for (roubles)
     * @param tpl Item to look up best trader sell-to price
     * @returns Rouble price
     */
    public getHighestSellToTraderPrice(tpl: string): number {
        // Find highest trader price for item
        let highestPrice = 1; // Default price
        for (const traderName in Traders) {
            // Get trader and check buy category allows tpl
            const traderBase = this.databaseService.getTrader(Traders[traderName]).base;

            // Skip traders that dont sell
            if (!traderBase || !this.itemHelper.isOfBaseclasses(tpl, traderBase.items_buy.category)) {
                continue;
            }

            // Get loyalty level details player has achieved with this trader
            // Uses lowest loyalty level as this function is used before a player has logged into server
            // We have no idea what player loyalty is with traders
            const traderBuyBackPricePercent = traderBase.loyaltyLevels[0].buy_price_coef;

            const itemHandbookPrice = this.handbookHelper.getTemplatePrice(tpl);
            const priceTraderBuysItemAt = Math.round(
                this.randomUtil.getPercentOfValue(traderBuyBackPricePercent, itemHandbookPrice),
            );

            // Price from this trader is higher than highest found, update
            if (priceTraderBuysItemAt > highestPrice) {
                highestPrice = priceTraderBuysItemAt;
            }
        }

        return highestPrice;
    }

    /**
     * Get a trader enum key by its value
     * @param traderId Traders id
     * @returns Traders key
     */
    public getTraderById(traderId: string): Traders | undefined {
        const keys = Object.keys(Traders).filter((x) => Traders[x] === traderId);

        if (keys.length === 0) {
            this.logger.error(this.localisationService.getText("trader-unable_to_find_trader_in_enum", traderId));

            return undefined;
        }

        return keys[0] as Traders;
    }

    /**
     * Validates that the provided traderEnumValue exists in the Traders enum. If the value is valid, it returns the
     * same enum value, effectively serving as a trader ID; otherwise, it logs an error and returns an empty string.
     * This method provides a runtime check to prevent undefined behavior when using the enum as a dictionary key.
     *
     * For example, instead of this:
     * `const traderId = Traders[Traders.PRAPOR];`
     *
     * You can use safely use this:
     * `const traderId = this.traderHelper.getValidTraderIdByEnumValue(Traders.PRAPOR);`
     *
     * @param traderEnumValue The trader enum value to validate
     * @returns The validated trader enum value as a string, or an empty string if invalid
     */
    public getValidTraderIdByEnumValue(traderEnumValue: Traders): string {
        if (!this.traderEnumHasKey(traderEnumValue)) {
            this.logger.error(
                this.localisationService.getText("trader-unable_to_find_trader_in_enum", traderEnumValue),
            );

            return "";
        }

        return Traders[traderEnumValue];
    }

    /**
     * Does the 'Traders' enum has a value that matches the passed in parameter
     * @param key Value to check for
     * @returns True, values exists in Traders enum as a value
     */
    public traderEnumHasKey(key: string): boolean {
        return Object.keys(Traders).some((x) => x === key);
    }

    /**
     * Accepts a trader id
     * @param traderId Trader id
     * @returns Ttrue if Traders enum has the param as a value
     */
    public traderEnumHasValue(traderId: string): boolean {
        return Object.values(Traders).some((x) => x === traderId);
    }
}
