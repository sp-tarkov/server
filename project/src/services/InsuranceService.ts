import { inject, injectable } from "tsyringe";
import { DialogueHelper } from "@spt/helpers/DialogueHelper";
import { HandbookHelper } from "@spt/helpers/HandbookHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { SecureContainerHelper } from "@spt/helpers/SecureContainerHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { Item } from "@spt/models/eft/common/tables/IItem";
import { ITraderBase } from "@spt/models/eft/common/tables/ITrader";
import { IInsuredItemsData } from "@spt/models/eft/inRaid/IInsuredItemsData";
import { ISaveProgressRequestData } from "@spt/models/eft/inRaid/ISaveProgressRequestData";
import { BonusType } from "@spt/models/enums/BonusType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { MessageType } from "@spt/models/enums/MessageType";
import { IInsuranceConfig } from "@spt/models/spt/config/IInsuranceConfig";
import { ILostOnDeathConfig } from "@spt/models/spt/config/ILostOnDeathConfig";
import { IInsuranceEquipmentPkg } from "@spt/models/spt/services/IInsuranceEquipmentPkg";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { LocaleService } from "@spt/services/LocaleService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";

@injectable()
export class InsuranceService
{
    protected insured: Record<string, Record<string, Item[]>> = {};
    protected insuranceConfig: IInsuranceConfig;
    protected lostOnDeathConfig: ILostOnDeathConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("SecureContainerHelper") protected secureContainerHelper: SecureContainerHelper,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("LocaleService") protected localeService: LocaleService,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("RecursiveCloner") protected cloner: ICloner,
    )
    {
        this.insuranceConfig = this.configServer.getConfig(ConfigTypes.INSURANCE);
        this.lostOnDeathConfig = this.configServer.getConfig(ConfigTypes.LOST_ON_DEATH);
    }

    /**
     * Does player have insurance array
     * @param sessionId Player id
     * @returns True if exists
     */
    public insuranceExists(sessionId: string): boolean
    {
        return this.insured[sessionId] !== undefined;
    }

    /**
     * Get all insured items by all traders for a profile
     * @param sessionId Profile id (session id)
     * @returns Item array
     */
    public getInsurance(sessionId: string): Record<string, Item[]>
    {
        return this.insured[sessionId];
    }

    /**
     * Get insured items by profile id + trader id
     * @param sessionId Profile id (session id)
     * @param traderId Trader items were insured with
     * @returns Item array
     */
    public getInsuranceItems(sessionId: string, traderId: string): Item[]
    {
        return this.insured[sessionId][traderId];
    }

    public resetInsurance(sessionId: string): void
    {
        this.insured[sessionId] = {};
    }

    /**
     * Sends stored insured items as message to player
     * @param pmcData profile to send insured items to
     * @param sessionID SessionId of current player
     * @param mapId Id of the map player died/exited that caused the insurance to be issued on
     */
    public sendInsuredItems(pmcData: IPmcData, sessionID: string, mapId: string): void
    {
        // Check for Mark of The Unheard in special slot (only slot it can fit)
        const markOfTheUnheardOnPlayer = pmcData.Inventory.items
            .filter((item) => item.slotId?.startsWith("SpecialSlot"))
            .find((item) => item._tpl === "65ddcc9cfa85b9f17d0dfb07");
        // Get insurance items for each trader
        for (const traderId in this.getInsurance(sessionID))
        {
            const traderBase = this.traderHelper.getTrader(traderId, sessionID);
            if (!traderBase)
            {
                throw new Error(`The trader id ${traderId} was not found!`);
            }
            let insuranceReturnTimestamp = this.getInsuranceReturnTimestamp(pmcData, traderBase);
            if (markOfTheUnheardOnPlayer)
            {
                insuranceReturnTimestamp *= this.databaseServer.getTables()
                    .globals!.config.Insurance.CoefOfHavingMarkOfUnknown;
            }
            const dialogueTemplates = this.databaseServer.getTables().traders![traderId].dialogue;

            if (!dialogueTemplates)
            {
                throw new Error(`The trader id ${traderId} does not have dialogues for insurance`);
            }

            const systemData = {
                date: this.timeUtil.getDateMailFormat(),
                time: this.timeUtil.getTimeMailFormat(),
                location: mapId,
            };
            const traderEnum = this.traderHelper.getTraderById(traderId);
            if (!traderEnum)
            {
                throw new Error(`The trader id ${traderId} is missing from Traders enum`);
            }
            // Send "i will go look for your stuff" message from trader to player
            this.mailSendService.sendLocalisedNpcMessageToPlayer(
                sessionID,
                traderEnum,
                MessageType.NPC_TRADER,
                this.randomUtil.getArrayValue(dialogueTemplates?.insuranceStart),
                undefined,
                this.timeUtil.getHoursAsSeconds(
                    this.databaseServer.getTables().globals!.config.Insurance.MaxStorageTimeInHour,
                ),
                systemData,
            );

            // Store insurance to send to player later in profile
            // Store insurance return details in profile + "hey i found your stuff, here you go!" message details to send to player at a later date
            this.saveServer.getProfile(sessionID).insurance.push({
                scheduledTime: insuranceReturnTimestamp,
                traderId: traderId,
                maxStorageTime: this.timeUtil.getHoursAsSeconds(traderBase.insurance.max_storage_time),
                systemData: systemData,
                messageType: MessageType.INSURANCE_RETURN,
                messageTemplateId: this.randomUtil.getArrayValue(dialogueTemplates.insuranceFound),
                items: this.getInsurance(sessionID)[traderId],
            });
        }

        this.resetInsurance(sessionID);
    }

    /**
     * Check all root insured items and remove location property + set slotId to 'hideout'
     * @param sessionId Session id
     * @param traderId Trader id
     */
    protected removeLocationProperty(sessionId: string, traderId: string): void
    {
        const insuredItems = this.getInsurance(sessionId)[traderId];
        for (const insuredItem of this.getInsurance(sessionId)[traderId])
        {
            // Find insured items parent
            const insuredItemsParent = insuredItems.find((x) => x._id === insuredItem.parentId);
            if (!insuredItemsParent)
            {
                // Remove location + set slotId of insured items parent
                insuredItem.slotId = "hideout";
                delete insuredItem.location;
            }
        }
    }

    /**
     * Get a timestamp of when insurance items should be sent to player based on trader used to insure
     * Apply insurance return bonus if found in profile
     * @param pmcData Player profile
     * @param trader Trader base used to insure items
     * @returns Timestamp to return items to player in seconds
     */
    protected getInsuranceReturnTimestamp(pmcData: IPmcData, trader: ITraderBase): number
    {
        // If override inconfig is non-zero, use that instead of trader values
        if (this.insuranceConfig.returnTimeOverrideSeconds > 0)
        {
            this.logger.debug(
                `Insurance override used: returning in ${this.insuranceConfig.returnTimeOverrideSeconds} seconds`,
            );
            return this.timeUtil.getTimestamp() + this.insuranceConfig.returnTimeOverrideSeconds;
        }

        const insuranceReturnTimeBonus = pmcData.Bonuses.find((b) => b.type === BonusType.INSURANCE_RETURN_TIME);
        const insuranceReturnTimeBonusPercent
            = 1.0 - (insuranceReturnTimeBonus ? Math.abs(insuranceReturnTimeBonus!.value ?? 0) : 0) / 100;

        const traderMinReturnAsSeconds = trader.insurance.min_return_hour * TimeUtil.ONE_HOUR_AS_SECONDS;
        const traderMaxReturnAsSeconds = trader.insurance.max_return_hour * TimeUtil.ONE_HOUR_AS_SECONDS;
        const randomisedReturnTimeSeconds = this.randomUtil.getInt(traderMinReturnAsSeconds, traderMaxReturnAsSeconds);

        // Current time + randomised time calculated above
        return this.timeUtil.getTimestamp() + randomisedReturnTimeSeconds * insuranceReturnTimeBonusPercent;
    }

    /**
     * Create insurance equipment packages that should be sent to the user. The packages should contain items that have
     * been lost in a raid and should be returned to the player through the insurance system.
     *
     * NOTE: We do not have data on items that were dropped in a raid. This means we have to pull item data from the
     *       profile at the start of the raid to return to the player in insurance. Because of this, the item
     *       positioning may differ from the position the item was in when the player died. Apart from removing all
     *       positioning, this is the best we can do. >:{}
     *
     * @param pmcData Player profile
     * @param offraidData Post-raid data
     * @param preRaidGear Pre-raid data
     * @param sessionID Session id
     * @param playerDied Did player die in raid
     * @returns Array of insured items lost in raid
     */
    public getGearLostInRaid(
        pmcData: IPmcData,
        offraidData: ISaveProgressRequestData,
        preRaidGear: Item[],
        sessionID: string,
        playerDied: boolean,
    ): IInsuranceEquipmentPkg[]
    {
        const equipmentPkg: IInsuranceEquipmentPkg[] = [];
        const preRaidGearMap = this.itemHelper.generateItemsMap(preRaidGear);
        const offRaidGearMap = this.itemHelper.generateItemsMap(offraidData.profile.Inventory.items);

        for (const insuredItem of pmcData.InsuredItems)
        {
            // Skip insured items not on player when they started the raid.
            if (!preRaidGearMap.has(insuredItem.itemId))
            {
                continue;
            }

            const preRaidItem = preRaidGearMap.get(insuredItem.itemId)!;

            // Skip slots we should never return as they're never lost on death
            if (this.insuranceConfig.blacklistedEquipment.includes(preRaidItem.slotId!))
            {
                continue;
            }

            // Equipment slots can be flagged as never lost on death and shouldn't be saved in an insurance package.
            // We need to check if the item is directly equipped to an equipment slot, or if it is a child Item of an
            // equipment slot.
            const equipmentParentItem = this.itemHelper.getEquipmentParent(preRaidItem._id, preRaidGearMap);

            const offraidDataitem = offraidData.insurance?.find(
                (insuranceItem) => insuranceItem.id === insuredItem.itemId);

            if (offraidDataitem?.usedInQuest)
            {
                continue;
            }

            // Now that we have the equipment parent item, we can check to see if that item is located in an equipment
            // slot that is flagged as lost on death. If it is, then the itemShouldBeLostOnDeath.
            const itemShouldBeLostOnDeath = equipmentParentItem?.slotId
                ? this.lostOnDeathConfig.equipment[equipmentParentItem?.slotId] ?? true
                : true;

            // Was the item found in the player inventory post-raid?
            const itemOnPlayerPostRaid = offRaidGearMap.has(insuredItem.itemId);

            // Check if item missing in post-raid gear OR player died + item slot flagged as lost on death
            // Catches both events: player died with item on + player survived but dropped item in raid
            if (!itemOnPlayerPostRaid || (playerDied && itemShouldBeLostOnDeath))
            {
                const inventoryInsuredItem = offraidData.insurance
                    ?.find((insuranceItem) => insuranceItem.id === insuredItem.itemId);
                if (!inventoryInsuredItem)
                {
                    throw new Error(`Inventory insured item id ${insuredItem.itemId} was not found`);
                }
                equipmentPkg.push({
                    pmcData: pmcData,
                    itemToReturnToPlayer: this.getInsuredItemDetails(
                        pmcData,
                        preRaidItem,
                        inventoryInsuredItem,
                    ),
                    traderId: insuredItem.tid,
                    sessionID: sessionID,
                });

                // Armor item with slots, we need to include soft_inserts as they can never be removed from armor items
                if (this.itemHelper.armorItemCanHoldMods(preRaidItem._tpl))
                {
                    if (this.itemHelper.itemHasSlots(preRaidItem._tpl))
                    {
                        // Get IDs of all soft insert child items on armor from pre raid gear data
                        const softInsertChildIds = preRaidGear
                            .filter(
                                (item) =>
                                    item.parentId === preRaidItem._id
                                    && this.itemHelper.getSoftInsertSlotIds().includes(item.slotId!.toLowerCase()),
                            )
                            .map((x) => x._id);

                        // Add all items found above to return data
                        for (const softInsertChildModId of softInsertChildIds)
                        {
                            const preRaidInventoryItem = preRaidGear.find((item) => item._id === softInsertChildModId);
                            if (!preRaidInventoryItem)
                            {
                                throw new Error(`Preraid inventory item ${softInsertChildModId} was not found`);
                            }
                            const inventoryInsuredItem = offraidData.insurance?.find(
                                (insuranceItem) => insuranceItem.id === softInsertChildModId,
                            );
                            if (!inventoryInsuredItem)
                            {
                                throw new Error(`Inventory insured item ${softInsertChildModId} was not found`);
                            }
                            equipmentPkg.push({
                                pmcData: pmcData,
                                itemToReturnToPlayer: this.getInsuredItemDetails(
                                    pmcData,
                                    preRaidInventoryItem,
                                    inventoryInsuredItem,
                                ),
                                traderId: insuredItem.tid,
                                sessionID: sessionID,
                            });
                        }
                    }
                }
            }
        }

        return equipmentPkg;
    }

    /**
     * Take the insurance item packages within a profile session and ensure that each of the items in that package are
     * not orphaned from their parent ID.
     *
     * @param sessionID The session ID to update insurance equipment packages in.
     * @returns void
     */
    protected adoptOrphanedInsEquipment(sessionID: string): void
    {
        const rootID = this.getRootItemParentID(sessionID);
        const insuranceData = this.getInsurance(sessionID);
        for (const [traderId, items] of Object.entries(insuranceData))
        {
            this.insured[sessionID][traderId] = this.itemHelper.adoptOrphanedItems(rootID, items);
        }
    }

    /**
     * Store lost gear post-raid inside profile, ready for later code to pick it up and mail it
     * @param equipmentPkg Gear to store - generated by getGearLostInRaid()
     */
    public storeGearLostInRaidToSendLater(sessionID: string, equipmentPkg: IInsuranceEquipmentPkg[]): void
    {
        // Process all insured items lost in-raid
        for (const gear of equipmentPkg)
        {
            this.addGearToSend(gear);
        }

        // Items are separated into their individual trader packages, now we can ensure that they all have valid parents
        this.adoptOrphanedInsEquipment(sessionID);
    }

    /**
     * Take preraid item and update properties to ensure its ready to be given to player in insurance return mail
     * @param pmcData Player profile
     * @param preRaidItemWithChildren Insured item (with children) as it was pre-raid
     * @param allItemsFromClient Item data when player left raid (durability values)
     * @returns Item (with children) to send to player
     */
    protected getInsuredItemDetails(
        pmcData: IPmcData,
        preRaidItem: Item,
        insuredItemFromClient: IInsuredItemsData,
    ): Item
    {
        // Get baseline item to return, clone pre raid item
        const itemToReturnClone: Item = this.cloner.clone(preRaidItem);

        // Add upd if it doesnt exist
        this.itemHelper.addUpdObjectToItem(itemToReturnClone);

        // Check for slotid values that need to be updated and adjust
        this.updateSlotIdValue(pmcData.Inventory.equipment, itemToReturnClone);

        // Remove location property
        if (itemToReturnClone.slotId === "hideout" && "location" in itemToReturnClone)
        {
            delete itemToReturnClone.location;
        }

        // Remove found in raid status when upd exists + SpawnedInSession value exists
        if ("SpawnedInSession" in itemToReturnClone.upd!)
        {
            itemToReturnClone.upd.SpawnedInSession = false;
        }

        // Client item has durability values, Ensure values persist into server data
        if (insuredItemFromClient?.durability)
        {
            // Item didnt have Repairable object pre-raid, add it
            if (!itemToReturnClone.upd?.Repairable)
            {
                itemToReturnClone.upd!.Repairable = {
                    Durability: insuredItemFromClient.durability,
                    MaxDurability: insuredItemFromClient.maxDurability!,
                };
            }
            else
            {
                itemToReturnClone.upd.Repairable.Durability = insuredItemFromClient.durability;
                itemToReturnClone.upd.Repairable.MaxDurability = insuredItemFromClient.maxDurability!;
            }
        }

        // Client item has FaceShield values, Ensure values persist into server data
        if (insuredItemFromClient?.hits)
        {
            // Item didnt have faceshield object pre-raid, add it
            if (!itemToReturnClone.upd?.FaceShield)
            {
                itemToReturnClone.upd!.FaceShield = { Hits: insuredItemFromClient.hits };
            }
            else
            {
                itemToReturnClone.upd.FaceShield.Hits = insuredItemFromClient.hits;
            }
        }

        return itemToReturnClone;
    }

    /**
     * Reset slotId property to "hideout" when necessary (used to be in )
     * @param pmcData Players pmcData.Inventory.equipment value
     * @param itemToReturn item we will send to player as insurance return
     */
    protected updateSlotIdValue(playerBaseInventoryEquipmentId: string, itemToReturn: Item): void
    {
        const pocketSlots = ["pocket1", "pocket2", "pocket3", "pocket4"];

        // Some pockets can lose items with player death, some don't
        if (!("slotId" in itemToReturn) || pocketSlots.includes(itemToReturn.slotId!))
        {
            itemToReturn.slotId = "hideout";
        }

        // Mark root-level items for later processing
        if (itemToReturn.parentId === playerBaseInventoryEquipmentId)
        {
            itemToReturn.slotId = "hideout";
        }
    }

    /**
     * Add gear item to InsuredItems array in player profile
     * @param sessionID Session id
     * @param pmcData Player profile
     * @param itemToReturnToPlayer item to store
     * @param traderId Id of trader item was insured with
     */
    protected addGearToSend(gear: IInsuranceEquipmentPkg): void
    {
        const sessionId = gear.sessionID;
        const pmcData = gear.pmcData;
        const itemToReturnToPlayer = gear.itemToReturnToPlayer;
        const traderId = gear.traderId;

        // Ensure insurance array is init
        if (!this.insuranceExists(sessionId))
        {
            this.resetInsurance(sessionId);
        }

        // init trader insurance array
        if (!this.insuranceTraderArrayExists(sessionId, traderId))
        {
            this.resetInsuranceTraderArray(sessionId, traderId);
        }

        this.addInsuranceItemToArray(sessionId, traderId, itemToReturnToPlayer);

        // Remove item from insured items array as its been processed
        pmcData.InsuredItems = pmcData.InsuredItems.filter((item) =>
        {
            return item.itemId !== itemToReturnToPlayer._id;
        });
    }

    /**
     * Does insurance exist for a player and by trader
     * @param sessionId Player id (session id)
     * @param traderId Trader items insured with
     * @returns True if exists
     */
    protected insuranceTraderArrayExists(sessionId: string, traderId: string): boolean
    {
        return this.insured[sessionId][traderId] !== undefined;
    }

    /**
     * Empty out array holding insured items by sessionid + traderid
     * @param sessionId Player id (session id)
     * @param traderId Trader items insured with
     */
    public resetInsuranceTraderArray(sessionId: string, traderId: string): void
    {
        this.insured[sessionId][traderId] = [];
    }

    /**
     * Store insured item
     * @param sessionId Player id (session id)
     * @param traderId Trader item insured with
     * @param itemToAdd Insured item (with children)
     */
    public addInsuranceItemToArray(sessionId: string, traderId: string, itemToAdd: Item): void
    {
        this.insured[sessionId][traderId].push(itemToAdd);
    }

    /**
     * Get price of insurance * multiplier from config
     * @param pmcData Player profile
     * @param inventoryItem Item to be insured
     * @param traderId Trader item is insured with
     * @returns price in roubles
     */
    public getRoublePriceToInsureItemWithTrader(pmcData: IPmcData, inventoryItem: Item, traderId: string): number
    {
        const price = this.itemHelper.getStaticItemPrice(inventoryItem._tpl)
          * (this.traderHelper.getLoyaltyLevel(traderId, pmcData).insurance_price_coef / 100);

        return Math.ceil(price);
    }

    /**
     * Returns the ID that should be used for a root-level Item's parentId property value within in the context of insurance.
     * @param sessionID Players id
     * @returns The root item Id.
     */
    public getRootItemParentID(sessionID: string): string
    {
        // Try to use the equipment id from the profile. I'm not sure this is strictly required, but it feels neat.
        return this.saveServer.getProfile(sessionID)?.characters?.pmc?.Inventory?.equipment ?? this.hashUtil.generate();
    }
}
