import { inject, injectable } from "tsyringe";
import { ITraderBase } from "../models/eft/common/tables/ITrader";

import { DialogueHelper } from "../helpers/DialogueHelper";
import { HandbookHelper } from "../helpers/HandbookHelper";
import { SecureContainerHelper } from "../helpers/SecureContainerHelper";
import { TraderHelper } from "../helpers/TraderHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { InsuredItem } from "../models/eft/common/tables/IBotBase";
import { Item } from "../models/eft/common/tables/IItem";
import { ISaveProgressRequestData } from "../models/eft/inRaid/ISaveProgressRequestData";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { MessageType } from "../models/enums/MessageType";
import { IInsuranceConfig } from "../models/spt/config/IInsuranceConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { SaveServer } from "../servers/SaveServer";
import { RandomUtil } from "../utils/RandomUtil";
import { TimeUtil } from "../utils/TimeUtil";
import { LocalisationService } from "./LocalisationService";

@injectable()
export class InsuranceService
{
    protected insured: Record<string, Record<string, Item[]>> = {};
    protected insuranceConfig: IInsuranceConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("SecureContainerHelper") protected secureContainerHelper: SecureContainerHelper,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.insuranceConfig = this.configServer.getConfig(ConfigTypes.INSURANCE);
    }

    public insuranceExists(sessionId: string): boolean
    {
        return this.insured[sessionId] !== undefined;
    }

    public insuranceTraderArrayExists(sessionId: string, traderId: string): boolean
    {
        return this.insured[sessionId][traderId] !== undefined;
    }

    public getInsurance(sessionId: string): Record<string, Item[]>
    {
        return this.insured[sessionId];
    }

    public getInsuranceItems(sessionId: string, traderId: string): Item[]
    {
        return this.insured[sessionId][traderId];
    }

    public resetInsurance(sessionId: string): void
    {
        this.insured[sessionId] = {};
    }

    public resetInsuranceTraderArray(sessionId: string, traderId: string): void
    {
        this.insured[sessionId][traderId] = [];
    }

    public addInsuranceItemToArray(sessionId: string, traderId: string, itemToAdd: any): void
    {
        this.insured[sessionId][traderId].push(itemToAdd);
    }

    /**
     * Get the rouble price for an item by templateId
     * @param itemTpl item tpl to get handbook price for
     * @returns handbook price in roubles, Return 0 if not found
     */
    public getItemPrice(itemTpl: string): number
    {
        const handbookPrice = this.handbookHelper.getTemplatePrice(itemTpl);
        if (handbookPrice > 1)
        {
            return handbookPrice;
        }

        return 0; 
    }

    /**
     * Sends stored insured items as message to player
     * @param pmcData profile to modify
     * @param sessionID SessionId of current player
     * @param mapId Id of the map player died/exited that caused the insurance to be issued on
     */
    public sendInsuredItems(pmcData: IPmcData, sessionID: string, mapId: string): void
    {
        for (const traderId in this.getInsurance(sessionID))
        {
            const trader = this.traderHelper.getTrader(traderId, sessionID);
            const insuranceReturnTimestamp = this.getInsuranceReturnTimestamp(pmcData, trader);
            const dialogueTemplates = this.databaseServer.getTables().traders[traderId].dialogue;
            let messageContent = this.dialogueHelper.createMessageContext(this.randomUtil.getArrayValue(dialogueTemplates.insuranceStart), MessageType.NPC_TRADER, trader.insurance.max_storage_time);

            this.dialogueHelper.addDialogueMessage(traderId, messageContent, sessionID);

            messageContent = {
                templateId: this.randomUtil.getArrayValue(dialogueTemplates.insuranceFound),
                type: MessageType.INSURANCE_RETURN,
                text: "", // live insurance returns have an empty string for the text property
                maxStorageTime: trader.insurance.max_storage_time * TimeUtil.oneHourAsSeconds,
                profileChangeEvents: [],
                systemData: {
                    date: this.timeUtil.getDateMailFormat(),
                    time: this.timeUtil.getTimeMailFormat(),
                    location: mapId
                }
            };

            // Remove 'hideout' slotid property on all insurance items
            for (const insuredItem of this.getInsurance(sessionID)[traderId])
            {
                const isParentHere = this.getInsurance(sessionID)[traderId].find(isParent => isParent._id === insuredItem.parentId);
                if (!isParentHere)
                {
                    insuredItem.slotId = "hideout";
                    delete insuredItem.location;
                }
            }

            this.saveServer.getProfile(sessionID).insurance.push({
                scheduledTime: insuranceReturnTimestamp,
                traderId: traderId,
                messageContent: messageContent,
                items: this.getInsurance(sessionID)[traderId]
            });
        }

        this.resetInsurance(sessionID);
    }

    /**
     * Get a timestamp of what insurance items should be sent to player based on the type of trader used to insure
     * @param pmcData Player profile
     * @param trader Trader used to insure items
     * @returns Timestamp to return items to player in seconds
     */
    protected getInsuranceReturnTimestamp(pmcData: IPmcData, trader: ITraderBase): number
    {
        // If override inconfig is non-zero, use that instead of trader values
        if (this.insuranceConfig.returnTimeOverrideSeconds > 0)
        {
            this.logger.debug(`Insurance override used: returning in ${this.insuranceConfig.returnTimeOverrideSeconds} seconds`);
            return this.timeUtil.getTimestamp() + this.insuranceConfig.returnTimeOverrideSeconds;
        }

        const insuranceReturnTimeBonus = pmcData.Bonuses.find(b => b.type === "InsuranceReturnTime");
        const insuranceReturnTimeBonusPercent = 1.0 - (insuranceReturnTimeBonus ? Math.abs(insuranceReturnTimeBonus.value) : 0) / 100;

        const traderMinReturnAsSeconds = trader.insurance.min_return_hour * TimeUtil.oneHourAsSeconds;
        const traderMaxReturnAsSeconds = trader.insurance.max_return_hour * TimeUtil.oneHourAsSeconds;
        const randomisedReturnTimeSeconds = this.randomUtil.getInt(traderMinReturnAsSeconds, traderMaxReturnAsSeconds);

        return this.timeUtil.getTimestamp() + (randomisedReturnTimeSeconds * insuranceReturnTimeBonusPercent);
    }

    /**
     * Store lost gear post-raid inside profile
     * @param pmcData player profile to store gear in
     * @param offraidData post-raid request object
     * @param preRaidGear gear player wore prior to raid
     * @param sessionID Session id
     * @param playerDied did the player die in raid
     */
    public storeLostGear(pmcData: IPmcData, offraidData: ISaveProgressRequestData, preRaidGear: Item[], sessionID: string, playerDied: boolean): void
    {
        const preRaidGearHash: Record<string, Item> = {};
        const offRaidGearHash: Record<string, Item> = {};
        const gears = [];

        // Build a hash table to reduce loops
        for (const item of preRaidGear)
        {
            preRaidGearHash[item._id] = item;
        }

        // Build a hash of offRaidGear
        for (const item of offraidData.profile.Inventory.items)
        {
            offRaidGearHash[item._id] = item;
        }

        for (const insuredItem of pmcData.InsuredItems)
        {
            // Check insured item was on player during raid
            if (preRaidGearHash[insuredItem.itemId])
            {
                // This item exists in preRaidGear, meaning we brought it into the raid
                // Check if item missing OR player died with item on
                if (!offRaidGearHash[insuredItem.itemId] || playerDied)
                {
                    gears.push({
                        "pmcData": pmcData,
                        "insuredItem": insuredItem,
                        "item": preRaidGearHash[insuredItem.itemId],
                        "sessionID": sessionID
                    });
                }
            }
        }

        // Process all insured items lost in-raid
        for (const gear of gears)
        {
            this.addGearToSend(gear.pmcData, gear.insuredItem, gear.item, gear.sessionID);
        }
    }

    /**
     * Store insured items on pmc death inside insurance array in player profile
     * @param pmcData Player profile
     * @param offraidData Player gear post-raid
     * @param preRaidGear Player gear before raid
     * @param sessionID Session id
     */
    public storeInsuredItemsForReturn(pmcData: IPmcData, offraidData: ISaveProgressRequestData, preRaidGear: Item[], sessionID: string): void
    {
        const preRaidGearDictionary = {};
        const pmcItemsDictionary = {};
        const itemsToReturn = [];

        const itemsInSecureContainer = this.secureContainerHelper.getSecureContainerItems(offraidData.profile.Inventory.items);

        // Create dict of gear player had when entering raid
        for (const item of preRaidGear)
        {
            preRaidGearDictionary[item._id] = item;
        }

        // Create dict of gear player has post-raid
        for (const item of pmcData.Inventory.items)
        {
            pmcItemsDictionary[item._id] = item;
        }

        for (const insuredItem of pmcData.InsuredItems)
        {
            // Only return certain insured items:
            // Existed before raid
            // Not in secure container
            // Not in PMC inventory post raid
            if (preRaidGearDictionary[insuredItem.itemId]
                && !(itemsInSecureContainer.includes(insuredItem.itemId))
                && !(typeof pmcItemsDictionary[insuredItem.itemId] === "undefined"))
            {
                itemsToReturn.push(
                    { "pmcData": pmcData,
                        "insuredItem": insuredItem,
                        "item": pmcItemsDictionary[insuredItem.itemId],
                        "sessionID": sessionID }
                );
            }
        }

        for (const item of itemsToReturn)
        {
            this.addGearToSend(item.pmcData, item.insuredItem, item.item, item.sessionID);
        }
    }

    /**
     * Add gear item to InsuredItems array in player profile
     * @param pmcData profile to store item in
     * @param insuredItem Item to store in profile
     * @param actualItem item to store
     * @param sessionID Session id
     */
    protected addGearToSend(pmcData: IPmcData, insuredItem: InsuredItem, actualItem: Item, sessionID: string): void
    {
        // Skip items defined in config
        if (this.insuranceConfig.blacklistedEquipment.includes(actualItem.slotId))
        {
            return;
        }

        const pocketSlots = [
            "pocket1",
            "pocket2",
            "pocket3",
            "pocket4"
        ];

        // Check and correct the validity of the slotId
        if (!("slotId" in actualItem) || pocketSlots.includes(actualItem.slotId))
        {
            actualItem.slotId = "hideout";
        }

        // Mark root-level items for later
        if (actualItem.parentId === pmcData.Inventory.equipment)
        {
            actualItem.slotId = "hideout";
        }

        // Clear the location attribute of the item in the container.
        if (actualItem.slotId === "hideout" && "location" in actualItem)
        {
            delete actualItem.location;
        }

        // Remove found in raid status
        if ("upd" in actualItem && "SpawnedInSession" in actualItem.upd)
        {
            actualItem.upd.SpawnedInSession = false;
        }

        // Mark to add to insurance
        if (!this.insuranceExists(sessionID))
        {
            this.resetInsurance(sessionID);
        }

        if (!this.insuranceTraderArrayExists(sessionID, insuredItem.tid))
        {
            this.resetInsuranceTraderArray(sessionID, insuredItem.tid);
        }

        this.addInsuranceItemToArray(sessionID, insuredItem.tid, actualItem);

        // Remove processed item from array
        pmcData.InsuredItems = pmcData.InsuredItems.filter((item) =>
        {
            return item.itemId !== insuredItem.itemId;
        });
    }

    public getPremium(pmcData: IPmcData, inventoryItem: Item, traderId: string): number
    {
        let insuranceMultiplier = this.insuranceConfig.insuranceMultiplier[traderId];
        if (!insuranceMultiplier)
        {
            insuranceMultiplier = 0.3;
            this.logger.warning(this.localisationService.getText("insurance-missing_insurance_price_multiplier", traderId));
        }

        let premium = this.getItemPrice(inventoryItem._tpl) * insuranceMultiplier;
        const coef = this.traderHelper.getLoyaltyLevel(traderId, pmcData).insurance_price_coef;

        if (coef > 0)
        {
            premium *= (1 - this.traderHelper.getLoyaltyLevel(traderId, pmcData).insurance_price_coef / 100);
        }

        return Math.round(premium);
    }
}