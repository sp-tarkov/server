import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ITraderBase } from "@spt/models/eft/common/tables/ITrader";
import { BonusType } from "@spt/models/enums/BonusType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import { MessageType } from "@spt/models/enums/MessageType";
import { IInsuranceConfig } from "@spt/models/spt/config/IInsuranceConfig";
import { IInsuranceEquipmentPkg } from "@spt/models/spt/services/IInsuranceEquipmentPkg";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class InsuranceService {
    protected insured: Record<string, Record<string, IItem[]>> = {};
    protected insuranceConfig: IInsuranceConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.insuranceConfig = this.configServer.getConfig(ConfigTypes.INSURANCE);
    }

    /**
     * Does player have insurance array
     * @param sessionId Player id
     * @returns True if exists
     */
    public isuranceDictionaryExists(sessionId: string): boolean {
        return this.insured[sessionId] !== undefined;
    }

    /**
     * Get all insured items by all traders for a profile
     * @param sessionId Profile id (session id)
     * @returns Item array
     */
    public getInsurance(sessionId: string): Record<string, IItem[]> {
        return this.insured[sessionId];
    }

    public resetInsurance(sessionId: string): void {
        this.insured[sessionId] = {};
    }

    /**
     * Sends `i will go look for your stuff` trader message +
     * Store lost insurance items inside profile for later retreval
     * @param pmcData Profile to send insured items to
     * @param sessionID SessionId of current player
     * @param mapId Id of the location player died/exited that caused the insurance to be issued on
     */
    public startPostRaidInsuranceLostProcess(pmcData: IPmcData, sessionID: string, mapId: string): void {
        // Get insurance items for each trader
        const globals = this.databaseService.getGlobals();
        for (const traderId in this.getInsurance(sessionID)) {
            const traderEnum = this.traderHelper.getTraderById(traderId);
            if (!traderEnum) {
                this.logger.error(this.localisationService.getText("insurance-trader_missing_from_enum", traderId));

                continue;
            }

            const traderBase = this.traderHelper.getTrader(traderId, sessionID);
            if (!traderBase) {
                this.logger.error(this.localisationService.getText("insurance-unable_to_find_trader_by_id", traderId));

                continue;
            }

            const dialogueTemplates = this.databaseService.getTrader(traderId).dialogue;
            if (!dialogueTemplates) {
                this.logger.error(
                    this.localisationService.getText("insurance-trader_lacks_dialogue_property", traderId),
                );

                continue;
            }

            const systemData = {
                date: this.timeUtil.getDateMailFormat(),
                time: this.timeUtil.getTimeMailFormat(),
                location: mapId,
            };

            // Send "i will go look for your stuff" message from trader to player
            this.mailSendService.sendLocalisedNpcMessageToPlayer(
                sessionID,
                traderEnum,
                MessageType.NPC_TRADER,
                this.randomUtil.getArrayValue(dialogueTemplates?.insuranceStart ?? ["INSURANCE START MESSAGE MISSING"]),
                undefined,
                this.timeUtil.getHoursAsSeconds(globals.config.Insurance.MaxStorageTimeInHour),
                systemData,
            );

            // Store insurance to send to player later in profile
            // Store insurance return details in profile + "hey i found your stuff, here you go!" message details to send to player at a later date
            this.saveServer.getProfile(sessionID).insurance.push({
                scheduledTime: this.getInsuranceReturnTimestamp(pmcData, traderBase),
                traderId: traderId,
                maxStorageTime: this.getMaxInsuranceStorageTime(traderBase),
                systemData: systemData,
                messageType: MessageType.INSURANCE_RETURN,
                messageTemplateId: this.randomUtil.getArrayValue(dialogueTemplates.insuranceFound),
                items: this.getInsurance(sessionID)[traderId],
            });
        }

        this.resetInsurance(sessionID);
    }

    /**
     * Get a timestamp of when insurance items should be sent to player based on trader used to insure
     * Apply insurance return bonus if found in profile
     * @param pmcData Player profile
     * @param trader Trader base used to insure items
     * @returns Timestamp to return items to player in seconds
     */
    protected getInsuranceReturnTimestamp(pmcData: IPmcData, trader: ITraderBase): number {
        // If override in config is non-zero, use that instead of trader values
        if (this.insuranceConfig.returnTimeOverrideSeconds > 0) {
            this.logger.debug(
                `Insurance override used: returning in ${this.insuranceConfig.returnTimeOverrideSeconds} seconds`,
            );
            return this.timeUtil.getTimestamp() + this.insuranceConfig.returnTimeOverrideSeconds;
        }

        const insuranceReturnTimeBonusSum = this.profileHelper.getBonusValueFromProfile(
            pmcData,
            BonusType.INSURANCE_RETURN_TIME,
        );

        // A negative bonus implies a faster return, since we subtract later, invert the value here
        const insuranceReturnTimeBonusPercent = -(insuranceReturnTimeBonusSum / 100);

        const traderMinReturnAsSeconds = trader.insurance.min_return_hour * TimeUtil.ONE_HOUR_AS_SECONDS;
        const traderMaxReturnAsSeconds = trader.insurance.max_return_hour * TimeUtil.ONE_HOUR_AS_SECONDS;
        let randomisedReturnTimeSeconds = this.randomUtil.getInt(traderMinReturnAsSeconds, traderMaxReturnAsSeconds);

        // Check for Mark of The Unheard in players special slots (only slot item can fit)
        const globals = this.databaseService.getGlobals();
        const hasMarkOfUnheard = this.itemHelper.hasItemWithTpl(
            pmcData.Inventory.items,
            ItemTpl.MARKOFUNKNOWN_MARK_OF_THE_UNHEARD,
            "SpecialSlot",
        );
        if (hasMarkOfUnheard) {
            // Reduce return time by globals multipler value
            randomisedReturnTimeSeconds *= globals.config.Insurance.CoefOfHavingMarkOfUnknown;
        }

        // EoD has 30% faster returns
        const editionModifier = globals.config.Insurance.EditionSendingMessageTime[pmcData.Info.GameVersion];
        if (editionModifier) {
            randomisedReturnTimeSeconds *= editionModifier.multiplier;
        }

        // Calculate the final return time based on our bonus percent
        const finalReturnTimeSeconds = randomisedReturnTimeSeconds * (1.0 - insuranceReturnTimeBonusPercent);
        return this.timeUtil.getTimestamp() + finalReturnTimeSeconds;
    }

    protected getMaxInsuranceStorageTime(traderBase: ITraderBase): number {
        if (this.insuranceConfig.storageTimeOverrideSeconds > 0) {
            // Override exists, use instead of traders value
            return this.insuranceConfig.storageTimeOverrideSeconds;
        }

        return this.timeUtil.getHoursAsSeconds(traderBase.insurance.max_storage_time);
    }

    /**
     * Store lost gear post-raid inside profile, ready for later code to pick it up and mail it
     * @param equipmentPkg Gear to store - generated by getGearLostInRaid()
     */
    public storeGearLostInRaidToSendLater(sessionID: string, equipmentPkg: IInsuranceEquipmentPkg[]): void {
        // Process all insured items lost in-raid
        for (const gear of equipmentPkg) {
            this.addGearToSend(gear);
        }
    }

    /**
     * For the passed in items, find the trader it was insured against
     * @param sessionId Session id
     * @param lostInsuredItems Insured items lost in a raid
     * @param pmcProfile Player profile
     * @returns IInsuranceEquipmentPkg array
     */
    public mapInsuredItemsToTrader(
        sessionId: string,
        lostInsuredItems: IItem[],
        pmcProfile: IPmcData,
    ): IInsuranceEquipmentPkg[] {
        const result: IInsuranceEquipmentPkg[] = [];

        for (const lostItem of lostInsuredItems) {
            const insuranceDetails = pmcProfile.InsuredItems.find((insuredItem) => insuredItem.itemId === lostItem._id);
            if (!insuranceDetails) {
                this.logger.error(
                    `unable to find insurance details for item id: ${lostItem._id} with tpl: ${lostItem._tpl}`,
                );

                continue;
            }

            if (this.itemCannotBeLostOnDeath(lostItem, pmcProfile.Inventory.items)) {
                continue;
            }

            // Add insured item + details to return array
            result.push({
                sessionID: sessionId,
                itemToReturnToPlayer: lostItem,
                pmcData: pmcProfile,
                traderId: insuranceDetails.tid,
            });
        }

        return result;
    }

    /**
     * Some items should never be returned in insurance but BSG send them in the request
     * @param lostItem Item being returned in insurance
     * @param inventoryItems Player inventory
     * @returns True if item
     */
    protected itemCannotBeLostOnDeath(lostItem: IItem, inventoryItems: IItem[]): boolean {
        if (lostItem.slotId?.toLowerCase().startsWith("specialslot")) {
            return true;
        }

        // We check secure container items even tho they are omitted from lostInsuredItems, just in case
        if (this.itemHelper.itemIsInsideContainer(lostItem, "SecuredContainer", inventoryItems)) {
            return true;
        }

        return false;
    }

    /**
     * Add gear item to InsuredItems array in player profile
     * @param sessionID Session id
     * @param pmcData Player profile
     * @param itemToReturnToPlayer item to store
     * @param traderId Id of trader item was insured with
     */
    protected addGearToSend(gear: IInsuranceEquipmentPkg): void {
        const sessionId = gear.sessionID;
        const pmcData = gear.pmcData;
        const itemToReturnToPlayer = gear.itemToReturnToPlayer;
        const traderId = gear.traderId;

        // Ensure insurance array is init
        if (!this.isuranceDictionaryExists(sessionId)) {
            this.resetInsurance(sessionId);
        }

        // init trader insurance array
        if (!this.insuranceTraderArrayExists(sessionId, traderId)) {
            this.resetInsuranceTraderArray(sessionId, traderId);
        }

        this.addInsuranceItemToArray(sessionId, traderId, itemToReturnToPlayer);

        // Remove item from insured items array as its been processed
        pmcData.InsuredItems = pmcData.InsuredItems.filter((item) => {
            return item.itemId !== itemToReturnToPlayer._id;
        });
    }

    /**
     * Does insurance exist for a player and by trader
     * @param sessionId Player id (session id)
     * @param traderId Trader items insured with
     * @returns True if exists
     */
    protected insuranceTraderArrayExists(sessionId: string, traderId: string): boolean {
        return this.insured[sessionId][traderId] !== undefined;
    }

    /**
     * Empty out array holding insured items by sessionid + traderid
     * @param sessionId Player id (session id)
     * @param traderId Trader items insured with
     */
    public resetInsuranceTraderArray(sessionId: string, traderId: string): void {
        this.insured[sessionId][traderId] = [];
    }

    /**
     * Store insured item
     * @param sessionId Player id (session id)
     * @param traderId Trader item insured with
     * @param itemToAdd Insured item (with children)
     */
    public addInsuranceItemToArray(sessionId: string, traderId: string, itemToAdd: IItem): void {
        this.insured[sessionId][traderId].push(itemToAdd);
    }

    /**
     * Get price of insurance * multiplier from config
     * @param pmcData Player profile
     * @param inventoryItem Item to be insured
     * @param traderId Trader item is insured with
     * @returns price in roubles
     */
    public getRoublePriceToInsureItemWithTrader(pmcData: IPmcData, inventoryItem: IItem, traderId: string): number {
        const price =
            this.itemHelper.getStaticItemPrice(inventoryItem._tpl) *
            (this.traderHelper.getLoyaltyLevel(traderId, pmcData).insurance_price_coef / 100);

        return Math.ceil(price);
    }
}
