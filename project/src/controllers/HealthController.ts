import { inject, injectable } from "tsyringe";

import { HealthHelper } from "@spt-aki/helpers/HealthHelper";
import { InventoryHelper } from "@spt-aki/helpers/InventoryHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { BodyPart, IHealthTreatmentRequestData } from "@spt-aki/models/eft/health/IHealthTreatmentRequestData";
import { IOffraidEatRequestData } from "@spt-aki/models/eft/health/IOffraidEatRequestData";
import { IOffraidHealRequestData } from "@spt-aki/models/eft/health/IOffraidHealRequestData";
import { ISyncHealthRequestData } from "@spt-aki/models/eft/health/ISyncHealthRequestData";
import { IWorkoutData } from "@spt-aki/models/eft/health/IWorkoutData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { IProcessBuyTradeRequestData } from "@spt-aki/models/eft/trade/IProcessBuyTradeRequestData";
import { Traders } from "@spt-aki/models/enums/Traders";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { PaymentService } from "@spt-aki/services/PaymentService";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";

@injectable()
export class HealthController
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PaymentService") protected paymentService: PaymentService,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("HealthHelper") protected healthHelper: HealthHelper,
    )
    {}

    /**
     * stores in-raid player health
     * @param pmcData Player profile
     * @param info Request data
     * @param sessionID Player id
     * @param addEffects Should effects found be added or removed from profile
     * @param deleteExistingEffects Should all prior effects be removed before apply new ones
     */
    public saveVitality(
        pmcData: IPmcData,
        info: ISyncHealthRequestData,
        sessionID: string,
        addEffects = true,
        deleteExistingEffects = true,
    ): void
    {
        this.healthHelper.saveVitality(pmcData, info, sessionID, addEffects, deleteExistingEffects);
    }

    /**
     * When healing in menu
     * @param pmcData Player profile
     * @param request Healing request
     * @param sessionID Player id
     * @returns IItemEventRouterResponse
     */
    public offraidHeal(pmcData: IPmcData, request: IOffraidHealRequestData, sessionID: string): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionID);

        // Update medkit used (hpresource)
        const healingItemToUse = pmcData.Inventory.items.find((item) => item._id === request.item);
        if (!healingItemToUse)
        {
            const errorMessage = this.localisationService.getText(
                "health-healing_item_not_found",
                healingItemToUse._id,
            );
            this.logger.error(errorMessage);

            return this.httpResponse.appendErrorToOutput(output, errorMessage);
        }

        // Ensure item has a upd object
        this.itemHelper.addUpdObjectToItem(healingItemToUse);

        if (healingItemToUse.upd.MedKit)
        {
            healingItemToUse.upd.MedKit.HpResource -= request.count;
        }
        else
        {
            // Get max healing from db
            const maxhp = this.itemHelper.getItem(healingItemToUse._tpl)[1]._props.MaxHpResource;
            healingItemToUse.upd.MedKit = { HpResource: maxhp - request.count }; // Subtract amout used from max
        }

        // Resource in medkit is spent, delete it
        if (healingItemToUse.upd.MedKit.HpResource <= 0)
        {
            this.inventoryHelper.removeItem(pmcData, request.item, sessionID, output);
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
    public offraidEat(pmcData: IPmcData, request: IOffraidEatRequestData, sessionID: string): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionID);
        let resourceLeft = 0;

        const itemToConsume = pmcData.Inventory.items.find((x) => x._id === request.item);
        if (!itemToConsume)
        {
            // Item not found, very bad
            return this.httpResponse.appendErrorToOutput(
                output,
                this.localisationService.getText("health-unable_to_find_item_to_consume", request.item),
            );
        }

        const consumedItemMaxResource = this.itemHelper.getItem(itemToConsume._tpl)[1]._props.MaxResource;
        if (consumedItemMaxResource > 1)
        {
            if (itemToConsume.upd.FoodDrink === undefined)
            {
                itemToConsume.upd.FoodDrink = { HpPercent: consumedItemMaxResource - request.count };
            }
            else
            {
                itemToConsume.upd.FoodDrink.HpPercent -= request.count;
            }

            resourceLeft = itemToConsume.upd.FoodDrink.HpPercent;
        }

        // Remove item from inventory if resource has dropped below threshold
        if (consumedItemMaxResource === 1 || resourceLeft < 1)
        {
            this.inventoryHelper.removeItem(pmcData, request.item, sessionID, output);
        }

        return output;
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
    ): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionID);
        const payMoneyRequest: IProcessBuyTradeRequestData = {
            Action: healthTreatmentRequest.Action,
            tid: Traders.THERAPIST,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            scheme_items: healthTreatmentRequest.items,
            type: "",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            item_id: "",
            count: 0,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            scheme_id: 0,
        };

        this.paymentService.payMoney(pmcData, payMoneyRequest, sessionID, output);
        if (output.warnings.length > 0)
        {
            return output;
        }

        for (const bodyPartKey in healthTreatmentRequest.difference.BodyParts)
        {
            // Get body part from request + from pmc profile
            const partRequest: BodyPart = healthTreatmentRequest.difference.BodyParts[bodyPartKey];
            const profilePart = pmcData.Health.BodyParts[bodyPartKey];

            // Bodypart healing is chosen when part request hp is above 0
            if (partRequest.Health > 0)
            {
                // Heal bodypart
                profilePart.Health.Current = profilePart.Health.Maximum;
            }

            // Check for effects to remove
            if (partRequest.Effects?.length > 0)
            {
                // Found some, loop over them and remove from pmc profile
                for (const effect of partRequest.Effects)
                {
                    delete pmcData.Health.BodyParts[bodyPartKey].Effects[effect];
                }

                // Remove empty effect object
                if (Object.keys(pmcData.Health.BodyParts[bodyPartKey].Effects).length === 0)
                {
                    delete pmcData.Health.BodyParts[bodyPartKey].Effects;
                }
            }
        }

        // Inform client of new post-raid, post-therapist heal values
        output.profileChanges[sessionID].health = this.jsonUtil.clone(pmcData.Health);

        return output;
    }

    /**
     * applies skills from hideout workout.
     * @param pmcData Player profile
     * @param info Request data
     * @param sessionID
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public applyWorkoutChanges(pmcData: IPmcData, info: IWorkoutData, sessionId: string): void
    {
        // https://dev.sp-tarkov.com/SPT-AKI/Server/issues/2674
        // TODO:
        // Health effects (fractures etc) are handled in /player/health/sync.
        pmcData.Skills.Common = info.skills.Common;
    }
}
