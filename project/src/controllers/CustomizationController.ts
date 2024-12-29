import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import type { ICustomisationStorage } from "@spt/models/eft/common/tables/ICustomisationStorage";
import type { ISuit } from "@spt/models/eft/common/tables/ITrader";
import type {
    IBuyClothingRequestData,
    IPaymentItemForClothing,
} from "@spt/models/eft/customization/IBuyClothingRequestData";
import type { ICustomizationSetRequest } from "@spt/models/eft/customization/ICustomizationSetRequest";
import type { IWearClothingRequestData } from "@spt/models/eft/customization/IWearClothingRequestData";
import type { IHideoutCustomisation } from "@spt/models/eft/hideout/IHideoutCustomisation";
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { GameEditions } from "@spt/models/enums/GameEditions";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class CustomizationController {
    protected readonly clothingIds = {
        lowerParentId: "5cd944d01388ce000a659df9",
        upperParentId: "5cd944ca1388ce03a44dc2a4",
    };

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {}

    /**
     * Get purchasable clothing items from trader that match players side (usec/bear)
     * @param traderID trader to look up clothing for
     * @param sessionID Session id
     * @returns ISuit array
     */
    public getTraderSuits(traderID: string, sessionID: string): ISuit[] {
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        const clothing = this.databaseService.getCustomization();
        const suits = this.databaseService.getTrader(traderID).suits;

        // Get an inner join of clothing from templates.customization and Ragman's suits array
        const matchingSuits = suits?.filter((suit) => suit.suiteId in clothing);

        // Return all suits that have a side array containing the players side (usec/bear)
        const matchedSuits = matchingSuits?.filter((matchingSuit) =>
            clothing[matchingSuit.suiteId]._props.Side.includes(pmcData.Info.Side),
        );
        if (matchingSuits === undefined)
            throw new Error(this.localisationService.getText("customisation-unable_to_get_trader_suits", traderID));

        return matchedSuits;
    }

    /**
     * Handle CustomizationWear event
     * Equip one to many clothing items to player
     */
    public wearClothing(
        pmcData: IPmcData,
        wearClothingRequest: IWearClothingRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        for (const suitId of wearClothingRequest.suites) {
            // Find desired clothing item in db
            const dbSuit = this.databaseService.getCustomization()[suitId];

            // Legs
            if (dbSuit._parent === this.clothingIds.lowerParentId) {
                pmcData.Customization.Feet = dbSuit._props.Feet;
            }

            // Torso
            if (dbSuit._parent === this.clothingIds.upperParentId) {
                pmcData.Customization.Body = dbSuit._props.Body;
                pmcData.Customization.Hands = dbSuit._props.Hands;
            }
        }

        return this.eventOutputHolder.getOutput(sessionID);
    }

    /**
     * Handle CustomizationBuy event
     * Purchase/unlock a clothing item from a trader
     * @param pmcData Player profile
     * @param buyClothingRequest Request object
     * @param sessionId Session id
     * @returns IItemEventRouterResponse
     */
    public buyClothing(
        pmcData: IPmcData,
        buyClothingRequest: IBuyClothingRequestData,
        sessionId: string,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionId);

        const traderOffer = this.getTraderClothingOffer(sessionId, buyClothingRequest.offer);
        if (!traderOffer) {
            this.logger.error(
                this.localisationService.getText("customisation-unable_to_find_suit_by_id", buyClothingRequest.offer),
            );

            return output;
        }

        const suitId = traderOffer.suiteId;
        if (this.outfitAlreadyPurchased(suitId, sessionId)) {
            const suitDetails = this.databaseService.getCustomization()[suitId];
            this.logger.error(
                this.localisationService.getText("customisation-item_already_purchased", {
                    itemId: suitDetails._id,
                    itemName: suitDetails._name,
                }),
            );

            return output;
        }

        // Pay for items
        this.payForClothingItems(sessionId, pmcData, buyClothingRequest.items, output);

        // Add clothing to profile
        this.saveServer.getProfile(sessionId).suits.push(suitId);

        return output;
    }

    protected getTraderClothingOffer(sessionId: string, offerId: string): ISuit {
        const foundSuit = this.getAllTraderSuits(sessionId).find((x) => x._id === offerId);
        if (foundSuit === undefined) {
            throw new Error(this.localisationService.getText("customisation-unable_to_find_suit_with_id", offerId));
        }

        return foundSuit;
    }

    /**
     * Has an outfit been purchased by a player
     * @param suitId clothing id
     * @param sessionID Session id of profile to check for clothing in
     * @returns true if already purchased
     */
    protected outfitAlreadyPurchased(suitId: string, sessionID: string): boolean {
        return this.saveServer.getProfile(sessionID).suits.includes(suitId);
    }

    /**
     * Update output object and player profile with purchase details
     * @param sessionId Session id
     * @param pmcData Player profile
     * @param itemsToPayForClothingWith Clothing purchased
     * @param output Client response
     */
    protected payForClothingItems(
        sessionId: string,
        pmcData: IPmcData,
        itemsToPayForClothingWith: IPaymentItemForClothing[],
        output: IItemEventRouterResponse,
    ): void {
        for (const inventoryItemToProcess of itemsToPayForClothingWith) {
            this.payForClothingItem(sessionId, pmcData, inventoryItemToProcess, output);
        }
    }

    /**
     * Update output object and player profile with purchase details for single piece of clothing
     * @param sessionId Session id
     * @param pmcData Player profile
     * @param paymentItemDetails Payment details
     * @param output Client response
     */
    protected payForClothingItem(
        sessionId: string,
        pmcData: IPmcData,
        paymentItemDetails: IPaymentItemForClothing,
        output: IItemEventRouterResponse,
    ): void {
        const inventoryItem = pmcData.Inventory.items.find((x) => x._id === paymentItemDetails.id);
        if (!inventoryItem) {
            this.logger.error(
                this.localisationService.getText(
                    "customisation-unable_to_find_clothing_item_in_inventory",
                    paymentItemDetails.id,
                ),
            );

            return;
        }

        if (paymentItemDetails.del) {
            output.profileChanges[sessionId].items.del.push(inventoryItem);
            pmcData.Inventory.items.splice(pmcData.Inventory.items.indexOf(inventoryItem), 1);
        }

        // No upd, add a default
        inventoryItem.upd ||= {
            StackObjectsCount: 1,
        };

        // Nullguard
        if (typeof inventoryItem.upd.StackObjectsCount === "undefined") {
            inventoryItem.upd.StackObjectsCount = 1;
        }

        // Needed count to buy is same as current stack
        if (inventoryItem.upd.StackObjectsCount === paymentItemDetails.count) {
            output.profileChanges[sessionId].items.del.push(inventoryItem);
            pmcData.Inventory.items.splice(pmcData.Inventory.items.indexOf(inventoryItem), 1);

            return;
        }

        if (inventoryItem.upd.StackObjectsCount > paymentItemDetails.count) {
            inventoryItem.upd.StackObjectsCount -= paymentItemDetails.count;
            output.profileChanges[sessionId].items.change.push({
                _id: inventoryItem._id,
                _tpl: inventoryItem._tpl,
                parentId: inventoryItem.parentId,
                slotId: inventoryItem.slotId,
                location: inventoryItem.location,
                upd: { StackObjectsCount: inventoryItem.upd.StackObjectsCount },
            });
        }
    }

    protected getAllTraderSuits(sessionID: string): ISuit[] {
        const traders = this.databaseService.getTraders();
        let result: ISuit[] = [];

        for (const traderID in traders) {
            if (traders[traderID].base.customization_seller === true) {
                result = [...result, ...this.getTraderSuits(traderID, sessionID)];
            }
        }

        return result;
    }

    /** Handle client/hideout/customization/offer/list */
    public getHideoutCustomisation(sessionID: string, info: IEmptyRequestData): IHideoutCustomisation {
        return this.databaseService.getHideout().customisation;
    }

    /** Handle client/customization/storage */
    public getCustomisationStorage(sessionID: string, info: IEmptyRequestData): ICustomisationStorage[] {
        const customisationResultsClone = this.cloner.clone(this.databaseService.getTemplates().customisationStorage);

        // Some game versions have additional dogtag variants, add them
        const profile = this.profileHelper.getFullProfile(sessionID);
        switch (this.getGameEdition(profile)) {
            case GameEditions.EDGE_OF_DARKNESS:
                // Gets EoD tags
                customisationResultsClone.push({
                    id: "6746fd09bafff85008048838",
                    source: "default",
                    type: "dogTag",
                });

                customisationResultsClone.push({
                    id: "67471938bafff850080488b7",
                    source: "default",
                    type: "dogTag",
                });

                break;
            case GameEditions.UNHEARD:
                // Gets EoD+Unheard tags
                customisationResultsClone.push({
                    id: "6746fd09bafff85008048838",
                    source: "default",
                    type: "dogTag",
                });

                customisationResultsClone.push({
                    id: "67471938bafff850080488b7",
                    source: "default",
                    type: "dogTag",
                });

                customisationResultsClone.push({
                    id: "67471928d17d6431550563b5",
                    source: "default",
                    type: "dogTag",
                });

                customisationResultsClone.push({
                    id: "6747193f170146228c0d2226",
                    source: "default",
                    type: "dogTag",
                });
                break;
        }

        const pretigeLevel = profile?.characters?.pmc?.Info?.PrestigeLevel;
        if (pretigeLevel) {
            if (pretigeLevel >= 1) {
                customisationResultsClone.push({
                    id: "674dbf593bee1152d407f005",
                    source: "default",
                    type: "dogTag",
                });
            }

            if (pretigeLevel >= 2) {
                customisationResultsClone.push({
                    id: "675dcfea7ae1a8792107ca99",
                    source: "default",
                    type: "dogTag",
                });
            }
        }

        return customisationResultsClone;
    }

    protected getGameEdition(profile: ISptProfile): string {
        const edition = profile.characters?.pmc?.Info?.GameVersion;
        if (!edition) {
            // Edge case - profile not created yet, fall back to what launcher has set
            const launcherEdition = profile.info.edition;
            switch (launcherEdition.toLowerCase()) {
                case "edge of darkness":
                    return GameEditions.EDGE_OF_DARKNESS;
                case "unheard":
                    return GameEditions.UNHEARD;
                default:
                    return GameEditions.STANDARD;
            }
        }

        return edition;
    }

    /** Handle CustomizationSet event */
    public setClothing(
        sessionId: string,
        request: ICustomizationSetRequest,
        pmcData: IPmcData,
    ): IItemEventRouterResponse {
        for (const customisation of request.customizations) {
            pmcData.Customization[customisation.type] = customisation.id;
        }

        return this.eventOutputHolder.getOutput(sessionId);
    }
}
