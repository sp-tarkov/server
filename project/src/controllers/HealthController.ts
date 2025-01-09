import { HealthHelper } from "@spt/helpers/HealthHelper";
import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IBodyPartHealth, ICurrentMax } from "@spt/models/eft/common/tables/IBotBase";
import { IBodyPart, IHealthTreatmentRequestData } from "@spt/models/eft/health/IHealthTreatmentRequestData";
import { IOffraidEatRequestData } from "@spt/models/eft/health/IOffraidEatRequestData";
import { IOffraidHealRequestData } from "@spt/models/eft/health/IOffraidHealRequestData";
import { IWorkoutData } from "@spt/models/eft/health/IWorkoutData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IProcessBuyTradeRequestData } from "@spt/models/eft/trade/IProcessBuyTradeRequestData";
import { Traders } from "@spt/models/enums/Traders";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { LocalisationService } from "@spt/services/LocalisationService";
import { PaymentService } from "@spt/services/PaymentService";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class HealthController {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PaymentService") protected paymentService: PaymentService,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("HealthHelper") protected healthHelper: HealthHelper,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {}

    /**
     * When healing in menu
     * @param pmcData Player profile
     * @param request Healing request
     * @param sessionID Player id
     * @returns IItemEventRouterResponse
     */
    public offraidHeal(
        pmcData: IPmcData,
        request: IOffraidHealRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionID);

        // Update medkit used (hpresource)
        const healingItemToUse = pmcData.Inventory.items.find((item) => item._id === request.item);
        if (!healingItemToUse) {
            const errorMessage = this.localisationService.getText("health-healing_item_not_found", request.item);
            this.logger.error(errorMessage);

            return this.httpResponse.appendErrorToOutput(output, errorMessage);
        }

        // Ensure item has a upd object
        this.itemHelper.addUpdObjectToItem(healingItemToUse);

        if (healingItemToUse.upd.MedKit) {
            healingItemToUse.upd.MedKit.HpResource -= request.count;
        } else {
            // Get max healing from db
            const maxhp = this.itemHelper.getItem(healingItemToUse._tpl)[1]._props.MaxHpResource;
            healingItemToUse.upd.MedKit = { HpResource: maxhp - request.count }; // Subtract amout used from max
            // request.count appears to take into account healing effects removed, e.g. bleeds
            // Salewa heals limb for 20 and fixes light bleed = (20+45 = 65)
        }

        // Resource in medkit is spent, delete it
        if (healingItemToUse.upd.MedKit.HpResource <= 0) {
            this.inventoryHelper.removeItem(pmcData, request.item, sessionID, output);
        }

        const healingItemDbDetails = this.itemHelper.getItem(healingItemToUse._tpl);

        const healItemEffectDetails = healingItemDbDetails[1]._props.effects_damage;
        const bodyPartToHeal: IBodyPartHealth = pmcData.Health.BodyParts[request.part];
        if (!bodyPartToHeal) {
            this.logger.warning(`Player: ${sessionID} Tried to heal a non-existent body part: ${request.part}`);

            return output;
        }

        // Get inital heal amount
        let amountToHealLimb = request.count;

        // Check if healing item removes negative effects
        const itemRemovesEffects = Object.keys(healingItemDbDetails[1]._props.effects_damage).length > 0;
        if (itemRemovesEffects && bodyPartToHeal.Effects) {
            // Can remove effects and limb has effects to remove
            const effectsOnBodyPart = Object.keys(bodyPartToHeal.Effects);
            for (const effectKey of effectsOnBodyPart) {
                // Check if healing item removes the effect on limb
                const matchingEffectFromHealingItem = healItemEffectDetails[effectKey];
                if (!matchingEffectFromHealingItem) {
                    // Healing item doesnt have matching effect, it doesnt remove the effect
                    continue;
                }

                // Adjust limb heal amount based on if its fixing an effect (request.count is TOTAL cost of hp resource on heal item, NOT amount to heal limb)
                amountToHealLimb -= matchingEffectFromHealingItem.cost ?? 0;
                delete bodyPartToHeal.Effects[effectKey];
            }
        }

        // Adjust body part hp value
        bodyPartToHeal.Health.Current += amountToHealLimb;

        // Ensure we've not healed beyond the limbs max hp
        if (bodyPartToHeal.Health.Current > bodyPartToHeal.Health.Maximum) {
            bodyPartToHeal.Health.Current = bodyPartToHeal.Health.Maximum;
        }

        return output;
    }

    /**
     * Handle Eat event
     * Consume food/water outside of a raid
     * @param pmcData Player profile
     * @param request Eat request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public offraidEat(pmcData: IPmcData, request: IOffraidEatRequestData, sessionID: string): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionID);
        let resourceLeft = 0;

        const itemToConsume = pmcData.Inventory.items.find((item) => item._id === request.item);
        if (!itemToConsume) {
            // Item not found, very bad
            return this.httpResponse.appendErrorToOutput(
                output,
                this.localisationService.getText("health-unable_to_find_item_to_consume", request.item),
            );
        }

        const consumedItemMaxResource = this.itemHelper.getItem(itemToConsume._tpl)[1]._props.MaxResource;
        if (consumedItemMaxResource > 1) {
            // Ensure item has a upd object
            this.itemHelper.addUpdObjectToItem(itemToConsume);

            if (itemToConsume.upd.FoodDrink === undefined) {
                itemToConsume.upd.FoodDrink = { HpPercent: consumedItemMaxResource - request.count };
            } else {
                itemToConsume.upd.FoodDrink.HpPercent -= request.count;
            }

            resourceLeft = itemToConsume.upd.FoodDrink.HpPercent;
        }

        // Remove item from inventory if resource has dropped below threshold
        if (consumedItemMaxResource === 1 || resourceLeft < 1) {
            this.inventoryHelper.removeItem(pmcData, request.item, sessionID, output);
        }

        // Check what effect eating item has and handle
        const foodItemDbDetails = this.itemHelper.getItem(itemToConsume._tpl);
        const foodItemEffectDetails = foodItemDbDetails[1]._props.effects_health;
        const foodIsSingleUse = foodItemDbDetails[1]._props.MaxResource === 1;

        for (const effectKey of Object.keys(foodItemEffectDetails)) {
            const consumptionDetails = foodItemEffectDetails[effectKey];
            switch (effectKey) {
                case "Hydration":
                    applyEdibleEffect(pmcData.Health.Hydration, consumptionDetails);
                    break;
                case "Energy":
                    applyEdibleEffect(pmcData.Health.Energy, consumptionDetails);
                    break;

                default:
                    this.logger.warning(`Unhandled effect after consuming: ${itemToConsume._tpl}, ${effectKey}`);
                    break;
            }
        }

        return output;

        function applyEdibleEffect(bodyValue: ICurrentMax, consumptionDetails: Record<string, number>) {
            if (foodIsSingleUse) {
                // Apply whole value from passed in parameter
                bodyValue.Current += consumptionDetails.value;
            } else {
                bodyValue.Current += request.count;
            }

            // Ensure current never goes over max
            if (bodyValue.Current > bodyValue.Maximum) {
                bodyValue.Current = bodyValue.Maximum;

                return;
            }

            // Same as above but for the lower bound
            if (bodyValue.Current < 0) {
                bodyValue.Current = 0;
            }
        }
    }

    /**
     * Handle RestoreHealth event
     * Occurs on post-raid healing page
     * @param pmcData player profile
     * @param healthTreatmentRequest Request data from client
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public healthTreatment(
        pmcData: IPmcData,
        healthTreatmentRequest: IHealthTreatmentRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionID);
        const payMoneyRequest: IProcessBuyTradeRequestData = {
            Action: healthTreatmentRequest.Action,
            tid: Traders.THERAPIST,
            scheme_items: healthTreatmentRequest.items,
            type: "",
            item_id: "",
            count: 0,
            scheme_id: 0,
        };

        this.paymentService.payMoney(pmcData, payMoneyRequest, sessionID, output);
        if (output.warnings.length > 0) {
            return output;
        }

        for (const bodyPartKey in healthTreatmentRequest.difference.BodyParts) {
            // Get body part from request + from pmc profile
            const partRequest: IBodyPart = healthTreatmentRequest.difference.BodyParts[bodyPartKey];
            const profilePart = pmcData.Health.BodyParts[bodyPartKey];

            // Bodypart healing is chosen when part request hp is above 0
            if (partRequest.Health > 0) {
                // Heal bodypart
                profilePart.Health.Current = profilePart.Health.Maximum;
            }

            // Check for effects to remove
            if (partRequest.Effects?.length > 0) {
                // Found some, loop over them and remove from pmc profile
                for (const effect of partRequest.Effects) {
                    delete pmcData.Health.BodyParts[bodyPartKey].Effects[effect];
                }

                // Remove empty effect object
                if (Object.keys(pmcData.Health.BodyParts[bodyPartKey].Effects).length === 0) {
                    // biome-ignore lint/performance/noDelete: Delete is fine here as we entirely want to get rid of the effect.
                    delete pmcData.Health.BodyParts[bodyPartKey].Effects;
                }
            }
        }

        // Inform client of new post-raid, post-therapist heal values
        output.profileChanges[sessionID].health = this.cloner.clone(pmcData.Health);

        return output;
    }

    /**
     * applies skills from hideout workout.
     * @param pmcData Player profile
     * @param info Request data
     * @param sessionID
     */
    public applyWorkoutChanges(pmcData: IPmcData, info: IWorkoutData, sessionId: string): void {
        // https://dev.sp-tarkov.com/SPT/Server/issues/2674
        // TODO:
        // Health effects (fractures etc) are handled in /player/health/sync.
        pmcData.Skills.Common = info.skills.Common;
    }
}
