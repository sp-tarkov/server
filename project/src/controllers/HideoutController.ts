import { inject, injectable } from "tsyringe";

import { ScavCaseRewardGenerator } from "../generators/ScavCaseRewardGenerator";
import { HideoutHelper } from "../helpers/HideoutHelper";
import { InventoryHelper } from "../helpers/InventoryHelper";
import { PaymentHelper } from "../helpers/PaymentHelper";
import { PresetHelper } from "../helpers/PresetHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { HideoutArea, Product, Production, ScavCase } from "../models/eft/common/tables/IBotBase";
import { Upd } from "../models/eft/common/tables/IItem";
import {
    HideoutUpgradeCompleteRequestData
} from "../models/eft/hideout/HideoutUpgradeCompleteRequestData";
import { IHandleQTEEventRequestData } from "../models/eft/hideout/IHandleQTEEventRequestData";
import {
    IHideoutContinuousProductionStartRequestData
} from "../models/eft/hideout/IHideoutContinuousProductionStartRequestData";
import {
    IHideoutImproveAreaRequestData
} from "../models/eft/hideout/IHideoutImproveAreaRequestData";
import { IHideoutProduction } from "../models/eft/hideout/IHideoutProduction";
import { IHideoutPutItemInRequestData } from "../models/eft/hideout/IHideoutPutItemInRequestData";
import {
    IHideoutScavCaseStartRequestData
} from "../models/eft/hideout/IHideoutScavCaseStartRequestData";
import {
    IHideoutSingleProductionStartRequestData
} from "../models/eft/hideout/IHideoutSingleProductionStartRequestData";
import {
    IHideoutTakeItemOutRequestData
} from "../models/eft/hideout/IHideoutTakeItemOutRequestData";
import {
    IHideoutTakeProductionRequestData
} from "../models/eft/hideout/IHideoutTakeProductionRequestData";
import { IHideoutToggleAreaRequestData } from "../models/eft/hideout/IHideoutToggleAreaRequestData";
import { IHideoutUpgradeRequestData } from "../models/eft/hideout/IHideoutUpgradeRequestData";
import { IQteData } from "../models/eft/hideout/IQteData";
import { IRecordShootingRangePoints } from "../models/eft/hideout/IRecordShootingRangePoints";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { HideoutAreas } from "../models/enums/HideoutAreas";
import { SkillTypes } from "../models/enums/SkillTypes";
import { IHideoutConfig } from "../models/spt/config/IHideoutConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { EventOutputHolder } from "../routers/EventOutputHolder";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { SaveServer } from "../servers/SaveServer";
import { FenceService } from "../services/FenceService";
import { LocalisationService } from "../services/LocalisationService";
import { PlayerService } from "../services/PlayerService";
import { HashUtil } from "../utils/HashUtil";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";
import { JsonUtil } from "../utils/JsonUtil";
import { RandomUtil } from "../utils/RandomUtil";
import { TimeUtil } from "../utils/TimeUtil";

@injectable()
export class HideoutController
{
    protected static nameBackendCountersCrafting = "CounterHoursCrafting";
    protected hideoutConfig: IHideoutConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("PlayerService") protected playerService: PlayerService,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("HideoutHelper") protected hideoutHelper: HideoutHelper,
        @inject("ScavCaseRewardGenerator") protected scavCaseRewardGenerator: ScavCaseRewardGenerator,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("FenceService") protected fenceService: FenceService
    )
    {
        this.hideoutConfig = this.configServer.getConfig(ConfigTypes.HIDEOUT);
    }

    /**
     * Start a hideout area upgrade
     * @param pmcData Player profile
     * @param request upgrade start request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public startUpgrade(pmcData: IPmcData, request: IHideoutUpgradeRequestData, sessionID: string): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionID);
        const items = request.items.map(reqItem =>
        {
            const item = pmcData.Inventory.items.find(invItem => invItem._id === reqItem.id);
            return {
                inventoryItem: item,
                requestedItem: reqItem
            };
        });

        // If it's not money, its construction / barter items
        for (const item of items)
        {
            if (!item.inventoryItem)
            {
                this.logger.error(this.localisationService.getText("hideout-unable_to_find_item_in_inventory", item.requestedItem.id));
                return this.httpResponse.appendErrorToOutput(output);
            }

            if (this.paymentHelper.isMoneyTpl(item.inventoryItem._tpl)
                && item.inventoryItem.upd
                && item.inventoryItem.upd.StackObjectsCount
                && item.inventoryItem.upd.StackObjectsCount > item.requestedItem.count)
            {
                item.inventoryItem.upd.StackObjectsCount -= item.requestedItem.count;
            }
            else
            {
                this.inventoryHelper.removeItem(pmcData, item.inventoryItem._id, sessionID, output);
            }
        }

        // Construction time management
        const hideoutArea = pmcData.Hideout.Areas.find(area => area.type === request.areaType);
        if (!hideoutArea)
        {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_area", request.areaType));
            return this.httpResponse.appendErrorToOutput(output);
        }

        const hideoutData = this.databaseServer.getTables().hideout.areas.find(area => area.type === request.areaType);

        if (!hideoutData)
        {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_area_in_database", request.areaType));
            return this.httpResponse.appendErrorToOutput(output);
        }

        const ctime = hideoutData.stages[hideoutArea.level + 1].constructionTime;

        if (ctime > 0)
        {
            const timestamp = this.timeUtil.getTimestamp();

            hideoutArea.completeTime = timestamp + ctime;
            hideoutArea.constructing = true;
        }

        return output;
    }

    /**
     * Complete a hideout area upgrade
     * @param pmcData Player profile
     * @param request Completed upgrade request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public upgradeComplete(pmcData: IPmcData, request: HideoutUpgradeCompleteRequestData, sessionID: string): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionID);

        const hideoutArea = pmcData.Hideout.Areas.find(area => area.type === request.areaType);
        if (!hideoutArea)
        {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_area", request.areaType));
            return this.httpResponse.appendErrorToOutput(output);
        }

        // Upgrade area
        hideoutArea.level++;
        hideoutArea.completeTime = 0;
        hideoutArea.constructing = false;

        const hideoutData = this.databaseServer.getTables().hideout.areas.find(area => area.type === hideoutArea.type);
        if (!hideoutData)
        {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_area_in_database", request.areaType));
            return this.httpResponse.appendErrorToOutput(output);
        }

        // Apply bonuses
        const bonuses = hideoutData.stages[hideoutArea.level].bonuses;
        if (bonuses?.length > 0)
        {
            for (const bonus of bonuses)
            {
                this.hideoutHelper.applyPlayerUpgradesBonuses(pmcData, bonus);
            }
        }

        // Add Skill Points Per Area Upgrade
        this.playerService.incrementSkillLevel(pmcData, SkillTypes.HIDEOUT_MANAGEMENT, this.databaseServer.getTables().globals.config.SkillsSettings.HideoutManagement.SkillPointsPerAreaUpgrade);

        return output;
    }

    /**
     * Handle HideoutPutItemsInAreaSlots
     * Create item in hideout slot item array, remove item from player inventory
     * @param pmcData Profile data
     * @param addItemToHideoutRequest reqeust from client to place item in area slot
     * @param sessionID Session id
     * @returns IItemEventRouterResponse object
     */
    public putItemsInAreaSlots(pmcData: IPmcData, addItemToHideoutRequest: IHideoutPutItemInRequestData, sessionID: string): IItemEventRouterResponse
    {
        let output = this.eventOutputHolder.getOutput(sessionID);

        const itemsToAdd = Object.entries(addItemToHideoutRequest.items).map(kvp =>
        {
            const item = pmcData.Inventory.items.find(invItem => invItem._id === kvp[1]["id"]);
            return {
                inventoryItem: item,
                requestedItem: kvp[1],
                slot: kvp[0]
            };
        });

        const hideoutArea = pmcData.Hideout.Areas.find(area => area.type === addItemToHideoutRequest.areaType);
        if (!hideoutArea)
        {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_area_in_database", addItemToHideoutRequest.areaType));
            return this.httpResponse.appendErrorToOutput(output);
        }

        for (const item of itemsToAdd)
        {
            if (!item.inventoryItem)
            {
                this.logger.error(this.localisationService.getText("hideout-unable_to_find_item_in_inventory", {itemId: item.requestedItem["id"], area: hideoutArea.type}));
                return this.httpResponse.appendErrorToOutput(output);
            }

            // Add item to area.slots
            const destinationLocationIndex = Number(item.slot);
            const hideoutSlotIndex = hideoutArea.slots.findIndex(x => x.locationIndex === destinationLocationIndex);
            hideoutArea.slots[hideoutSlotIndex].item = [{
                _id: item.inventoryItem._id,
                _tpl: item.inventoryItem._tpl,
                upd: item.inventoryItem.upd
            }];

            output = this.inventoryHelper.removeItem(pmcData, item.inventoryItem._id, sessionID, output);
        }        

        // Trigger a forced update
        this.hideoutHelper.updatePlayerHideout(sessionID);

        return output;
    }

    /**
     * Remove item from hideout area and place into player inventory
     * @param pmcData Player profile
     * @param request Take item out of area request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public takeItemsFromAreaSlots(pmcData: IPmcData, request: IHideoutTakeItemOutRequestData, sessionID: string): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionID);

        const hideoutArea = pmcData.Hideout.Areas.find(area => area.type === request.areaType);
        if (!hideoutArea)
        {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_area", request.areaType));
            return this.httpResponse.appendErrorToOutput(output);
        }

        if (!hideoutArea.slots || hideoutArea.slots.length === 0)
        {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_item_to_remove_from_area", hideoutArea.type));
            return this.httpResponse.appendErrorToOutput(output);
        }

        // Handle areas that have resources that can be placed in/taken out of slots from the area
        if ([HideoutAreas.AIR_FILTERING, HideoutAreas.WATER_COLLECTOR, HideoutAreas.GENERATOR, HideoutAreas.BITCOIN_FARM].includes(hideoutArea.type))
        {
            const response = this.removeResourceFromArea(sessionID, pmcData, request, output, hideoutArea);
            this.update();
            return response;
        }

        throw new Error(this.localisationService.getText("hideout-unhandled_remove_item_from_area_request", hideoutArea.type));
    }

    /**
     * Find resource item in hideout area, add copy to player inventory, remove Item from hideout slot
     * @param sessionID Session id
     * @param pmcData Profile to update
     * @param removeResourceRequest client request
     * @param output response to send to client
     * @param hideoutArea Area fuel is being removed from
     * @returns IItemEventRouterResponse response
     */
    protected removeResourceFromArea(sessionID: string, pmcData: IPmcData, removeResourceRequest: IHideoutTakeItemOutRequestData, output: IItemEventRouterResponse, hideoutArea: HideoutArea): IItemEventRouterResponse
    {
        const slotIndexToRemove = removeResourceRequest.slots[0];

        const itemToReturn = hideoutArea.slots.find(x => x.locationIndex === slotIndexToRemove).item[0];
        
        const newReq = {
            items: [{
                // eslint-disable-next-line @typescript-eslint/naming-convention
                item_id: itemToReturn._tpl,
                count: 1
            }],
            tid: "ragfair"
        };

        output = this.inventoryHelper.addItem(pmcData, newReq, output, sessionID, null, !!itemToReturn.upd.SpawnedInSession, itemToReturn.upd);

        // If addItem returned with errors, drop out
        if (output.warnings && output.warnings.length > 0)
        {
            return output;
        }

        // Remove items from slot, locationIndex remains
        const hideoutSlotIndex = hideoutArea.slots.findIndex(x => x.locationIndex === slotIndexToRemove);
        hideoutArea.slots[hideoutSlotIndex].item = undefined;

        return output;
    }

    /**
     * Toggle area on/off
     * @param pmcData Player profile
     * @param request Toggle area request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public toggleArea(pmcData: IPmcData, request: IHideoutToggleAreaRequestData, sessionID: string): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionID);

        const hideoutArea = pmcData.Hideout.Areas.find(area => area.type === request.areaType);
        if (!hideoutArea)
        {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_area", request.areaType));
            return this.httpResponse.appendErrorToOutput(output);
        }

        hideoutArea.active = request.enabled;

        return output;
    }

    /**
     * Start production for an item from hideout area
     * @param pmcData Player profile
     * @param body Start prodution of single item request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public singleProductionStart(pmcData: IPmcData, body: IHideoutSingleProductionStartRequestData, sessionID: string): IItemEventRouterResponse
    {
        // Start production
        this.registerProduction(pmcData, body, sessionID);

        // Find the recipe of the production
        const recipe = this.databaseServer.getTables().hideout.production.find(p => p._id === body.recipeId);
        // Find the actual amount of items we need to remove because body can send weird data
        const requirements = this.jsonUtil.clone(recipe.requirements.filter(i => i.type === "Item"));

        const output = this.eventOutputHolder.getOutput(sessionID);

        for (const itemToDelete of body.items)
        {
            const itemToCheck = pmcData.Inventory.items.find(i => i._id === itemToDelete.id);
            const requirement = requirements.find(requirement => requirement.templateId === itemToCheck._tpl);
            if (requirement.count <= 0)
                continue;
            this.inventoryHelper.removeItemByCount(pmcData, itemToDelete.id, requirement.count, sessionID, output);
            requirement.count -= itemToDelete.count;
        }

        return output;
    }

    /**
     * Handles event after clicking 'start' on the scav case hideout page
     * @param pmcData player profile
     * @param body client request object
     * @param sessionID session id
     * @returns item event router response
     */
    public scavCaseProductionStart(pmcData: IPmcData, body: IHideoutScavCaseStartRequestData, sessionID: string): IItemEventRouterResponse
    {
        let output = this.eventOutputHolder.getOutput(sessionID);

        for (const requestedItem of body.items)
        {
            const inventoryItem = pmcData.Inventory.items.find(item => item._id === requestedItem.id);
            if (!inventoryItem)
            {
                this.logger.error(this.localisationService.getText("hideout-unable_to_find_scavcase_requested_item_in_profile_inventory", requestedItem.id));
                return this.httpResponse.appendErrorToOutput(output);
            }

            if (inventoryItem.upd?.StackObjectsCount
                && inventoryItem.upd.StackObjectsCount > requestedItem.count)
            {
                inventoryItem.upd.StackObjectsCount -= requestedItem.count;
            }
            else
            {
                output = this.inventoryHelper.removeItem(pmcData, requestedItem.id, sessionID, output);
            }
        }

        const recipe = this.databaseServer.getTables().hideout.scavcase.find(r => r._id === body.recipeId);
        if (!recipe)
        {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_scav_case_recipie_in_database", body.recipeId));
            return this.httpResponse.appendErrorToOutput(output);
        }
        
        // @Important: Here we need to be very exact:
        // - normal recipe: Production time value is stored in attribute "productionType" with small "p"
        // - scav case recipe: Production time value is stored in attribute "ProductionType" with capital "P"
        const modifiedScavCaseTime = this.getScavCaseTime(pmcData, recipe.ProductionTime);

        pmcData.Hideout.Production[body.recipeId] = this.hideoutHelper.initProduction(body.recipeId, modifiedScavCaseTime);
        pmcData.Hideout.Production[body.recipeId].sptIsScavCase = true;

        return output;
    }

    /**
     * Adjust scav case time based on fence standing
     * 
     * @param pmcData Player profile
     * @param productionTime Time to complete scav case in seconds
     * @returns Adjusted scav case time in seconds
     */
    protected getScavCaseTime(pmcData: IPmcData, productionTime: number): number
    {
        const fenceLevel = this.fenceService.getFenceInfo(pmcData);
        if (!fenceLevel)
        {
            return productionTime;
        }
    
        return productionTime * fenceLevel.ScavCaseTimeModifier;
    }

    /**
     * Add generated scav case rewards to player profile
     * @param pmcData player profile to add rewards to
     * @param rewards reward items to add to profile
     * @param recipieId recipie id to save into Production dict
     */
    protected addScavCaseRewardsToProfile(pmcData: IPmcData, rewards: Product[], recipieId: string): void
    {
        pmcData.Hideout.Production[`ScavCase${recipieId}`] = {
            Products: rewards
        };
    }

    /**
     * Start production of continuously created item
     * @param pmcData Player profile
     * @param request Continious production request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public continuousProductionStart(pmcData: IPmcData, request: IHideoutContinuousProductionStartRequestData, sessionID: string): IItemEventRouterResponse
    {
        this.registerProduction(pmcData, request, sessionID);

        return this.eventOutputHolder.getOutput(sessionID);
    }

    /**
     * Take completed item out of hideout area and place into player inventory
     * @param pmcData Player profile
     * @param request Remove production from area request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public takeProduction(pmcData: IPmcData, request: IHideoutTakeProductionRequestData, sessionID: string): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionID);

        if (request.recipeId === HideoutHelper.bitcoinFarm)
        {
            return this.hideoutHelper.getBTC(pmcData, request, sessionID);
        }

        const recipe = this.databaseServer.getTables().hideout.production.find(r => r._id === request.recipeId);
        if (recipe)
        {
            return this.handleRecipie(sessionID, recipe, pmcData, request, output);
        }

        const scavCase = this.databaseServer.getTables().hideout.scavcase.find(r => r._id === request.recipeId);
        if (scavCase)
        {
            return this.handleScavCase(sessionID, pmcData, request, output);
        }

        this.logger.error(this.localisationService.getText("hideout-unable_to_find_production_in_profile_by_recipie_id", request.recipeId));

        return this.httpResponse.appendErrorToOutput(output);
    }

    /**
     * Take recipie-type production out of hideout area and place into player inventory
     * @param sessionID Session id
     * @param recipe Completed recipie of item
     * @param pmcData Player profile
     * @param request Remove production from area request
     * @param output Output object to update
     * @returns IItemEventRouterResponse
     */
    protected handleRecipie(sessionID: string, recipe: IHideoutProduction, pmcData: IPmcData, request: IHideoutTakeProductionRequestData, output: IItemEventRouterResponse): IItemEventRouterResponse
    {
        // Variables for managemnet of skill
        let craftingExpAmount = 0;

        // ? move the logic of BackendCounters in new method?
        let counterHoursCrafting = pmcData.BackendCounters[HideoutController.nameBackendCountersCrafting];
        if (!counterHoursCrafting)
        {
            pmcData.BackendCounters[HideoutController.nameBackendCountersCrafting] = { "id": HideoutController.nameBackendCountersCrafting, "value": 0 };
            counterHoursCrafting = pmcData.BackendCounters[HideoutController.nameBackendCountersCrafting];
        }
        let hoursCrafting = counterHoursCrafting.value;
        

        // create item and throw it into profile
        let id = recipe.endProduct;

        // replace the base item with its main preset
        if (this.presetHelper.hasPreset(id))
        {
            id = this.presetHelper.getDefaultPreset(id)._id;
        }

        const newReq = {
            items: [{
                // eslint-disable-next-line @typescript-eslint/naming-convention
                item_id: id,
                count: recipe.count
            }],
            tid: "ragfair"
        };

        const entries = Object.entries(pmcData.Hideout.Production);
        let prodId: string;
        for (const x of entries)
        {
            if (this.hideoutHelper.isProductionType(x[1])) // Production or ScavCase
            {
                if ((x[1] as Production).RecipeId === request.recipeId)
                {
                    prodId = x[0]; // set to objects key
                    break;
                }
            }
        }

        if (prodId === undefined)
        {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_production_in_profile_by_recipie_id", request.recipeId));

            return this.httpResponse.appendErrorToOutput(output);
        }

        // check if the recipe is the same as the last one
        const area = pmcData.Hideout.Areas[recipe.areaType];

        if (area && request.recipeId !== area.lastRecipe)
        {
            // 1 point per craft upon the end of production for alternating between 2 different crafting recipes in the same module
            craftingExpAmount += 10;
        }

        // 1 point per 8 hours of crafting
        hoursCrafting += recipe.productionTime;
        if ((hoursCrafting / this.hideoutConfig.hoursForSkillCrafting) >= 1)
        {
            const multiplierCrafting = Math.floor((hoursCrafting / this.hideoutConfig.hoursForSkillCrafting));
            craftingExpAmount += (1 * multiplierCrafting);
            hoursCrafting -= (this.hideoutConfig.hoursForSkillCrafting * multiplierCrafting);
        }

        // increment
        // if addItem passes validation:
        //  - increment skill point for crafting
        //  - delete the production in profile Hideout.Production
        const callback = () =>
        {
            // manager Hideout skill
            // ? use a configuration variable for the value?
            this.playerService.incrementSkillLevel(pmcData, SkillTypes.HIDEOUT_MANAGEMENT, 4);
            //manager Crafting skill
            if (craftingExpAmount > 0)
            {
                this.playerService.incrementSkillLevel(pmcData, SkillTypes.CRAFTING, craftingExpAmount);
            }
            area.lastRecipe = request.recipeId;
            counterHoursCrafting.value = hoursCrafting;

            //delete production
            delete pmcData.Hideout.Production[prodId];
        };

        // Remove the old production from output object before its sent to client
        delete output.profileChanges[sessionID].production[request.recipeId];

        // Handle the isEncoded flag from recipie
        if (recipe.isEncoded)
        {
            const upd: Upd = {
                RecodableComponent: { IsEncoded: true}
            };

            return this.inventoryHelper.addItem(pmcData, newReq, output, sessionID, callback, true, upd);
        }

        return this.inventoryHelper.addItem(pmcData, newReq, output, sessionID, callback, true);
    }

    /**
     * Handles giving rewards stored in player profile to player after clicking 'get rewards'
     * @param sessionID Session id
     * @param pmcData Player profile
     * @param request Get rewards from scavcase craft request
     * @param output Output object to update
     * @returns IItemEventRouterResponse
     */
    protected handleScavCase(sessionID: string, pmcData: IPmcData, request: IHideoutTakeProductionRequestData, output: IItemEventRouterResponse): IItemEventRouterResponse
    {
        const ongoingProductions = Object.entries(pmcData.Hideout.Production);
        let prodId: string;
        for (const x of ongoingProductions)
        {
            if (this.hideoutHelper.isProductionType(x[1])) // Production or ScavCase
            {
                if ((x[1] as ScavCase).RecipeId === request.recipeId)
                {
                    prodId = x[0]; // set to objects key
                    break;
                }
            }
        }

        if (prodId === undefined)
        {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_production_in_profile_by_recipie_id", request.recipeId));

            return this.httpResponse.appendErrorToOutput(output);
        }

        // Create rewards for scav case
        const scavCaseRewards = this.scavCaseRewardGenerator.generate(request.recipeId);

        pmcData.Hideout.Production[prodId].Products = scavCaseRewards;

        // Remove the old production from output object before its sent to client
        delete output.profileChanges[sessionID].production[request.recipeId];

        const itemsToAdd = pmcData.Hideout.Production[prodId].Products.map((x: { _tpl: string; upd?: { StackObjectsCount?: number; }; }) =>
        {
            let id = x._tpl;
            if (this.presetHelper.hasPreset(id))
            {
                id = this.presetHelper.getDefaultPreset(id)._id;
            }
            const numOfItems = !x.upd?.StackObjectsCount
                ? 1
                : x.upd.StackObjectsCount;
            // eslint-disable-next-line @typescript-eslint/naming-convention
            return { item_id: id, count: numOfItems };
        });

        const newReq = {
            items: itemsToAdd,
            tid: "ragfair"
        };

        const callback = () =>
        {
            delete pmcData.Hideout.Production[prodId];
        };

        return this.inventoryHelper.addItem(pmcData, newReq, output, sessionID, callback, true);
    }

    /**
     * Start area production for item
     * @param pmcData Player profile
     * @param request Start production request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public registerProduction(pmcData: IPmcData, request: IHideoutSingleProductionStartRequestData | IHideoutContinuousProductionStartRequestData, sessionID: string): IItemEventRouterResponse
    {
        return this.hideoutHelper.registerProduction(pmcData, request, sessionID);
    }


    /**
     * Get quick time event list for hideout
     * // TODO - implement this
     * @param sessionId Session id
     * @returns IQteData array
    */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getQteList(sessionId: string): IQteData[]
    {
        return this.databaseServer.getTables().hideout.qte;
    }

    /**
     * Handle HideoutQuickTimeEvent on client/game/profile/items/moving
     * Called after completing workout at gym
     * @param sessionId Session id
     * @param pmcData Profile to adjust
     * @param request QTE result object
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public handleQTEEventOutcome(sessionId: string, pmcData: IPmcData, request: IHandleQTEEventRequestData): IItemEventRouterResponse
    {
        // {
        //     "Action": "HideoutQuickTimeEvent",
        //     "results": [true, false, true, true, true, true, true, true, true, false, false, false, false, false, false],
        //     "id": "63b16feb5d012c402c01f6ef",
        //     "timestamp": 1672585349
        // }

        // Skill changes are done in 
        // /client/hideout/workout (applyWorkoutChanges).

        pmcData.Health.Energy.Current -= 50;
        if (pmcData.Health.Energy.Current < 1)
        {
            pmcData.Health.Energy.Current = 1;
        }

        pmcData.Health.Hydration.Current -= 50;
        if (pmcData.Health.Hydration.Current < 1)
        {
            pmcData.Health.Hydration.Current = 1;
        }

        return this.eventOutputHolder.getOutput(sessionId);
    }

    /**
     * Record a high score from the shooting range into a player profiles overallcounters
     * @param sessionId Session id
     * @param pmcData Profile to update
     * @param request shooting range score request
     * @returns IItemEventRouterResponse
     */
    public recordShootingRangePoints(sessionId: string, pmcData: IPmcData, request: IRecordShootingRangePoints): IItemEventRouterResponse
    {
        // Check if counter exists, add placeholder if it doesnt
        if (!pmcData.Stats.OverallCounters.Items.find(x => x.Key.includes("ShootingRangePoints")))
        {
            pmcData.Stats.OverallCounters.Items.push({
                Key: ["ShootingRangePoints"],
                Value: 0
            });
        }

        // Find counter by key and update value
        const shootingRangeHighScore = pmcData.Stats.OverallCounters.Items.find(x => x.Key.includes("ShootingRangePoints"));
        shootingRangeHighScore.Value = request.points;

        // Check against live, maybe a response isnt necessary
        return this.eventOutputHolder.getOutput(sessionId);
    }

    /**
     * Handle client/game/profile/items/moving - HideoutImproveArea
     * @param sessionId Session id
     * @param pmcData profile to improve area in
     * @param request improve area request data
     */
    public improveArea(sessionId: string, pmcData: IPmcData, request: IHideoutImproveAreaRequestData): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionId);

        // Create mapping of required item with corrisponding item from player inventory
        const items = request.items.map(reqItem =>
        {
            const item = pmcData.Inventory.items.find(invItem => invItem._id === reqItem.id);
            return {
                inventoryItem: item,
                requestedItem: reqItem
            };
        });

        // If it's not money, its construction / barter items
        for (const item of items)
        {
            if (!item.inventoryItem)
            {
                this.logger.error(this.localisationService.getText("hideout-unable_to_find_item_in_inventory", item.requestedItem.id));
                return this.httpResponse.appendErrorToOutput(output);
            }

            if (this.paymentHelper.isMoneyTpl(item.inventoryItem._tpl)
                && item.inventoryItem.upd
                && item.inventoryItem.upd.StackObjectsCount
                && item.inventoryItem.upd.StackObjectsCount > item.requestedItem.count)
            {
                item.inventoryItem.upd.StackObjectsCount -= item.requestedItem.count;
            }
            else
            {
                this.inventoryHelper.removeItem(pmcData, item.inventoryItem._id, sessionId, output);
            }
        }

        const profileHideoutArea = pmcData.Hideout.Areas.find(x => x.type === request.areaType);
        if (!profileHideoutArea)
        {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_area", request.areaType));
            return this.httpResponse.appendErrorToOutput(output);
        }

        const hideoutDbData = this.databaseServer.getTables().hideout.areas.find(x => x.type === request.areaType);
        if (!hideoutDbData)
        {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_area_in_database", request.areaType));
            return this.httpResponse.appendErrorToOutput(output);
        }

        // Add all improvemets to output object
        const improvements = hideoutDbData.stages[profileHideoutArea.level].improvements;
        const timestamp = this.timeUtil.getTimestamp();
        for (const improvement of improvements)
        {
            if (!output.profileChanges[sessionId].improvements)
            {
                output.profileChanges[sessionId].improvements = {};
            }

            const improvementDetails = {completed: false, improveCompleteTimestamp: timestamp + improvement.improvementTime};
            output.profileChanges[sessionId].improvements[improvement.id] = improvementDetails;
            pmcData.Hideout.Improvements[improvement.id] = improvementDetails;
        }        

        return output;
    }

    /**
     * Function called every x seconds as part of onUpdate event
     */
    public update(): void
    {
        for (const sessionID in this.saveServer.getProfiles())
        {
            if ("Hideout" in this.saveServer.getProfile(sessionID).characters.pmc)
            {
                this.hideoutHelper.updatePlayerHideout(sessionID);
            }
        }
    }
}
