import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import {
    CustomisationSource,
    CustomisationType,
    type ICustomisationStorage,
} from "@spt/models/eft/common/tables/ICustomisationStorage";
import type { ISuit } from "@spt/models/eft/common/tables/ITrader";
import type {
    IBuyClothingRequestData,
    IPaymentItemForClothing,
} from "@spt/models/eft/customization/IBuyClothingRequestData";
import type {
    CustomizationSetOption,
    ICustomizationSetRequest,
} from "@spt/models/eft/customization/ICustomizationSetRequest";
import type { IHideoutCustomisation } from "@spt/models/eft/hideout/IHideoutCustomisation";
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IProcessBuyTradeRequestData } from "@spt/models/eft/trade/IProcessBuyTradeRequestData";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { PaymentService } from "@spt/services/PaymentService";
import type { ICloner } from "@spt/utils/cloners/ICloner";
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
        @inject("PaymentService") protected paymentService: PaymentService,
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
     * Handle CustomizationBuy event
     * Purchase/unlock a clothing item from a trader
     * @param pmcData Player profile
     * @param buyClothingRequest Request object
     * @param sessionId Session id
     * @returns IItemEventRouterResponse
     */
    public buyCustomisation(
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

        // TODO: Merge with function this.profileHelper.addHideoutCustomisationUnlock
        const rewardToStore: ICustomisationStorage = {
            id: suitId,
            source: CustomisationSource.UNLOCKED_IN_GAME,
            type: CustomisationType.SUITE,
        };
        this.saveServer.getProfile(sessionId).customisationUnlocks.push(rewardToStore);

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
        const fullProfile = this.profileHelper.getFullProfile(sessionID);

        // Check if clothing can be found by id
        return !!fullProfile?.customisationUnlocks.find((customisation) => customisation.id === suitId);
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
            const request: IProcessBuyTradeRequestData = {
                scheme_items: [
                    {
                        id: inventoryItemToProcess.id,
                        count: inventoryItemToProcess.count,
                    },
                ],
                tid: "5ac3b934156ae10c4430e83c",
                Action: "buy_from_trader",
                type: "",
                item_id: "",
                count: 0,
                scheme_id: 0,
            };
            this.paymentService.payMoney(pmcData, request, sessionId, output);
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

        const profile = this.profileHelper.getFullProfile(sessionID);
        if (!profile) {
            return customisationResultsClone;
        }

        // Append customisations unlocked by player to results
        customisationResultsClone.push(...(profile.customisationUnlocks ?? []));

        return customisationResultsClone;
    }

    /** Handle CustomizationSet event */
    public setCustomisation(
        sessionId: string,
        request: ICustomizationSetRequest,
        pmcData: IPmcData,
    ): IItemEventRouterResponse {
        for (const customisation of request.customizations) {
            switch (customisation.type) {
                case "dogTag":
                    pmcData.Customization.DogTag = customisation.id;
                    break;
                case "suite":
                    this.applyClothingItemToProfile(customisation, pmcData);
                    break;
                default:
                    this.logger.error(`Unhandled customisation type: ${customisation.type}`);
                    break;
            }
        }

        return this.eventOutputHolder.getOutput(sessionId);
    }

    /**
     * Applies a purchsed suit to the players doll
     * @param customisation Suit to apply to profile
     * @param pmcData Profile to update
     */
    protected applyClothingItemToProfile(customisation: CustomizationSetOption, pmcData: IPmcData): void {
        const dbSuit = this.databaseService.getCustomization()[customisation.id];
        if (!dbSuit) {
            this.logger.error(
                `Unable to find suit customisation id: ${customisation.id}, cannot apply clothing to player profile: ${pmcData._id}`,
            );

            return;
        }

        // Body
        if (dbSuit._parent === this.clothingIds.upperParentId) {
            pmcData.Customization.Body = dbSuit._props.Body;
            pmcData.Customization.Hands = dbSuit._props.Hands;

            return;
        }

        // Feet
        if (dbSuit._parent === this.clothingIds.lowerParentId) {
            pmcData.Customization.Feet = dbSuit._props.Feet;
        }
    }
}
