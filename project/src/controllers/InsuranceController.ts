import { inject, injectable } from "tsyringe";

import { DialogueHelper } from "@spt-aki/helpers/DialogueHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { TraderHelper } from "@spt-aki/helpers/TraderHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { IGetInsuranceCostRequestData } from "@spt-aki/models/eft/insurance/IGetInsuranceCostRequestData";
import { IGetInsuranceCostResponseData } from "@spt-aki/models/eft/insurance/IGetInsuranceCostResponseData";
import { IInsureRequestData } from "@spt-aki/models/eft/insurance/IInsureRequestData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { Insurance, ISystemData } from "@spt-aki/models/eft/profile/IAkiProfile";
import { IProcessBuyTradeRequestData } from "@spt-aki/models/eft/trade/IProcessBuyTradeRequestData";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { MessageType } from "@spt-aki/models/enums/MessageType";
import { IInsuranceConfig } from "@spt-aki/models/spt/config/IInsuranceConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { InsuranceService } from "@spt-aki/services/InsuranceService";
import { MailSendService } from "@spt-aki/services/MailSendService";
import { PaymentService } from "@spt-aki/services/PaymentService";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class InsuranceController
{
    protected insuranceConfig: IInsuranceConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("PaymentService") protected paymentService: PaymentService,
        @inject("InsuranceService") protected insuranceService: InsuranceService,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.insuranceConfig = this.configServer.getConfig(ConfigTypes.INSURANCE);
    }

    /**
     * Process insurance items of all profiles prior to being given back to the player through the mail service.
     *
     * @returns void
    */
    public processReturn(): void
    {
        // Process each installed profile.
        for (const sessionID in this.saveServer.getProfiles())
        {
            this.processReturnByProfile(sessionID);
        }
    }

    /**
     * Process insurance items of a single profile prior to being given back to the player through the mail service.
     *
     * @returns void
    */
    public processReturnByProfile(sessionID: string): void
    {
        // Filter out items that don't need to be processed yet.
        const insuranceDetails = this.filterInsuredItems(sessionID);

        // Skip profile if no insured items to process
        if (insuranceDetails.length === 0)
        {
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
    protected filterInsuredItems(sessionID: string, time?: number): Insurance[]
    {
        // Use the current time by default.
        if (!time)
        {
            time = this.timeUtil.getTimestamp();
        }

        const profileInsuranceDetails = this.saveServer.getProfile(sessionID).insurance;
        this.logger.debug(`Found ${profileInsuranceDetails.length} insurance packages in profile ${sessionID}`);

        return profileInsuranceDetails.filter((insured) => time >= insured.scheduledTime);
    }

    /**
     * This method orchestrates the processing of insured items in a profile.
     *
     * @param insuranceDetails The insured items to process.
     * @param sessionID The session ID that should receive the processed items.
     * @returns void
     */
    protected processInsuredItems(insuranceDetails: Insurance[], sessionID: string): void
    {
        this.logger.debug(`Processing ${insuranceDetails.length} insurance packages, which includes a total of ${insuranceDetails.map(ins => ins.items.length).reduce((acc, len) => acc + len, 0)} items, in profile ${sessionID}`);

        // Iterate over each of the insurance packages.
        insuranceDetails.forEach(insured =>
        {
            // Find items that should be deleted from the insured items.
            const itemsToDelete = this.findItemsToDelete(insured);

            // Actually remove them.
            this.removeItemsFromInsurance(insured, itemsToDelete);

            // Fix any orphaned items.
            this.adoptOrphanedItems(insured);

            // Send the mail to the player.
            this.sendMail(sessionID, insured, insured.items.length === 0);

            // Remove the fully processed insurance package from the profile.
            this.removeInsurancePackageFromProfile(sessionID, insured.messageContent.systemData);
        });
    }

    /**
     * Remove an insurance package from a profile using the package's system data information.
     *
     * @param sessionID The session ID of the profile to remove the package from.
     * @param index The array index of the insurance package to remove.
     * @returns void
     */
    protected removeInsurancePackageFromProfile(sessionID: string, packageInfo: ISystemData): void
    {
        const profile = this.saveServer.getProfile(sessionID);
        profile.insurance = profile.insurance.filter(insurance =>
            insurance.messageContent.systemData.date !== packageInfo.date ||
            insurance.messageContent.systemData.time !== packageInfo.time ||
            insurance.messageContent.systemData.location !== packageInfo.location
        );

        this.logger.debug(`Removed insurance package with date: ${packageInfo.date}, time: ${packageInfo.time}, and location: ${packageInfo.location} from profile ${sessionID}. Remaining packages: ${profile.insurance.length}`);
    }

    /**
     * Finds the items that should be deleted based on the given Insurance object.
     *
     * @param insured The insurance object containing the items to evaluate for deletion.
     * @returns A Set containing the IDs of items that should be deleted.
     */
    protected findItemsToDelete(insured: Insurance): Set<string>
    {
        const toDelete = new Set<string>();

        // Populate a Map object of items for quick lookup by their ID and use it to populate a Map of main-parent items
        // and each of their attachments. For example, a gun mapped to each of its attachments.
        const itemsMap = this.populateItemsMap(insured);
        const parentAttachmentsMap = this.populateParentAttachmentsMap(insured, itemsMap);

        // Process all items that are not attached, attachments. Those are handled separately, by value.
        this.processRegularItems(insured, toDelete);

        // Process attached, attachments, by value.
        this.processAttachments(parentAttachmentsMap, itemsMap, insured.traderId, toDelete);

        // Log the number of items marked for deletion, if any
        if (toDelete.size)
        {
            this.logger.debug(`Marked ${toDelete.size} items for deletion from insurance.`);
        }

        return toDelete;
    }

    /**
     * Populate a Map object of items for quick lookup by their ID.
     *
     * @param insured The insurance object containing the items to populate the map with.
     * @returns A Map where the keys are the item IDs and the values are the corresponding Item objects.
     */
    protected populateItemsMap(insured: Insurance): Map<string, Item>
    {
        const itemsMap = new Map<string, Item>();
        insured.items.forEach(item => itemsMap.set(item._id, item));
        return itemsMap;
    }

    /**
     * Initialize a Map object that holds main-parents to all of their attachments. Note that "main-parent" in this
     * context refers to the parent item that an attachment is attached to. For example, a suppressor attached to a gun,
     * not the backpack that the gun is located in (the gun's parent).
     *
     * @param insured - The insurance object containing the items to evaluate.
     * @param itemsMap - A Map object for quick item look-up by item ID.
     * @returns A Map object containing parent item IDs to arrays of their attachment items.
     */
    protected populateParentAttachmentsMap(insured: Insurance, itemsMap: Map<string, Item>): Map<string, Item[]>
    {
        const mainParentToAttachmentsMap = new Map<string, Item[]>();
        for (const insuredItem of insured.items)
        {
            // Use the template ID from the item to get the parent item's template details.
            const parentItem = insured.items.find(item => item._id === insuredItem.parentId);

            // Check if this is an attachment currently attached to its parent.
            if (this.itemHelper.isAttachmentAttached(insuredItem))
            {
                // Filter out items not in the database or not raid moddable.
                if (!this.itemHelper.isRaidModdable(insuredItem, parentItem))
                {
                    continue;
                }

                // Get the main parent of this attachment. (e.g., The gun that this suppressor is attached to.)
                const mainParent = this.itemHelper.getAttachmentMainParent(insuredItem._id, itemsMap);
                if (!mainParent)
                {
                    // Odd. The parent couldn't be found. Skip this attachment and warn.
                    this.logger.warning(`Could not find main-parent for insured attachment: ${this.itemHelper.getItemName(insuredItem._tpl)}`);
                    continue;
                }

                // Update (or add to) the main-parent to attachments map.
                if (mainParentToAttachmentsMap.has(mainParent._id))
                {
                    mainParentToAttachmentsMap.get(mainParent._id).push(insuredItem);
                }
                else
                {
                    mainParentToAttachmentsMap.set(mainParent._id, [insuredItem]);
                }
            }
        }
        return mainParentToAttachmentsMap;
    }

    /**
     * Process "regular" insurance items. Any insured item that is not an attached, attachment is considered a "regular"
     * item. This method iterates over them, preforming item deletion rolls to see if they should be deleted. If so,
     * they (and their attached, attachments, if any) are marked for deletion in the toDelete Set.
     *
     * @param insured The insurance object containing the items to evaluate.
     * @param toDelete A Set to keep track of items marked for deletion.
     * @returns void
     */
    protected processRegularItems(insured: Insurance, toDelete: Set<string>): void
    {
        for (const insuredItem of insured.items)
        {
            // Skip if the item is an attachment. These are handled separately.
            if (this.itemHelper.isAttachmentAttached(insuredItem))
            {
                continue;
            }

            // Check if the item has any children
            const itemAndChildren = this.itemHelper.findAndReturnChildrenAsItems(insured.items, insuredItem._id);

            // Roll for item deletion
            const itemRoll = this.rollForDelete(insured.traderId, insuredItem);
            if (itemRoll)
            {
                // Mark the item for deletion
                toDelete.add(insuredItem._id);

                // Check if the item has any children and mark those for deletion as well, but only if those
                // children are currently attached attachments.
                const directChildren = insured.items.filter(item => item.parentId === insuredItem._id);
                const allChildrenAreAttachments = directChildren.every(child => this.itemHelper.isAttachmentAttached(child));
                if (allChildrenAreAttachments)
                {
                    itemAndChildren.forEach(item => toDelete.add(item._id));
                }
            }
        }
    }

    /**
     * Process parent items and their attachments, updating the toDelete Set accordingly.
     *
     * This method iterates over a map of parent items to their attachments and performs evaluations on each.
     * It marks items for deletion based on certain conditions and updates the toDelete Set accordingly.
     *
     * @param mainParentToAttachmentsMap A Map object containing parent item IDs to arrays of their attachment items.
     * @param itemsMap A Map object for quick item look-up by item ID.
     * @param traderId The trader ID from the Insurance object.
     * @param toDelete A Set object to keep track of items marked for deletion.
     */
    protected processAttachments(mainParentToAttachmentsMap: Map<string, Item[]>, itemsMap: Map<string, Item>, traderId: string, toDelete: Set<string>): void
    {
        mainParentToAttachmentsMap.forEach((attachmentItems, parentId) =>
        {
            // Log the parent item's name.
            const parentItem = itemsMap.get(parentId);
            const parentName = this.itemHelper.getItemName(parentItem._tpl);
            this.logger.debug(`Processing attachments for parent item: ${parentName}`);

            // Your existing logic for sorting and filtering children of this parent item
            this.processAttachmentByParent(attachmentItems, traderId, toDelete);
        });
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
    protected processAttachmentByParent(attachments: Item[], traderId: string, toDelete: Set<string>): void
    {
        const sortedAttachments = this.sortAttachmentsByPrice(attachments);
        this.logAttachmentsDetails(sortedAttachments);

        const successfulRolls = this.countSuccessfulRolls(sortedAttachments, traderId);
        this.logger.debug(`Number of successful rolls: ${successfulRolls}`);

        this.attachmentDeletionByValue(sortedAttachments, successfulRolls, toDelete);
    }

    /**
     * Sorts the attachment items by their max price in descending order.
     *
     * @param attachments The array of attachments items.
     * @returns An array of items enriched with their max price and common locale-name.
     */
    protected sortAttachmentsByPrice(attachments: Item[]): EnrichedItem[]
    {
        return attachments.map(item => ({
            ...item,
            name: this.itemHelper.getItemName(item._tpl),
            maxPrice: this.itemHelper.getItemMaxPrice(item._tpl)
        })).sort((a, b) => b.maxPrice - a.maxPrice);
    }

    /**
     * Logs the details of each attachment item.
     *
     * @param attachments The array of attachment items.
     */
    protected logAttachmentsDetails(attachments: EnrichedItem[]): void
    {
        attachments.forEach(({ name, maxPrice }) =>
        {
            this.logger.debug(`Child Item - Name: ${name}, Max Price: ${maxPrice}`);
        });
    }

    /**
     * Counts the number of successful rolls for the attachment items.
     *
     * @param attachments The array of attachment items.
     * @param traderId The ID of the trader that has insured these attachments.
     * @returns The number of successful rolls.
     */
    protected countSuccessfulRolls(attachments: Item[], traderId: string): number
    {
        const rolls = Array.from({ length: attachments.length }, () => this.rollForDelete(traderId));
        return rolls.filter(Boolean).length;
    }

    /**
     * Marks the most valuable attachments for deletion based on the number of successful rolls made.
     *
     * @param attachments The array of attachment items.
     * @param successfulRolls The number of successful rolls.
     * @param toDelete The array that accumulates the IDs of the items to be deleted.
     */
    protected attachmentDeletionByValue(attachments: EnrichedItem[], successfulRolls: number, toDelete: Set<string>): void
    {
        const valuableToDelete = attachments.slice(0, successfulRolls).map(({ _id }) => _id);

        valuableToDelete.forEach(attachmentsId =>
        {
            const valuableChild = attachments.find(({ _id }) => _id === attachmentsId);
            if (valuableChild)
            {
                const { name, maxPrice } = valuableChild;
                this.logger.debug(`Marked for removal - Child Item: ${name}, Max Price: ${maxPrice}`);
                toDelete.add(attachmentsId);
            }
        });
    }

    /**
     * Remove items from the insured items that should not be returned to the player.
     *
     * @param insured The insured items to process.
     * @param toDelete The items that should be deleted.
     * @returns void
     */
    protected removeItemsFromInsurance(insured: Insurance, toDelete: Set<string>): void
    {
        insured.items = insured.items.filter(item => !toDelete.has(item._id));
    }

    /**
     * Adopts orphaned items by resetting them as base-level items. Helpful in situations where a parent has been
     * deleted from insurance, but any insured items within the parent should remain. This method will remove the
     * reference from the children to the parent and set item properties to main-level values.
     *
     * @param insured Insurance object containing items.
     */
    protected adoptOrphanedItems(insured: Insurance): void
    {
        const hideoutParentId = this.fetchHideoutItemParent(insured.items);

        insured.items.forEach(item =>
        {
            // Check if the item's parent exists in the insured items list.
            const parentExists = insured.items.some(parentItem => parentItem._id === item.parentId);

            // If the parent does not exist and the item is not already a 'hideout' item, adopt the orphaned item.
            if (!parentExists && item.parentId !== hideoutParentId && item.slotId !== "hideout")
            {
                item.parentId = hideoutParentId;
                item.slotId = "hideout";
                delete item.location;
            }
        });
    }

    /**
     * Fetches the parentId property of an item with a slotId "hideout". Not sure if this is actually dynamic, but this
     * method should be a reliable way to fetch it, if it ever does change.
     *
     * @param items Array of items to search through.
     * @returns The parentId of an item with slotId 'hideout'. Empty string if not found.
     */
    protected fetchHideoutItemParent(items: Item[]): string
    {
        const hideoutItem = items.find(item => item.slotId === "hideout");
        return hideoutItem ? hideoutItem?.parentId : "";
    }

    /**
     * Handle sending the insurance message to the user that potentially contains the valid insurance items.
     *
     * @param sessionID The session ID that should receive the insurance message.
     * @param insurance The context of insurance to use.
     * @param noItems Whether or not there are any items to return to the player.
     * @returns void
     */
    protected sendMail(sessionID: string, insurance: Insurance, noItems: boolean): void
    {
        // After all of the item filtering that we've done, if there are no items remaining, the insurance has
        // successfully "failed" to return anything and an appropriate message should be sent to the player.
        if (noItems)
        {
            const insuranceFailedTemplates = this.databaseServer.getTables().traders[insurance.traderId].dialogue.insuranceFailed;
            insurance.messageContent.templateId = this.randomUtil.getArrayValue(insuranceFailedTemplates);
        }

        // Send the insurance message
        this.mailSendService.sendLocalisedNpcMessageToPlayer(
            sessionID,
            this.traderHelper.getTraderById(insurance.traderId),
            MessageType.INSURANCE_RETURN,
            insurance.messageContent.templateId,
            insurance.items,
            insurance.messageContent.maxStorageTime,
            insurance.messageContent.systemData
        );
    }

    /**
     * Determines whether a insured item should be removed from the player's inventory based on a random roll and
     * trader-specific return chance.
     *
     * @param traderId The ID of the trader who insured the item.
     * @param insuredItem Optional. The item to roll for. Only used for logging.
     * @returns true if the insured item should be removed from inventory, false otherwise.
     */
    protected rollForDelete(traderId: string, insuredItem?: Item): boolean
    {
        const maxRoll = 9999;
        const conversionFactor = 100;

        const returnChance = this.randomUtil.getInt(0, maxRoll) / conversionFactor;
        const traderReturnChance = this.insuranceConfig.returnChancePercent[traderId];
        const roll = returnChance >= traderReturnChance;

        // Log the roll with as much detail as possible.
        const itemName = insuredItem ? ` for "${this.itemHelper.getItemName(insuredItem._tpl)}"` : "";
        const trader = this.traderHelper.getTraderById(traderId);
        const status = roll ? "Delete" : "Keep";
        this.logger.debug(`Rolling deletion${itemName} with ${trader} - Return ${traderReturnChance}% - Roll: ${returnChance} - Status: ${status}`);

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
    public insure(pmcData: IPmcData, body: IInsureRequestData, sessionID: string): IItemEventRouterResponse
    {
        let output = this.eventOutputHolder.getOutput(sessionID);
        const itemsToPay = [];
        const inventoryItemsHash = {};

        for (const item of pmcData.Inventory.items)
        {
            inventoryItemsHash[item._id] = item;
        }

        // get the price of all items
        for (const key of body.items)
        {
            itemsToPay.push({
                id: inventoryItemsHash[key]._id,
                count: Math.round(this.insuranceService.getPremium(pmcData, inventoryItemsHash[key], body.tid))
            });
        }

        const options: IProcessBuyTradeRequestData = {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            scheme_items: itemsToPay,
            tid: body.tid,
            Action: "",
            type: "",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            item_id: "",
            count: 0,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            scheme_id: 0
        };

        // pay for the item insurance
        output = this.paymentService.payMoney(pmcData, options, sessionID, output);
        if (output.warnings.length > 0)
        {
            return output;
        }

        // add items to InsuredItems list once money has been paid
        for (const key of body.items)
        {
            pmcData.InsuredItems.push({
                tid: body.tid,
                itemId: inventoryItemsHash[key]._id
            });
        }

        return output;
    }

    /**
     * Handle client/insurance/items/list/cost
     * Calculate insurance cost
     *
     * @param request request object
     * @param sessionID session id
     * @returns IGetInsuranceCostResponseData object to send to client
     */
    public cost(request: IGetInsuranceCostRequestData, sessionID: string): IGetInsuranceCostResponseData
    {
        const output: IGetInsuranceCostResponseData = {};
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        const inventoryItemsHash: Record<string, Item> = {};

        for (const item of pmcData.Inventory.items)
        {
            inventoryItemsHash[item._id] = item;
        }

        // Loop over each trader in request
        for (const trader of request.traders)
        {
            const items: Record<string, number> = {};

            for (const itemId of request.items)
            {
                // Ensure hash has item in it
                if (!inventoryItemsHash[itemId])
                {
                    this.logger.debug(`Item with id: ${itemId} missing from player inventory, skipping`);
                    continue;
                }
                items[inventoryItemsHash[itemId]._tpl] = Math.round(this.insuranceService.getPremium(pmcData, inventoryItemsHash[itemId], trader));
            }

            output[trader] = items;
        }

        return output;
    }
}

// Represents an insurance item that has had it's common locale-name and max price added to it.
interface EnrichedItem extends Item
{
    name: string;
    maxPrice: number;
}
