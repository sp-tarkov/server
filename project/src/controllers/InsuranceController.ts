import { DialogueHelper } from "@spt/helpers/DialogueHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IGetInsuranceCostRequestData } from "@spt/models/eft/insurance/IGetInsuranceCostRequestData";
import { IGetInsuranceCostResponseData } from "@spt/models/eft/insurance/IGetInsuranceCostResponseData";
import { IInsureRequestData } from "@spt/models/eft/insurance/IInsureRequestData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IInsurance } from "@spt/models/eft/profile/ISptProfile";
import { IProcessBuyTradeRequestData } from "@spt/models/eft/trade/IProcessBuyTradeRequestData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { Money } from "@spt/models/enums/Money";
import { SkillTypes } from "@spt/models/enums/SkillTypes";
import { IInsuranceConfig } from "@spt/models/spt/config/IInsuranceConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { InsuranceService } from "@spt/services/InsuranceService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { PaymentService } from "@spt/services/PaymentService";
import { RagfairPriceService } from "@spt/services/RagfairPriceService";
import { HashUtil } from "@spt/utils/HashUtil";
import { MathUtil } from "@spt/utils/MathUtil";
import { ProbabilityObject, ProbabilityObjectArray, RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class InsuranceController {
    protected insuranceConfig: IInsuranceConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("MathUtil") protected mathUtil: MathUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("PaymentService") protected paymentService: PaymentService,
        @inject("InsuranceService") protected insuranceService: InsuranceService,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.insuranceConfig = this.configServer.getConfig(ConfigTypes.INSURANCE);
    }

    /**
     * Process insurance items of all profiles prior to being given back to the player through the mail service.
     *
     * @returns void
     */
    public processReturn(): void {
        // Process each installed profile.
        for (const sessionID in this.saveServer.getProfiles()) {
            this.processReturnByProfile(sessionID);
        }
    }

    /**
     * Process insurance items of a single profile prior to being given back to the player through the mail service.
     *
     * @returns void
     */
    public processReturnByProfile(sessionID: string): void {
        // Filter out items that don't need to be processed yet.
        const insuranceDetails = this.filterInsuredItems(sessionID);

        // Skip profile if no insured items to process
        if (insuranceDetails.length === 0) {
            return;
        }

        this.processInsuredItems(insuranceDetails, sessionID);
    }

    /**
     * Get all insured items that are ready to be processed in a specific profile.
     *
     * @param sessionID Session ID of the profile to check.
     * @param time The time to check ready status against. Current time by default.
     * @returns All insured items that are ready to be processed.
     */
    protected filterInsuredItems(sessionID: string, time?: number): IInsurance[] {
        // Use the current time by default.
        const insuranceTime = time || this.timeUtil.getTimestamp();

        const profileInsuranceDetails = this.saveServer.getProfile(sessionID).insurance;
        if (profileInsuranceDetails.length > 0) {
            this.logger.debug(`Found ${profileInsuranceDetails.length} insurance packages in profile ${sessionID}`);
        }

        return profileInsuranceDetails.filter((insured) => insuranceTime >= insured.scheduledTime);
    }

    /**
     * This method orchestrates the processing of insured items in a profile.
     *
     * @param insuranceDetails The insured items to process.
     * @param sessionID The session ID that should receive the processed items.
     * @returns void
     */
    protected processInsuredItems(insuranceDetails: IInsurance[], sessionID: string): void {
        this.logger.debug(
            `Processing ${insuranceDetails.length} insurance packages, which includes a total of ${this.countAllInsuranceItems(
                insuranceDetails,
            )} items, in profile ${sessionID}`,
        );

        // Iterate over each of the insurance packages.
        for (const insured of insuranceDetails) {
            // Create a new root parent ID for the message we'll be sending the player
            const rootItemParentID = this.hashUtil.generate();

            // Update the insured items to have the new root parent ID for root/orphaned items
            insured.items = this.itemHelper.adoptOrphanedItems(rootItemParentID, insured.items);

            const simulateItemsBeingTaken = this.insuranceConfig.simulateItemsBeingTaken;
            if (simulateItemsBeingTaken) {
                // Find items that could be taken by another player off the players body
                const itemsToDelete = this.findItemsToDelete(rootItemParentID, insured);

                // Actually remove them.
                this.removeItemsFromInsurance(insured, itemsToDelete);

                // There's a chance we've orphaned weapon attachments, so adopt any orphaned items again
                insured.items = this.itemHelper.adoptOrphanedItems(rootItemParentID, insured.items);
            }

            // Send the mail to the player.
            this.sendMail(sessionID, insured);

            // Remove the fully processed insurance package from the profile.
            this.removeInsurancePackageFromProfile(sessionID, insured);
        }
    }

    /**
     * Count all items in all insurance packages.
     * @param insurance
     * @returns
     */
    protected countAllInsuranceItems(insurance: IInsurance[]): number {
        return this.mathUtil.arraySum(insurance.map((ins) => ins.items.length));
    }

    /**
     * Remove an insurance package from a profile using the package's system data information.
     *
     * @param sessionID The session ID of the profile to remove the package from.
     * @param index The array index of the insurance package to remove.
     * @returns void
     */
    protected removeInsurancePackageFromProfile(sessionID: string, insPackage: IInsurance): void {
        const profile = this.saveServer.getProfile(sessionID);
        profile.insurance = profile.insurance.filter(
            (insurance) =>
                insurance.traderId !== insPackage.traderId ||
                insurance.systemData.date !== insPackage.systemData.date ||
                insurance.systemData.time !== insPackage.systemData.time ||
                insurance.systemData.location !== insPackage.systemData.location,
        );

        this.logger.debug(`Removed processed insurance package. Remaining packages: ${profile.insurance.length}`);
    }

    /**
     * Finds the items that should be deleted based on the given Insurance object.
     *
     * @param rootItemParentID - The ID that should be assigned to all "hideout"/root items.
     * @param insured - The insurance object containing the items to evaluate for deletion.
     * @returns A Set containing the IDs of items that should be deleted.
     */
    protected findItemsToDelete(rootItemParentID: string, insured: IInsurance): Set<string> {
        const toDelete = new Set<string>();

        // Populate a Map object of items for quick lookup by their ID and use it to populate a Map of main-parent items
        // and each of their attachments. For example, a gun mapped to each of its attachments.
        const itemsMap = this.itemHelper.generateItemsMap(insured.items);
        let parentAttachmentsMap = this.populateParentAttachmentsMap(rootItemParentID, insured, itemsMap);

        // Check to see if any regular items are present.
        const hasRegularItems = Array.from(itemsMap.values()).some(
            (item) => !this.itemHelper.isAttachmentAttached(item),
        );

        // Process all items that are not attached, attachments; those are handled separately, by value.
        if (hasRegularItems) {
            this.processRegularItems(insured, toDelete, parentAttachmentsMap);
        }

        // Process attached, attachments, by value, only if there are any.
        if (parentAttachmentsMap.size > 0) {
            // Remove attachments that can not be moddable in-raid from the parentAttachmentsMap. We only want to
            // process moddable attachments from here on out.
            parentAttachmentsMap = this.removeNonModdableAttachments(parentAttachmentsMap, itemsMap);

            this.processAttachments(parentAttachmentsMap, itemsMap, insured.traderId, toDelete);
        }

        // Log the number of items marked for deletion, if any
        if (toDelete.size) {
            this.logger.debug(`Marked ${toDelete.size} items for deletion from insurance.`);
        }

        return toDelete;
    }

    /**
     * Initialize a Map object that holds main-parents to all of their attachments. Note that "main-parent" in this
     * context refers to the parent item that an attachment is attached to. For example, a suppressor attached to a gun,
     * not the backpack that the gun is located in (the gun's parent).
     *
     * @param rootItemParentID - The ID that should be assigned to all "hideout"/root items.
     * @param insured - The insurance object containing the items to evaluate.
     * @param itemsMap - A Map object for quick item look-up by item ID.
     * @returns A Map object containing parent item IDs to arrays of their attachment items.
     */
    protected populateParentAttachmentsMap(
        rootItemParentID: string,
        insured: IInsurance,
        itemsMap: Map<string, IItem>,
    ): Map<string, IItem[]> {
        const mainParentToAttachmentsMap = new Map<string, IItem[]>();
        for (const insuredItem of insured.items) {
            // Use the parent ID from the item to get the parent item.
            const parentItem = insured.items.find((item) => item._id === insuredItem.parentId);

            // The parent (not the hideout) could not be found. Skip and warn.
            if (!parentItem && insuredItem.parentId !== rootItemParentID) {
                this.logger.warning(
                    this.localisationService.getText("insurance-unable_to_find_parent_of_item", {
                        insuredItemId: insuredItem._id,
                        insuredItemTpl: insuredItem._tpl,
                        parentId: insuredItem.parentId,
                    }),
                );

                continue;
            }

            // Check if this is an attachment currently attached to its parent.
            if (this.itemHelper.isAttachmentAttached(insuredItem)) {
                // Make sure the template for the item exists.
                if (!this.itemHelper.getItem(insuredItem._tpl)[0]) {
                    this.logger.warning(
                        this.localisationService.getText("insurance-unable_to_find_attachment_in_db", {
                            insuredItemId: insuredItem._id,
                            insuredItemTpl: insuredItem._tpl,
                        }),
                    );

                    continue;
                }

                // Get the main parent of this attachment. (e.g., The gun that this suppressor is attached to.)
                const mainParent = this.itemHelper.getAttachmentMainParent(insuredItem._id, itemsMap);
                if (!mainParent) {
                    // Odd. The parent couldn't be found. Skip this attachment and warn.
                    this.logger.warning(
                        this.localisationService.getText("insurance-unable_to_find_main_parent_for_attachment", {
                            insuredItemId: insuredItem._id,
                            insuredItemTpl: insuredItem._tpl,
                            parentId: insuredItem.parentId,
                        }),
                    );

                    continue;
                }

                // Update (or add to) the main-parent to attachments map.
                if (mainParentToAttachmentsMap.has(mainParent._id)) {
                    mainParentToAttachmentsMap.get(mainParent._id).push(insuredItem);
                } else {
                    mainParentToAttachmentsMap.set(mainParent._id, [insuredItem]);
                }
            }
        }
        return mainParentToAttachmentsMap;
    }

    /**
     * Remove attachments that can not be moddable in-raid from the parentAttachmentsMap. If no moddable attachments
     * remain, the parent is removed from the map as well.
     *
     * @param parentAttachmentsMap - A Map object containing parent item IDs to arrays of their attachment items.
     * @param itemsMap - A Map object for quick item look-up by item ID.
     * @returns A Map object containing parent item IDs to arrays of their attachment items which are not moddable in-raid.
     */
    protected removeNonModdableAttachments(
        parentAttachmentsMap: Map<string, IItem[]>,
        itemsMap: Map<string, IItem>,
    ): Map<string, IItem[]> {
        const updatedMap = new Map<string, IItem[]>();

        for (const [parentId, attachmentItems] of parentAttachmentsMap) {
            const parentItem = itemsMap.get(parentId);
            const moddableAttachments: IItem[] = [];
            for (const attachment of attachmentItems) {
                // By default, assume the parent of the current attachment is the main-parent included in the map.
                let attachmentParentItem = parentItem;

                // If the attachment includes a parentId, use it to find its direct parent item, even if it's another
                // attachment on the main-parent. For example, if the attachment is a stock, we need to check to see if
                // it's moddable in the upper receiver (attachment/parent), which is attached to the gun (main-parent).
                if (attachment.parentId) {
                    const directParentItem = itemsMap.get(attachment.parentId);
                    if (directParentItem) {
                        attachmentParentItem = directParentItem;
                    }
                }

                if (this.itemHelper.isRaidModdable(attachment, attachmentParentItem)) {
                    moddableAttachments.push(attachment);
                }
            }

            // If any moddable attachments remain, add them to the updated map.
            if (moddableAttachments.length > 0) {
                updatedMap.set(parentId, moddableAttachments);
            }
        }

        return updatedMap;
    }

    /**
     * Process "regular" insurance items. Any insured item that is not an attached, attachment is considered a "regular"
     * item. This method iterates over them, preforming item deletion rolls to see if they should be deleted. If so,
     * they (and their attached, attachments, if any) are marked for deletion in the toDelete Set.
     *
     * @param insured The insurance object containing the items to evaluate.
     * @param toDelete A Set to keep track of items marked for deletion.
     * @param parentAttachmentsMap A Map object containing parent item IDs to arrays of their attachment items.
     * @returns void
     */
    protected processRegularItems(
        insured: IInsurance,
        toDelete: Set<string>,
        parentAttachmentsMap: Map<string, IItem[]>,
    ): void {
        for (const insuredItem of insured.items) {
            // Skip if the item is an attachment. These are handled separately.
            if (this.itemHelper.isAttachmentAttached(insuredItem)) {
                continue;
            }

            // Roll for item deletion
            const itemRoll = this.rollForDelete(insured.traderId, insuredItem);
            if (itemRoll) {
                // Check to see if this item is a parent in the parentAttachmentsMap. If so, do a look-up for *all* of
                // its children and mark them for deletion as well. Additionally remove the parent (and its children)
                // from the parentAttachmentsMap so that it's children are not rolled for later in the process.
                if (parentAttachmentsMap.has(insuredItem._id)) {
                    // This call will also return the parent item itself, queueing it for deletion as well.
                    const itemAndChildren = this.itemHelper.findAndReturnChildrenAsItems(
                        insured.items,
                        insuredItem._id,
                    );
                    for (const item of itemAndChildren) {
                        toDelete.add(item._id);
                    }

                    // Remove the parent (and its children) from the parentAttachmentsMap.
                    parentAttachmentsMap.delete(insuredItem._id);
                } else {
                    // This item doesn't have any children. Simply mark it for deletion.
                    toDelete.add(insuredItem._id);
                }
            }
        }
    }

    /**
     * Process parent items and their attachments, updating the toDelete Set accordingly.
     *
     * @param mainParentToAttachmentsMap A Map object containing parent item IDs to arrays of their attachment items.
     * @param itemsMap A Map object for quick item look-up by item ID.
     * @param traderId The trader ID from the Insurance object.
     * @param toDelete A Set object to keep track of items marked for deletion.
     */
    protected processAttachments(
        mainParentToAttachmentsMap: Map<string, IItem[]>,
        itemsMap: Map<string, IItem>,
        traderId: string,
        toDelete: Set<string>,
    ): void {
        for (const [parentId, attachmentItems] of mainParentToAttachmentsMap) {
            // Skip processing if parentId is already marked for deletion, as all attachments for that parent will
            // already be marked for deletion as well.
            if (toDelete.has(parentId)) {
                continue;
            }

            // Log the parent item's name.
            const parentItem = itemsMap.get(parentId);
            const parentName = this.itemHelper.getItemName(parentItem._tpl);
            this.logger.debug(`Processing attachments of parent "${parentName}":`);

            // Process the attachments for this individual parent item.
            this.processAttachmentByParent(attachmentItems, traderId, toDelete);
        }
    }

    /**
     * Takes an array of attachment items that belong to the same main-parent item, sorts them in descending order by
     * their maximum price. For each attachment, a roll is made to determine if a deletion should be made. Once the
     * number of deletions has been counted, the attachments are added to the toDelete Set, starting with the most
     * valuable attachments first.
     *
     * @param attachments The array of attachment items to sort, filter, and roll.
     * @param traderId The ID of the trader to that has ensured these items.
     * @param toDelete The array that accumulates the IDs of the items to be deleted.
     * @returns void
     */
    protected processAttachmentByParent(attachments: IItem[], traderId: string, toDelete: Set<string>): void {
        // Create dict of item ids + their flea/handbook price (highest is chosen)
        const weightedAttachmentByPrice = this.weightAttachmentsByPrice(attachments);

        // Get how many attachments we want to pull off parent
        const countOfAttachmentsToRemove = this.getAttachmentCountToRemove(weightedAttachmentByPrice, traderId);

        // Create prob array and add all attachments with rouble price as the weight
        const attachmentsProbabilityArray = new ProbabilityObjectArray<string, number>(this.mathUtil, this.cloner);
        for (const attachmentTpl of Object.keys(weightedAttachmentByPrice)) {
            attachmentsProbabilityArray.push(
                new ProbabilityObject(attachmentTpl, weightedAttachmentByPrice[attachmentTpl]),
            );
        }

        // Draw x attachments from weighted array to remove from parent, remove from pool after being picked
        const attachmentIdsToRemove = attachmentsProbabilityArray.draw(countOfAttachmentsToRemove, false);
        for (const attachmentId of attachmentIdsToRemove) {
            toDelete.add(attachmentId);
        }

        this.logAttachmentsBeingRemoved(attachmentIdsToRemove, attachments, weightedAttachmentByPrice);

        this.logger.debug(`Number of attachments to be deleted: ${attachmentIdsToRemove.length}`);
    }

    protected logAttachmentsBeingRemoved(
        attachmentIdsToRemove: string[],
        attachments: IItem[],
        attachmentPrices: Record<string, number>,
    ): void {
        let index = 1;
        for (const attachmentId of attachmentIdsToRemove) {
            this.logger.debug(
                `Attachment ${index} Id: ${attachmentId} Tpl: ${
                    attachments.find((x) => x._id === attachmentId)?._tpl
                } - Price: ${attachmentPrices[attachmentId]}`,
            );
            index++;
        }
    }

    protected weightAttachmentsByPrice(attachments: IItem[]): Record<string, number> {
        const result: Record<string, number> = {};

        // Get a dictionary of item tpls + their rouble price
        for (const attachment of attachments) {
            const price = this.ragfairPriceService.getDynamicItemPrice(attachment._tpl, Money.ROUBLES);
            if (price) {
                result[attachment._id] = Math.round(price);
            }
        }

        this.weightedRandomHelper.reduceWeightValues(result);

        return result;
    }

    /**
     * Get count of items to remove from weapon (take into account trader + price of attachment)
     * @param weightedAttachmentByPrice Dict of item Tpls and thier rouble price
     * @param traderId Trader attachment insured against
     * @returns Attachment count to remove
     */
    protected getAttachmentCountToRemove(weightedAttachmentByPrice: Record<string, number>, traderId: string): number {
        let removeCount = 0;

        if (this.randomUtil.getChance100(this.insuranceConfig.chanceNoAttachmentsTakenPercent)) {
            return removeCount;
        }

        for (const attachmentId of Object.keys(weightedAttachmentByPrice)) {
            // Below min price to be taken, skip
            if (weightedAttachmentByPrice[attachmentId] < this.insuranceConfig.minAttachmentRoublePriceToBeTaken) {
                continue;
            }

            if (this.rollForDelete(traderId)) {
                removeCount++;
            }
        }

        return removeCount;
    }

    /**
     * Remove items from the insured items that should not be returned to the player.
     *
     * @param insured The insured items to process.
     * @param toDelete The items that should be deleted.
     * @returns void
     */
    protected removeItemsFromInsurance(insured: IInsurance, toDelete: Set<string>): void {
        insured.items = insured.items.filter((item) => !toDelete.has(item._id));
    }

    /**
     * Handle sending the insurance message to the user that potentially contains the valid insurance items.
     *
     * @param sessionID The session ID that should receive the insurance message.
     * @param insurance The context of insurance to use.
     * @returns void
     */
    protected sendMail(sessionID: string, insurance: IInsurance): void {
        // After all of the item filtering that we've done, if there are no items remaining, the insurance has
        // successfully "failed" to return anything and an appropriate message should be sent to the player.
        const traderDialogMessages = this.databaseService.getTrader(insurance.traderId).dialogue;

        // Map is labs + insurance is disabled in base.json
        if (this.IsMapLabsAndInsuranceDisabled(insurance)) {
            // Trader has labs-specific messages
            // Wipe out returnable items
            this.handleLabsInsurance(traderDialogMessages, insurance);
        } else if (insurance.items.length === 0) {
            // Not labs and no items to return
            const insuranceFailedTemplates = traderDialogMessages.insuranceFailed;
            insurance.messageTemplateId = this.randomUtil.getArrayValue(insuranceFailedTemplates);
        }

        // Send the insurance message
        this.mailSendService.sendLocalisedNpcMessageToPlayer(
            sessionID,
            this.traderHelper.getTraderById(insurance.traderId),
            insurance.messageType,
            insurance.messageTemplateId,
            insurance.items,
            insurance.maxStorageTime,
            insurance.systemData,
        );
    }

    protected IsMapLabsAndInsuranceDisabled(insurance: IInsurance, labsId = "laboratory"): boolean {
        return (
            insurance.systemData?.location?.toLowerCase() === labsId &&
            !this.databaseService.getLocation(labsId).base.Insurance
        );
    }

    /**
     * Update IInsurance object with new messageTemplateId and wipe out items array data
     */
    protected handleLabsInsurance(traderDialogMessages: Record<string, string[]>, insurance: IInsurance): void {
        // Use labs specific messages if available, otherwise use default
        const responseMesageIds =
            traderDialogMessages.insuranceFailedLabs?.length > 0
                ? traderDialogMessages.insuranceFailedLabs
                : traderDialogMessages.insuranceFailed;

        insurance.messageTemplateId = this.randomUtil.getArrayValue(responseMesageIds);

        // Remove all insured items taken into labs
        insurance.items = [];
    }

    /**
     * Determines whether an insured item should be removed from the player's inventory based on a random roll and
     * trader-specific return chance.
     *
     * @param traderId The ID of the trader who insured the item.
     * @param insuredItem Optional. The item to roll for. Only used for logging.
     * @returns true if the insured item should be removed from inventory, false otherwise, or undefined on error.
     */
    protected rollForDelete(traderId: string, insuredItem?: IItem): boolean | undefined {
        const trader = this.traderHelper.getTraderById(traderId);
        if (!trader) {
            return undefined;
        }

        const maxRoll = 9999;
        const conversionFactor = 100;

        const returnChance = this.randomUtil.getInt(0, maxRoll) / conversionFactor;
        const traderReturnChance = this.insuranceConfig.returnChancePercent[traderId];
        const roll = returnChance >= traderReturnChance;

        // Log the roll with as much detail as possible.
        const itemName = insuredItem ? ` "${this.itemHelper.getItemName(insuredItem._tpl)}"` : "";
        const status = roll ? "Delete" : "Keep";
        this.logger.debug(
            `Rolling${itemName} with ${trader} - Return ${traderReturnChance}% - Roll: ${returnChance} - Status: ${status}`,
        );

        return roll;
    }

    /**
     * Handle Insure event
     * Add insurance to an item
     *
     * @param pmcData Player profile
     * @param body Insurance request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse object to send to client
     */
    public insure(pmcData: IPmcData, body: IInsureRequestData, sessionID: string): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionID);
        const itemsToInsureCount = body.items.length;
        const itemsToPay = [];
        const inventoryItemsHash = {};
        // Create hash of player inventory items (keyed by item id)
        for (const item of pmcData.Inventory.items) {
            inventoryItemsHash[item._id] = item;
        }

        // Get price of all items being insured
        for (const key of body.items) {
            itemsToPay.push({
                id: Money.ROUBLES, // TODO: update to handle different currencies
                count: this.insuranceService.getRoublePriceToInsureItemWithTrader(
                    pmcData,
                    inventoryItemsHash[key],
                    body.tid,
                ),
            });
        }

        const options: IProcessBuyTradeRequestData = {
            scheme_items: itemsToPay,
            tid: body.tid,
            Action: "SptInsure",
            type: "",
            item_id: "",
            count: 0,
            scheme_id: 0,
        };

        // pay for the item insurance
        this.paymentService.payMoney(pmcData, options, sessionID, output);
        if (output.warnings.length > 0) {
            return output;
        }

        // add items to InsuredItems list once money has been paid
        for (const key of body.items) {
            pmcData.InsuredItems.push({ tid: body.tid, itemId: inventoryItemsHash[key]._id });
            // If Item is Helmet or Body Armour -> Handle insurance of Softinserts
            if (this.itemHelper.armorItemHasRemovableOrSoftInsertSlots(inventoryItemsHash[key]._tpl)) {
                this.insureSoftInserts(inventoryItemsHash[key], pmcData, body);
            }
        }

        this.profileHelper.addSkillPointsToPlayer(pmcData, SkillTypes.CHARISMA, itemsToInsureCount * 0.01);

        return output;
    }

    /**
     *  Insure softinserts of Armor that has softinsert slots
     * Allows armors to come back after being lost correctly
     * @param item Armor item to be insured
     * @param pmcData Player profile
     * @param body Insurance request data
     */
    public insureSoftInserts(item: IItem, pmcData: IPmcData, body: IInsureRequestData): void {
        const softInsertIds = this.itemHelper.getSoftInsertSlotIds();
        const softInsertSlots = pmcData.Inventory.items.filter(
            (_item) => _item.parentId === item._id && softInsertIds.includes(_item.slotId.toLowerCase()),
        );

        for (const softInsertSlot of softInsertSlots) {
            this.logger.debug(`SoftInsertSlots: ${softInsertSlot.slotId}`);
            pmcData.InsuredItems.push({ tid: body.tid, itemId: softInsertSlot._id });
        }
    }

    /**
     * Handle client/insurance/items/list/cost
     * Calculate insurance cost
     *
     * @param request request object
     * @param sessionID session id
     * @returns IGetInsuranceCostResponseData object to send to client
     */
    public cost(request: IGetInsuranceCostRequestData, sessionID: string): IGetInsuranceCostResponseData {
        const response: IGetInsuranceCostResponseData = {};
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        const inventoryItemsHash: Record<string, IItem> = {};

        for (const item of pmcData.Inventory.items) {
            inventoryItemsHash[item._id] = item;
        }

        // Loop over each trader in request
        for (const trader of request.traders) {
            const items: Record<string, number> = {};

            for (const itemId of request.items) {
                // Ensure hash has item in it
                if (!inventoryItemsHash[itemId]) {
                    this.logger.debug(`Item with id: ${itemId} missing from player inventory, skipping`);
                    continue;
                }
                items[inventoryItemsHash[itemId]._tpl] = this.insuranceService.getRoublePriceToInsureItemWithTrader(
                    pmcData,
                    inventoryItemsHash[itemId],
                    trader,
                );
            }

            response[trader] = items;
        }

        return response;
    }
}
