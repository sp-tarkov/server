import { inject, injectable } from "tsyringe";

import { DialogueHelper } from "../helpers/DialogueHelper";
import { ItemHelper } from "../helpers/ItemHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { TraderHelper } from "../helpers/TraderHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { Item } from "../models/eft/common/tables/IItem";
import { ITemplateItem } from "../models/eft/common/tables/ITemplateItem";
import { IGetInsuranceCostRequestData } from "../models/eft/insurance/IGetInsuranceCostRequestData";
import {
    IGetInsuranceCostResponseData
} from "../models/eft/insurance/IGetInsuranceCostResponseData";
import { IInsureRequestData } from "../models/eft/insurance/IInsureRequestData";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { Insurance, ISystemData } from "../models/eft/profile/IAkiProfile";
import { IProcessBuyTradeRequestData } from "../models/eft/trade/IProcessBuyTradeRequestData";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { MessageType } from "../models/enums/MessageType";
import { IInsuranceConfig } from "../models/spt/config/IInsuranceConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { EventOutputHolder } from "../routers/EventOutputHolder";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { SaveServer } from "../servers/SaveServer";
import { InsuranceService } from "../services/InsuranceService";
import { MailSendService } from "../services/MailSendService";
import { PaymentService } from "../services/PaymentService";
import { RandomUtil } from "../utils/RandomUtil";
import { TimeUtil } from "../utils/TimeUtil";

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
     * Build an array of items to delete from the insured items.
     * 
     * This method orchestrates several steps:
     *  - Filters items based on their presence in the database and their raid moddability.
     *  - Sorts base and independent child items to consider for deletion.
     *  - Groups child items by their parent for later evaluation.
     *  - Evaluates grouped child items to decide which should be deleted, based on their value and a random roll.
     * 
     * @param insured - The insured items to build a removal array from.
     * @returns An array of IDs representing items that should be deleted.
     */
    protected findItemsToDelete(insured: Insurance): Set<string>
    {
        const toDelete = new Set<string>();
        const childrenGroupedByParent = new Map<string, Item[]>();
        const itemNamesToDelete: string[] = [];
        
        insured.items.forEach(insuredItem =>
        {
            const itemDbDetails = this.itemHelper.getItem(insuredItem._tpl);
            const itemName = itemDbDetails ? itemDbDetails[1]?._props?.ShortName : "Unknown Item";

            // Use the _tpl property from the parent item to get the parent item details
            const parentItem = insured.items.find(item => item._id === insuredItem.parentId);
            const parentItemDbDetailsArray = parentItem ? this.itemHelper.getItem(parentItem._tpl) : null;
            const parentItemDbDetails = parentItemDbDetailsArray ? parentItemDbDetailsArray[1] : null;

            // Filter out items not in the database or not raid moddable.
            if (!this.filterByRaidModdability(insuredItem, parentItemDbDetails, itemDbDetails)) return;
        
            // Check for base or independent child items.
            if (this.isBaseOrIndependentChild(insuredItem))
            {
                // Find child IDs if the item is a parent.
                const itemWithChildren = this.itemHelper.findAndReturnChildrenByItems(insured.items, insuredItem._id);
                
                // Make a roll to decide if this item should be deleted, and if so, add it and its children to the deletion list.
                if (this.makeRollAndMarkForDeletion(insuredItem, insured.traderId, toDelete))
                {
                    itemWithChildren.forEach(childId => toDelete.add(childId));
                    itemNamesToDelete.push(itemName);
                }
            }
            else if (insuredItem.parentId)
            {
                // This is a child item equipped to a parent... Group this child item by its parent.
                this.groupChildrenByParent(insuredItem, childrenGroupedByParent);
            }
        });
        
        // Iterate through each group of children and sort and filter them for deletion.
        childrenGroupedByParent.forEach((children) =>
        {
            this.sortAndFilterChildren(children, insured.traderId, toDelete);
        });

        // When items are selected for deletion, log the number of items and their names.
        if (toDelete.size) 
        {
            this.logger.debug(`Marked ${toDelete.size} items for deletion from insurance. Items: ${itemNamesToDelete.join(", ")}`);
        }

        return toDelete;
    }

    /**
     * Filters an item based on its existence in the database, raid moddability, and slot requirements.
     * 
     * @param item The item to be filtered.
     * @param parentItemDbDetails The database details of the parent item, or null if the item has no parent.
     * @param itemDbDetails A tuple where the first element is a boolean indicating if the item exists in the database,
     *                      and the second element is the item details if it does.
     * @returns true if the item exists in the database and neither of the following conditions are met:
     *           - The item has the RaidModdable property set to false.
     *           - The item is attached to a required slot in its parent item.
     *          Otherwise, returns false.
     */
    protected filterByRaidModdability(item: Item, parentItemDbDetails: ITemplateItem | null, itemDbDetails: [boolean, ITemplateItem]): boolean
    {
        // Check for RaidModdable property.
        const isNotRaidModdable = itemDbDetails[1]?._props?.RaidModdable === false;

        // Check for Slots in parent item details.
        let isRequiredSlot = false;
        if (parentItemDbDetails?._props?.Slots) 
        {
            // Check if a Slot in parent details matches the slotId of the current item and is marked as required
            isRequiredSlot = parentItemDbDetails._props.Slots.some(slot => slot._name === item.slotId && slot._required);
        }

        return itemDbDetails[0] && !(isNotRaidModdable || isRequiredSlot);
    }

    /**
     * Determines if an item is either a base item or a child item that is not equipped to its parent.
     * 
     * @param item The item to check.
     * @returns true if the item is a base or an independent child item, otherwise false.
     */
    protected isBaseOrIndependentChild(item: Item): boolean
    {
        return item.slotId === "hideout" || item.slotId === "main" || !isNaN(Number(item.slotId));
    }

    /**
     * Makes a roll to determine if a given item should be deleted. If the roll is successful, the item's ID is added 
     * to the `toDelete` array.
     * 
     * @param item The item for which the roll is made.
     * @param traderId The ID of the trader to consider in the rollForItemDelete method.
     * @param toDelete The array accumulating the IDs of items to be deleted.
     * @returns true if the item is marked for deletion, otherwise false.
     */
    protected makeRollAndMarkForDeletion(item: Item, traderId: string, toDelete: Set<string>): boolean
    {
        if (this.rollForItemDelete(item, traderId, toDelete))
        {
            toDelete.add(item._id);
            return true;
        }
        return false;
    }

    /**
     * Groups child items by their parent IDs in a Map data structure.
     * 
     * @param item The child item to be grouped by its parent.
     * @param childrenGroupedByParent The Map that holds arrays of children items grouped by their parent IDs.
     * @returns void
     */
    protected groupChildrenByParent(item: Item, childrenGroupedByParent: Map<string, Item[]>): void
    {
        if (!childrenGroupedByParent.has(item.parentId!))
        {
            childrenGroupedByParent.set(item.parentId!, []);
        }
        childrenGroupedByParent.get(item.parentId!)?.push(item);
    }

    /**
     * Sorts the array of children items in descending order by their maximum price. For each child, a roll is made to 
     * determine if it should be deleted. The method then deletes the most valuable children based on the number of 
     * successful rolls made.
     * 
     * @param children The array of children items to sort and filter.
     * @param traderId The ID of the trader to consider in the rollForItemDelete method.
     * @param toDelete The array that accumulates the IDs of the items to be deleted.
     * @returns void
     */
    protected sortAndFilterChildren(children: Item[], traderId: string, toDelete: Set<string>): void
    {
        // Sort the children by their max price in descending order.
        children.sort((a, b) => this.itemHelper.getItemMaxPrice(b._tpl) - this.itemHelper.getItemMaxPrice(a._tpl));
        
        // Count the number of successful rolls.
        let successfulRolls = 0;
        for (const child of children)
        {
            if (this.rollForItemDelete(child, traderId, toDelete))
            {
                successfulRolls++;
            }
        }
        
        // Delete the most valuable children based on the number of successful rolls.
        const mostValuableChildrenToDelete = children.slice(0, successfulRolls).map(child => child._id);
        mostValuableChildrenToDelete.forEach(valuableChild => toDelete.add(valuableChild));
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
     * Determines whether a valid insured item should be removed from the player's inventory based on a random roll and 
     * trader-specific return chance.
     * 
     * @param insuredItem The insured item being evaluated for removal.
     * @param traderId The ID of the trader who insured the item.
     * @param itemsBeingDeleted List of items that are already slated for removal.
     * @returns true if the insured item should be removed from inventory, false otherwise.
     */
    protected rollForItemDelete(insuredItem: Item, traderId: string, itemsBeingDeleted: Set<string>): boolean 
    {
        const maxRoll = 9999;
        const conversionFactor = 100;
        
        const returnChance = this.randomUtil.getInt(0, maxRoll) / conversionFactor;
        const traderReturnChance = this.insuranceConfig.returnChancePercent[traderId];
        const exceedsTraderReturnChance = returnChance >= traderReturnChance;
        const isItemAlreadyBeingDeleted = itemsBeingDeleted.has(insuredItem._id);

        return exceedsTraderReturnChance && !isItemAlreadyBeingDeleted;
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
