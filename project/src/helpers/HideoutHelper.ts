import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IBotHideoutArea, IHideoutImprovement, IProduction, IProductive } from "@spt/models/eft/common/tables/IBotBase";
import { IItem, IUpd } from "@spt/models/eft/common/tables/IItem";
import { IHideoutArea, IStageBonus } from "@spt/models/eft/hideout/IHideoutArea";
import { IHideoutContinuousProductionStartRequestData } from "@spt/models/eft/hideout/IHideoutContinuousProductionStartRequestData";
import { IHideoutProduction } from "@spt/models/eft/hideout/IHideoutProduction";
import { IHideoutSingleProductionStartRequestData } from "@spt/models/eft/hideout/IHideoutSingleProductionStartRequestData";
import { IHideoutTakeProductionRequestData } from "@spt/models/eft/hideout/IHideoutTakeProductionRequestData";
import { IAddItemsDirectRequest } from "@spt/models/eft/inventory/IAddItemsDirectRequest";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { BonusType } from "@spt/models/enums/BonusType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { HideoutAreas } from "@spt/models/enums/HideoutAreas";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import { SkillTypes } from "@spt/models/enums/SkillTypes";
import { IHideoutConfig } from "@spt/models/spt/config/IHideoutConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { PlayerService } from "@spt/services/PlayerService";
import { HashUtil } from "@spt/utils/HashUtil";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class HideoutHelper {
    public static bitcoinFarm = "5d5c205bd582a50d042a3c0e";
    public static cultistCircleCraftId = "66827062405f392b203a44cf";
    public static bitcoinProductionId = "5d5c205bd582a50d042a3c0e";
    public static waterCollector = "5d5589c1f934db045e6c5492";
    public static maxSkillPoint = 5000;

    protected hideoutConfig: IHideoutConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("PlayerService") protected playerService: PlayerService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.hideoutConfig = this.configServer.getConfig(ConfigTypes.HIDEOUT);
    }

    /**
     * Add production to profiles' Hideout.Production array
     * @param pmcData Profile to add production to
     * @param body Production request
     * @param sessionID Session id
     * @returns client response
     */
    public registerProduction(
        pmcData: IPmcData,
        body: IHideoutSingleProductionStartRequestData | IHideoutContinuousProductionStartRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        const recipe = this.databaseService
            .getHideout()
            .production.recipes.find((production) => production._id === body.recipeId);
        if (!recipe) {
            this.logger.error(this.localisationService.getText("hideout-missing_recipe_in_db", body.recipeId));

            return this.httpResponse.appendErrorToOutput(this.eventOutputHolder.getOutput(sessionID));
        }

        // @Important: Here we need to be very exact:
        // - normal recipe: Production time value is stored in attribute "productionType" with small "p"
        // - scav case recipe: Production time value is stored in attribute "ProductionType" with capital "P"
        if (!pmcData.Hideout.Production) {
            pmcData.Hideout.Production = {};
        }

        const modifiedProductionTime = this.getAdjustedCraftTimeWithSkills(pmcData, body.recipeId);

        const production = this.initProduction(
            body.recipeId,
            modifiedProductionTime,
            recipe.needFuelForAllProductionTime,
        );

        // Store the tools used for this production, so we can return them later
        const bodyAsSingle = body as IHideoutSingleProductionStartRequestData;
        if (bodyAsSingle && bodyAsSingle.tools?.length > 0) {
            production.sptRequiredTools = [];

            for (const tool of bodyAsSingle.tools) {
                const toolItem = this.cloner.clone(pmcData.Inventory.items.find((x) => x._id === tool.id));

                // Make sure we only return as many as we took
                this.itemHelper.addUpdObjectToItem(toolItem);

                toolItem.upd.StackObjectsCount = tool.count;

                production.sptRequiredTools.push({
                    _id: this.hashUtil.generate(),
                    _tpl: toolItem._tpl,
                    upd: toolItem.upd,
                });
            }
        }

        pmcData.Hideout.Production[body.recipeId] = production;
    }

    /**
     * This convenience function initializes new Production Object
     * with all the constants.
     */
    public initProduction(
        recipeId: string,
        productionTime: number,
        needFuelForAllProductionTime: boolean,
    ): IProduction {
        return {
            Progress: 0,
            inProgress: true,
            RecipeId: recipeId,
            StartTimestamp: this.timeUtil.getTimestamp().toString(),
            ProductionTime: productionTime,
            Products: [],
            GivenItemsInStart: [],
            Interrupted: false,
            NeedFuelForAllProductionTime: needFuelForAllProductionTime, // Used when sending to client
            needFuelForAllProductionTime: needFuelForAllProductionTime, // used when stored in production.json
            SkipTime: 0,
        };
    }

    /**
     * Is the provided object a Production type
     * @param productive
     * @returns
     */
    public isProductionType(productive: IProductive): productive is IProduction {
        return (productive as IProduction).Progress !== undefined || (productive as IProduction).RecipeId !== undefined;
    }

    /**
     * Apply bonus to player profile given after completing hideout upgrades
     * @param pmcData Profile to add bonus to
     * @param bonus Bonus to add to profile
     */
    public applyPlayerUpgradesBonuses(pmcData: IPmcData, bonus: IStageBonus): void {
        // Handle additional changes some bonuses need before being added
        switch (bonus.type) {
            case BonusType.STASH_SIZE: {
                // Find stash item and adjust tpl to new tpl from bonus
                const stashItem = pmcData.Inventory.items.find((x) => x._id === pmcData.Inventory.stash);
                if (!stashItem) {
                    this.logger.warning(
                        this.localisationService.getText(
                            "hideout-unable_to_apply_stashsize_bonus_no_stash_found",
                            pmcData.Inventory.stash,
                        ),
                    );
                }

                stashItem._tpl = bonus.templateId;

                break;
            }
            case BonusType.MAXIMUM_ENERGY_RESERVE:
                // Amend max energy in profile
                pmcData.Health.Energy.Maximum += bonus.value;
                break;
            case BonusType.TEXT_BONUS:
                // Delete values before they're added to profile
                // biome-ignore lint/performance/noDelete: Delete is fine here as we entirely want to get rid of the data.
                delete bonus.passive;
                // biome-ignore lint/performance/noDelete: Delete is fine here as we entirely want to get rid of the data.
                delete bonus.production;
                // biome-ignore lint/performance/noDelete: Delete is fine here as we entirely want to get rid of the data.
                delete bonus.visible;
                break;
        }

        // Add bonus to player bonuses array in profile
        // EnergyRegeneration, HealthRegeneration, RagfairCommission, ScavCooldownTimer, SkillGroupLevelingBoost, ExperienceRate, QuestMoneyReward etc
        this.logger.debug(`Adding bonus: ${bonus.type} to profile, value: ${bonus.value ?? ""}`);
        pmcData.Bonuses.push(bonus);
    }

    /**
     * Process a players hideout, update areas that use resources + increment production timers
     * @param sessionID Session id
     */
    public updatePlayerHideout(sessionID: string): void {
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        const hideoutProperties = this.getHideoutProperties(pmcData);

        this.updateAreasWithResources(sessionID, pmcData, hideoutProperties);
        this.updateProductionTimers(pmcData, hideoutProperties);
        pmcData.Hideout.sptUpdateLastRunTimestamp = this.timeUtil.getTimestamp();
    }

    /**
     * Get various properties that will be passed to hideout update-related functions
     * @param pmcData Player profile
     * @returns Properties
     */
    protected getHideoutProperties(pmcData: IPmcData): {
        btcFarmCGs: number;
        isGeneratorOn: boolean;
        waterCollectorHasFilter: boolean;
    } {
        const bitcoinFarm = pmcData.Hideout.Areas.find((area) => area.type === HideoutAreas.BITCOIN_FARM);
        const bitcoinCount = bitcoinFarm?.slots.filter((slot) => slot.item).length ?? 0; // Get slots with an item property

        const hideoutProperties = {
            btcFarmCGs: bitcoinCount,
            isGeneratorOn: pmcData.Hideout.Areas.find((area) => area.type === HideoutAreas.GENERATOR)?.active ?? false,
            waterCollectorHasFilter: this.doesWaterCollectorHaveFilter(
                pmcData.Hideout.Areas.find((area) => area.type === HideoutAreas.WATER_COLLECTOR),
            ),
        };

        return hideoutProperties;
    }

    protected doesWaterCollectorHaveFilter(waterCollector: IBotHideoutArea): boolean {
        // Can put filters in from L3
        if (waterCollector.level === 3) {
            // Has filter in at least one slot
            return waterCollector.slots.some((slot) => slot.item);
        }

        // No Filter
        return false;
    }

    /**
     * Iterate over productions and update their progress timers
     * @param pmcData Profile to check for productions and update
     * @param hideoutProperties Hideout properties
     */
    protected updateProductionTimers(
        pmcData: IPmcData,
        hideoutProperties: { btcFarmCGs: number; isGeneratorOn: boolean; waterCollectorHasFilter: boolean },
    ): void {
        const recipes = this.databaseService.getHideout().production;

        // Check each production and handle edge cases if necessary
        for (const prodId in pmcData.Hideout.Production) {
            const craft = pmcData.Hideout.Production[prodId];
            if (!craft) {
                // Craft value is undefined, get rid of it (could be from cancelling craft that needs cleaning up)
                delete pmcData.Hideout.Production[prodId];

                continue;
            }

            if (craft.Progress === undefined) {
                this.logger.warning(
                    this.localisationService.getText("hideout-craft_has_undefined_progress_value_defaulting", prodId),
                );
                craft.Progress = 0;
            }

            // Skip processing (Don't skip continious crafts like bitcoin farm or cultist circle)
            if (this.isCraftComplete(craft)) {
                continue;
            }

            // Special handling required
            if (this.isCraftOfType(craft, HideoutAreas.SCAV_CASE)) {
                this.updateScavCaseProductionTimer(pmcData, prodId);

                continue;
            }

            if (this.isCraftOfType(craft, HideoutAreas.WATER_COLLECTOR)) {
                this.updateWaterCollectorProductionTimer(pmcData, prodId, hideoutProperties);

                continue;
            }

            // Continious craft
            if (this.isCraftOfType(craft, HideoutAreas.BITCOIN_FARM)) {
                this.updateBitcoinFarm(
                    pmcData,
                    pmcData.Hideout.Production[prodId],
                    hideoutProperties.btcFarmCGs,
                    hideoutProperties.isGeneratorOn,
                );

                continue;
            }

            // No recipe, needs special handling
            if (this.isCraftOfType(craft, HideoutAreas.CIRCLE_OF_CULTISTS)) {
                this.updateCultistCircleCraftProgress(pmcData, prodId);

                continue;
            }

            // Ensure recipe exists before using it in updateProductionProgress()
            const recipe = recipes.recipes.find((r) => r._id === prodId);
            if (!recipe) {
                this.logger.error(this.localisationService.getText("hideout-missing_recipe_for_area", prodId));

                continue;
            }

            this.updateProductionProgress(pmcData, prodId, recipe, hideoutProperties);
        }
    }

    /**
     * Is a craft from a particular hideout area
     * @param craft Craft to check
     * @param hideoutType Type to check craft against
     * @returns True it is from that area
     */
    protected isCraftOfType(craft: IProduction, hideoutType: HideoutAreas) {
        switch (hideoutType) {
            case HideoutAreas.WATER_COLLECTOR:
                return craft.RecipeId === HideoutHelper.waterCollector;
            case HideoutAreas.BITCOIN_FARM:
                return craft.RecipeId === HideoutHelper.bitcoinFarm;
            case HideoutAreas.SCAV_CASE:
                return craft.sptIsScavCase;
            case HideoutAreas.CIRCLE_OF_CULTISTS:
                return craft.sptIsCultistCircle;

            default:
                this.logger.error(
                    `Unhandled hideout area: ${hideoutType}, assuming craft: ${craft.RecipeId} is not of this type`,
                );
                return false;
        }
    }

    /**
     * Has the craft completed
     * Ignores bitcoin farm/cultist circle as they're continuous crafts
     * @param craft Craft to check

     * @returns True when craft is compelte
     */
    protected isCraftComplete(craft: IProduction) {
        return (
            craft.Progress >= craft.ProductionTime &&
            ![HideoutHelper.bitcoinFarm, HideoutHelper.cultistCircleCraftId].includes(craft.RecipeId)
        );
    }

    /**
     * Update progress timer for water collector
     * @param pmcData profile to update
     * @param productionId id of water collection production to update
     * @param hideoutProperties Hideout properties
     */
    protected updateWaterCollectorProductionTimer(
        pmcData: IPmcData,
        productionId: string,
        hideoutProperties: { btcFarmCGs?: number; isGeneratorOn: boolean; waterCollectorHasFilter: boolean },
    ): void {
        const timeElapsed = this.getTimeElapsedSinceLastServerTick(pmcData, hideoutProperties.isGeneratorOn);
        if (hideoutProperties.waterCollectorHasFilter) {
            pmcData.Hideout.Production[productionId].Progress += timeElapsed;
        }
    }

    /**
     * Update a productions progress value based on the amount of time that has passed
     * @param pmcData Player profile
     * @param prodId Production id being crafted
     * @param recipe Recipe data being crafted
     * @param hideoutProperties
     */
    protected updateProductionProgress(
        pmcData: IPmcData,
        prodId: string,
        recipe: IHideoutProduction,
        hideoutProperties: { btcFarmCGs?: number; isGeneratorOn: boolean; waterCollectorHasFilter?: boolean },
    ): void {
        // Production is complete, no need to do any calculations
        if (this.doesProgressMatchProductionTime(pmcData, prodId)) {
            return;
        }

        // Get seconds since last hideout update + now
        const timeElapsed = this.getTimeElapsedSinceLastServerTick(pmcData, hideoutProperties.isGeneratorOn, recipe);

        // Increment progress by time passed
        const production = pmcData.Hideout.Production[prodId];
        production.Progress +=
            production.needFuelForAllProductionTime && !hideoutProperties.isGeneratorOn ? 0 : timeElapsed; // Some items NEED power to craft (e.g. DSP)

        // Limit progress to total production time if progress is over (dont run for continious crafts))
        if (!recipe.continuous) {
            // If progress is larger than prod time, return ProductionTime, hard cap the vaue
            production.Progress = Math.min(production.Progress, production.ProductionTime);
        }
    }

    protected updateCultistCircleCraftProgress(pmcData: IPmcData, prodId: string): void {
        const production = pmcData.Hideout.Production[prodId];

        // Check if we're already complete, skip
        if (production.AvailableForFinish) {
            return;
        }

        // Get seconds since last hideout update
        const timeElapsedSeconds = this.timeUtil.getTimestamp() - pmcData.Hideout.sptUpdateLastRunTimestamp;

        // Increment progress by time passed if progress is less than time needed
        if (production.Progress < production.ProductionTime) {
            production.Progress += timeElapsedSeconds;

            // Check if craft is complete
            if (production.Progress >= production.ProductionTime) {
                this.flagCultistCircleCraftAsComplete(production);
            }

            return;
        }

        // Craft in complete
        this.flagCultistCircleCraftAsComplete(production);
    }

    protected flagCultistCircleCraftAsComplete(production: IProductive) {
        // Craft is complete, flas as such
        production.AvailableForFinish = true;

        // Reset progress so its not over production time
        production.Progress = production.ProductionTime;
    }

    /**
     * Check if a productions progress value matches its corresponding recipes production time value
     * @param pmcData Player profile
     * @param prodId Production id
     * @param recipe Recipe being crafted
     * @returns progress matches productionTime from recipe
     */
    protected doesProgressMatchProductionTime(pmcData: IPmcData, prodId: string): boolean {
        return pmcData.Hideout.Production[prodId].Progress === pmcData.Hideout.Production[prodId].ProductionTime;
    }

    /**
     * Update progress timer for scav case
     * @param pmcData Profile to update
     * @param productionId Id of scav case production to update
     */
    protected updateScavCaseProductionTimer(pmcData: IPmcData, productionId: string): void {
        const timeElapsed =
            this.timeUtil.getTimestamp() -
            Number(pmcData.Hideout.Production[productionId].StartTimestamp) -
            pmcData.Hideout.Production[productionId].Progress;
        pmcData.Hideout.Production[productionId].Progress += timeElapsed;
    }

    /**
     * Iterate over hideout areas that use resources (fuel/filters etc) and update associated values
     * @param sessionID Session id
     * @param pmcData Profile to update areas of
     * @param hideoutProperties hideout properties
     */
    protected updateAreasWithResources(
        sessionID: string,
        pmcData: IPmcData,
        hideoutProperties: { btcFarmCGs: number; isGeneratorOn: boolean; waterCollectorHasFilter: boolean },
    ): void {
        for (const area of pmcData.Hideout.Areas) {
            switch (area.type) {
                case HideoutAreas.GENERATOR:
                    if (hideoutProperties.isGeneratorOn) {
                        this.updateFuel(area, pmcData, hideoutProperties.isGeneratorOn);
                    }
                    break;
                case HideoutAreas.WATER_COLLECTOR:
                    this.updateWaterCollector(sessionID, pmcData, area, hideoutProperties);
                    break;

                case HideoutAreas.AIR_FILTERING:
                    if (hideoutProperties.isGeneratorOn) {
                        this.updateAirFilters(area, pmcData, hideoutProperties.isGeneratorOn);
                    }
                    break;
            }
        }
    }

    /**
     * Decrease fuel from generator slots based on amount of time since last time this occured
     * @param generatorArea Hideout area
     * @param pmcData Player profile
     * @param isGeneratorOn Is the generator turned on since last update
     */
    protected updateFuel(generatorArea: IBotHideoutArea, pmcData: IPmcData, isGeneratorOn: boolean): void {
        // 1 resource last 14 min 27 sec, 1/14.45/60 = 0.00115
        // 10-10-2021 From wiki, 1 resource last 12 minutes 38 seconds, 1/12.63333/60 = 0.00131
        let fuelUsedSinceLastTick =
            this.databaseService.getHideout().settings.generatorFuelFlowRate *
            this.getTimeElapsedSinceLastServerTick(pmcData, isGeneratorOn);

        // Get all fuel consumption bonuses, returns an empty array if none found
        const profileFuelConsomptionBonusSum = this.profileHelper.getBonusValueFromProfile(
            pmcData,
            BonusType.FUEL_CONSUMPTION,
        );

        // An increase in "bonus" consumption is actually an increase in consumption, so invert this for later use
        const fuelConsumptionBonusRate = -(profileFuelConsomptionBonusSum / 100);

        // An increase in hideout management bonus is a decrease in consumption
        const hideoutManagementConsumptionBonusRate = this.getHideoutManagementConsumptionBonus(pmcData);

        let combinedBonus = 1.0 - (fuelConsumptionBonusRate + hideoutManagementConsumptionBonusRate);

        // Sanity check, never let fuel consumption go negative, otherwise it returns fuel to the player
        if (combinedBonus < 0) {
            combinedBonus = 0;
        }

        fuelUsedSinceLastTick *= combinedBonus;

        let hasFuelRemaining = false;
        let pointsConsumed = 0;
        for (let i = 0; i < generatorArea.slots.length; i++) {
            const generatorSlot = generatorArea.slots[i];
            if (!generatorSlot?.item) {
                // No item in slot, skip
                continue;
            }

            const fuelItemInSlot = generatorSlot?.item[0];
            if (!fuelItemInSlot) {
                // No item in slot, skip
                continue;
            }

            let fuelRemaining = fuelItemInSlot.upd?.Resource?.Value;
            if (fuelRemaining === 0) {
                // No fuel left, skip
                continue;
            }

            // Undefined fuel, fresh fuel item and needs its max fuel amount looked up
            if (!fuelRemaining) {
                const fuelItemTemplate = this.itemHelper.getItem(fuelItemInSlot._tpl)[1];
                pointsConsumed = fuelUsedSinceLastTick;
                fuelRemaining = fuelItemTemplate._props.MaxResource - fuelUsedSinceLastTick;
            } else {
                // Fuel exists already, deduct fuel from item remaining value
                pointsConsumed = (fuelItemInSlot.upd.Resource.UnitsConsumed || 0) + fuelUsedSinceLastTick;
                fuelRemaining -= fuelUsedSinceLastTick;
            }

            // Round values to keep accuracy
            fuelRemaining = Math.round(fuelRemaining * 10000) / 10000;
            pointsConsumed = Math.round(pointsConsumed * 10000) / 10000;

            // Fuel consumed / 10 is over 1, add hideout management skill point
            if (pmcData && Math.floor(pointsConsumed / 10) >= 1) {
                this.profileHelper.addSkillPointsToPlayer(pmcData, SkillTypes.HIDEOUT_MANAGEMENT, 1);
                pointsConsumed -= 10;
            }

            const isFuelItemFoundInRaid = fuelItemInSlot.upd?.SpawnedInSession ?? false;
            if (fuelRemaining > 0) {
                // Deducted all used fuel from this container, clean up and exit loop
                fuelItemInSlot.upd = this.getAreaUpdObject(1, fuelRemaining, pointsConsumed, isFuelItemFoundInRaid);

                this.logger.debug(
                    `Profile: ${pmcData._id} Generator has: ${fuelRemaining} fuel left in slot ${i + 1}`,
                    true,
                );
                hasFuelRemaining = true;

                break; // Break to avoid updating all the fuel tanks
            }

            fuelItemInSlot.upd = this.getAreaUpdObject(1, 0, 0, isFuelItemFoundInRaid);

            // Ran out of fuel items to deduct fuel from
            fuelUsedSinceLastTick = Math.abs(fuelRemaining);
            this.logger.debug(`Profile: ${pmcData._id} Generator ran out of fuel`, true);
        }

        // Out of fuel, flag generator as offline
        if (!hasFuelRemaining) {
            generatorArea.active = false;
        }
    }

    protected updateWaterCollector(
        sessionId: string,
        pmcData: IPmcData,
        area: IBotHideoutArea,
        hideoutProperties: { btcFarmCGs: number; isGeneratorOn: boolean; waterCollectorHasFilter: boolean },
    ): void {
        // Skip water collector when not level 3 (cant collect until 3)
        if (area.level !== 3) {
            return;
        }

        if (!hideoutProperties.waterCollectorHasFilter) {
            return;
        }

        // Canister with purified water craft exists
        const purifiedWaterCraft = pmcData.Hideout.Production[HideoutHelper.waterCollector];
        if (purifiedWaterCraft && this.isProduction(purifiedWaterCraft)) {
            // Update craft time to account for increases in players craft time skill
            purifiedWaterCraft.ProductionTime = this.getAdjustedCraftTimeWithSkills(
                pmcData,
                purifiedWaterCraft.RecipeId,
                true,
            );

            this.updateWaterFilters(area, purifiedWaterCraft, hideoutProperties.isGeneratorOn, pmcData);
        } else {
            // continuousProductionStart()
            // seem to not trigger consistently
            const recipe: IHideoutSingleProductionStartRequestData = {
                recipeId: HideoutHelper.waterCollector,
                Action: "HideoutSingleProductionStart",
                items: [],
                tools: [],
                timestamp: this.timeUtil.getTimestamp(),
            };

            this.registerProduction(pmcData, recipe, sessionId);
        }
    }

    /**
     * Get craft time and make adjustments to account for dev profile + crafting skill level
     * @param pmcData Player profile making craft
     * @param recipeId Recipe being crafted
     * @param applyHideoutManagementBonus should the hideout mgmt bonus be appled to the calculation
     * @returns Items craft time with bonuses subtracted
     */
    public getAdjustedCraftTimeWithSkills(
        pmcData: IPmcData,
        recipeId: string,
        applyHideoutManagementBonus = false,
    ): number {
        const globalSkillsDb = this.databaseService.getGlobals().config.SkillsSettings;

        const recipe = this.databaseService
            .getHideout()
            .production.recipes.find((production) => production._id === recipeId);
        if (!recipe) {
            this.logger.error(this.localisationService.getText("hideout-missing_recipe_in_db", recipeId));

            return undefined;
        }

        let timeReductionSeconds = 0;

        // Bitcoin farm is excluded from crafting skill cooldown reduction
        if (recipeId !== HideoutHelper.bitcoinFarm) {
            // Seconds to deduct from crafts total time
            timeReductionSeconds += this.getSkillProductionTimeReduction(
                pmcData,
                recipe.productionTime,
                SkillTypes.CRAFTING,
                globalSkillsDb.Crafting.ProductionTimeReductionPerLevel,
            );
        }

        // Some crafts take into account hideout management, e.g. fuel, water/air filters
        if (applyHideoutManagementBonus) {
            timeReductionSeconds += this.getSkillProductionTimeReduction(
                pmcData,
                recipe.productionTime,
                SkillTypes.HIDEOUT_MANAGEMENT,
                globalSkillsDb.HideoutManagement.ConsumptionReductionPerLevel,
            );
        }

        let modifiedProductionTime = recipe.productionTime - timeReductionSeconds;
        if (modifiedProductionTime > 0 && this.profileHelper.isDeveloperAccount(pmcData._id)) {
            modifiedProductionTime = 40;
        }

        // Sanity check, don't let anything craft in less than 5 seconds
        if (modifiedProductionTime < 5) {
            modifiedProductionTime = 5;
        }

        return modifiedProductionTime;
    }

    /**
     * Adjust water filter objects resourceValue or delete when they reach 0 resource
     * @param waterFilterArea water filter area to update
     * @param production production object
     * @param isGeneratorOn is generator enabled
     * @param pmcData Player profile
     */
    protected updateWaterFilters(
        waterFilterArea: IBotHideoutArea,
        production: IProduction,
        isGeneratorOn: boolean,
        pmcData: IPmcData,
    ): void {
        let filterDrainRate = this.getWaterFilterDrainRate(pmcData);
        const craftProductionTime = this.getTotalProductionTimeSeconds(HideoutHelper.waterCollector);
        const secondsSinceServerTick = this.getTimeElapsedSinceLastServerTick(pmcData, isGeneratorOn);

        filterDrainRate = this.getTimeAdjustedWaterFilterDrainRate(
            secondsSinceServerTick,
            craftProductionTime,
            production.Progress,
            filterDrainRate,
        );

        // Production hasn't completed
        let pointsConsumed = 0;

        // Check progress against the productions craft time (dont use base time as it doesnt include any time bonuses profile has)
        if (production.Progress > production.ProductionTime) {
            // Craft is complete nothing to do
            return;
        }

        // Check all slots that take water filters until we find one with filter in it
        for (let i = 0; i < waterFilterArea.slots.length; i++) {
            // No water filter in slot, skip
            if (!waterFilterArea.slots[i].item) {
                continue;
            }

            const waterFilterItemInSlot = waterFilterArea.slots[i].item[0];

            // How many units of filter are left
            let resourceValue = waterFilterItemInSlot.upd?.Resource
                ? waterFilterItemInSlot.upd.Resource.Value
                : undefined;
            if (!resourceValue) {
                // Missing, is new filter, add default and subtract usage
                resourceValue = 100 - filterDrainRate;
                pointsConsumed = filterDrainRate;
            } else {
                pointsConsumed = (waterFilterItemInSlot.upd.Resource.UnitsConsumed || 0) + filterDrainRate;
                resourceValue -= filterDrainRate;
            }

            // Round to get values to 3dp
            resourceValue = Math.round(resourceValue * 1000) / 1000;
            pointsConsumed = Math.round(pointsConsumed * 1000) / 1000;

            // Check units consumed for possible increment of hideout mgmt skill point
            if (pmcData && Math.floor(pointsConsumed / 10) >= 1) {
                this.profileHelper.addSkillPointsToPlayer(pmcData, SkillTypes.HIDEOUT_MANAGEMENT, 1);
                pointsConsumed -= 10;
            }

            // Filter has some fuel left in it after our adjustment
            if (resourceValue > 0) {
                const isWaterFilterFoundInRaid = waterFilterItemInSlot.upd.SpawnedInSession ?? false;

                // Set filters consumed amount
                waterFilterItemInSlot.upd = this.getAreaUpdObject(
                    1,
                    resourceValue,
                    pointsConsumed,
                    isWaterFilterFoundInRaid,
                );
                this.logger.debug(`Water filter has: ${resourceValue} units left in slot ${i + 1}`);

                break; // Break here to avoid iterating other filters now w're done
            }

            // Filter ran out / used up
            // biome-ignore lint/performance/noDelete: Delete is fine here, as we're seeking to entirely delete the water filter.
            delete waterFilterArea.slots[i].item;
            // Update remaining resources to be subtracted
            filterDrainRate = Math.abs(resourceValue);
        }
    }

    /**
     * Get an adjusted water filter drain rate based on time elapsed since last run,
     * handle edge case when craft time has gone on longer than total production time
     * @param secondsSinceServerTick Time passed
     * @param totalProductionTime Total time collecting water
     * @param productionProgress how far water collector has progressed
     * @param baseFilterDrainRate Base drain rate
     * @returns drain rate (adjusted)
     */
    protected getTimeAdjustedWaterFilterDrainRate(
        secondsSinceServerTick: number,
        totalProductionTime: number,
        productionProgress: number,
        baseFilterDrainRate: number,
    ): number {
        const drainTimeSeconds =
            secondsSinceServerTick > totalProductionTime
                ? totalProductionTime - productionProgress // More time passed than prod time, get total minus the current progress
                : secondsSinceServerTick;

        // Multiply base drain rate by time passed
        return baseFilterDrainRate * drainTimeSeconds;
    }

    /**
     * Get the water filter drain rate based on hideout bonues player has
     * @param pmcData Player profile
     * @returns Drain rate
     */
    protected getWaterFilterDrainRate(pmcData: IPmcData): number {
        const globalSkillsDb = this.databaseService.getGlobals().config.SkillsSettings;

        // 100 resources last 8 hrs 20 min, 100/8.33/60/60 = 0.00333
        const filterDrainRate = 0.00333;

        const hideoutManagementConsumptionBonus = this.getSkillBonusMultipliedBySkillLevel(
            pmcData,
            SkillTypes.HIDEOUT_MANAGEMENT,
            globalSkillsDb.HideoutManagement.ConsumptionReductionPerLevel,
        );
        const craftSkillTimeReductionMultipler = this.getSkillBonusMultipliedBySkillLevel(
            pmcData,
            SkillTypes.CRAFTING,
            globalSkillsDb.Crafting.CraftTimeReductionPerLevel,
        );

        // Never let bonus become 0
        const reductionBonus =
            hideoutManagementConsumptionBonus + craftSkillTimeReductionMultipler === 0
                ? 1
                : 1 - (hideoutManagementConsumptionBonus + craftSkillTimeReductionMultipler);

        return filterDrainRate * reductionBonus;
    }

    /**
     * Get the production time in seconds for the desired production
     * @param prodId Id, e.g. Water collector id
     * @returns seconds to produce item
     */
    protected getTotalProductionTimeSeconds(prodId: string): number {
        return (
            this.databaseService.getHideout().production.recipes.find((prod) => prod._id === prodId)?.productionTime ??
            0
        );
    }

    /**
     * Create a upd object using passed in parameters
     * @param stackCount
     * @param resourceValue
     * @param resourceUnitsConsumed
     * @returns Upd
     */
    protected getAreaUpdObject(
        stackCount: number,
        resourceValue: number,
        resourceUnitsConsumed: number,
        isFoundInRaid: boolean,
    ): IUpd {
        return {
            StackObjectsCount: stackCount,
            Resource: { Value: resourceValue, UnitsConsumed: resourceUnitsConsumed },
            SpawnedInSession: isFoundInRaid,
        };
    }

    protected updateAirFilters(airFilterArea: IBotHideoutArea, pmcData: IPmcData, isGeneratorOn: boolean): void {
        // 300 resources last 20 hrs, 300/20/60/60 = 0.00416
        /* 10-10-2021 from WIKI (https://escapefromtarkov.fandom.com/wiki/FP-100_filter_absorber)
            Lasts for 17 hours 38 minutes and 49 seconds (23 hours 31 minutes and 45 seconds with elite hideout management skill),
            300/17.64694/60/60 = 0.004722
        */
        let filterDrainRate =
            this.databaseService.getHideout().settings.airFilterUnitFlowRate *
            this.getTimeElapsedSinceLastServerTick(pmcData, isGeneratorOn);

        // Hideout management resource consumption bonus:
        const hideoutManagementConsumptionBonus = 1.0 - this.getHideoutManagementConsumptionBonus(pmcData);
        filterDrainRate *= hideoutManagementConsumptionBonus;
        let pointsConsumed = 0;

        for (let i = 0; i < airFilterArea.slots.length; i++) {
            if (airFilterArea.slots[i].item) {
                let resourceValue = airFilterArea.slots[i].item[0].upd?.Resource
                    ? airFilterArea.slots[i].item[0].upd.Resource.Value
                    : undefined;
                if (!resourceValue) {
                    resourceValue = 300 - filterDrainRate;
                    pointsConsumed = filterDrainRate;
                } else {
                    pointsConsumed = (airFilterArea.slots[i].item[0].upd.Resource.UnitsConsumed || 0) + filterDrainRate;
                    resourceValue -= filterDrainRate;
                }
                resourceValue = Math.round(resourceValue * 10000) / 10000;
                pointsConsumed = Math.round(pointsConsumed * 10000) / 10000;

                // check unit consumed for increment skill point
                if (pmcData && Math.floor(pointsConsumed / 10) >= 1) {
                    this.profileHelper.addSkillPointsToPlayer(pmcData, SkillTypes.HIDEOUT_MANAGEMENT, 1);
                    pointsConsumed -= 10;
                }

                if (resourceValue > 0) {
                    airFilterArea.slots[i].item[0].upd = {
                        StackObjectsCount: 1,
                        Resource: { Value: resourceValue, UnitsConsumed: pointsConsumed },
                    };
                    this.logger.debug(`Air filter: ${resourceValue} filter left on slot ${i + 1}`);
                    break; // Break here to avoid updating all filters
                }

                // biome-ignore lint/performance/noDelete: Delete is fine here, as we're seeking to entirely delete the air filter.
                delete airFilterArea.slots[i].item;
                // Update remaining resources to be subtracted
                filterDrainRate = Math.abs(resourceValue);
            }
        }
    }

    protected updateBitcoinFarm(
        pmcData: IPmcData,
        btcProduction: IProductive,
        btcFarmCGs: number,
        isGeneratorOn: boolean,
    ): void {
        const isBtcProd = this.isProduction(btcProduction);
        if (!isBtcProd) {
            return;
        }

        // The wiki has a wrong formula!
        // Do not change unless you validate it with the Client code files!
        // This formula was found on the client files:
        // *******************************************************
        /*
                public override int InstalledSuppliesCount
             {
              get
              {
               return this.int_1;
              }
              protected set
              {
               if (this.int_1 === value)
                        {
                            return;
                        }
                        this.int_1 = value;
                        base.Single_0 = ((this.int_1 === 0) ? 0f : (1f + (float)(this.int_1 - 1) * this.float_4));
                    }
                }
            */
        // **********************************************************
        // At the time of writing this comment, this was GClass1667
        // To find it in case of weird results, use DNSpy and look for usages on class AreaData
        // Look for a GClassXXXX that has a method called "InitDetails" and the only parameter is the AreaData
        // That should be the bitcoin farm production. To validate, try to find the snippet below:
        /*
                protected override void InitDetails(AreaData data)
                {
                    base.InitDetails(data);
                    this.gclass1678_1.Type = EDetailsType.Farming;
                }
            */
        // Needs power to function
        if (!isGeneratorOn) {
            // Return with no changes
            return;
        }

        const coinSlotCount = this.getBTCSlots(pmcData);

        // Full of bitcoins, halt progress
        if (btcProduction.Products.length >= coinSlotCount) {
            // Set progress to 0
            btcProduction.Progress = 0;

            return;
        }

        const bitcoinProdData = this.databaseService
            .getHideout()
            .production.recipes.find((production) => production._id === HideoutHelper.bitcoinProductionId);

        // BSG finally fixed their settings, they now get loaded from the settings and used in the client
        const adjustedCraftTime =
            (this.profileHelper.isDeveloperAccount(pmcData.sessionId) ? 40 : bitcoinProdData.productionTime) /
            (1 + (btcFarmCGs - 1) * this.databaseService.getHideout().settings.gpuBoostRate);

        // The progress should be adjusted based on the GPU boost rate, but the target is still the base productionTime
        const timeMultiplier = bitcoinProdData.productionTime / adjustedCraftTime;
        const timeElapsedSeconds = this.getTimeElapsedSinceLastServerTick(pmcData, isGeneratorOn);
        btcProduction.Progress += Math.floor(timeElapsedSeconds * timeMultiplier);

        while (btcProduction.Progress >= bitcoinProdData.productionTime) {
            if (btcProduction.Products.length < coinSlotCount) {
                // Has space to add a coin to production rewards
                this.addBtcToProduction(btcProduction, bitcoinProdData.productionTime);
            } else {
                // Filled up bitcoin storage
                btcProduction.Progress = 0;
            }
        }

        btcProduction.StartTimestamp = this.timeUtil.getTimestamp().toString();
    }

    /**
     * Add bitcoin object to btc production products array and set progress time
     * @param btcProd Bitcoin production object
     * @param coinCraftTimeSeconds Time to craft a bitcoin
     */
    protected addBtcToProduction(btcProd: IProduction, coinCraftTimeSeconds: number): void {
        btcProd.Products.push({
            _id: this.hashUtil.generate(),
            _tpl: ItemTpl.BARTER_PHYSICAL_BITCOIN,
            upd: { StackObjectsCount: 1 },
        });

        // Deduct time spent crafting from progress
        btcProd.Progress -= coinCraftTimeSeconds;
    }

    /**
     * Get number of ticks that have passed since hideout areas were last processed, reduced when generator is off
     * @param pmcData Player profile
     * @param isGeneratorOn Is the generator on for the duration of elapsed time
     * @param recipe Hideout production recipe being crafted we need the ticks for
     * @returns Amount of time elapsed in seconds
     */
    protected getTimeElapsedSinceLastServerTick(
        pmcData: IPmcData,
        isGeneratorOn: boolean,
        recipe?: IHideoutProduction,
    ): number {
        // Reduce time elapsed (and progress) when generator is off
        let timeElapsed = this.timeUtil.getTimestamp() - pmcData.Hideout.sptUpdateLastRunTimestamp;

        if (recipe) {
            const hideoutArea = this.databaseService.getHideout().areas.find((area) => area.type === recipe.areaType);
            if (!hideoutArea.needsFuel) {
                // e.g. Lavatory works at 100% when power is on / off
                return timeElapsed;
            }
        }

        if (!isGeneratorOn) {
            timeElapsed *= this.databaseService.getHideout().settings.generatorSpeedWithoutFuel;
        }

        return timeElapsed;
    }

    /**
     * Get a count of how many possible BTC can be gathered by the profile
     * @param pmcData Profile to look up
     * @returns Coin slot count
     */
    protected getBTCSlots(pmcData: IPmcData): number {
        const bitcoinProductions = this.databaseService
            .getHideout()
            .production.recipes.find((production) => production._id === HideoutHelper.bitcoinFarm);
        const productionSlots = bitcoinProductions?.productionLimitCount || 3; // Default to 3 if none found
        const hasManagementSkillSlots = this.profileHelper.hasEliteSkillLevel(SkillTypes.HIDEOUT_MANAGEMENT, pmcData);
        const managementSlotsCount = this.getEliteSkillAdditionalBitcoinSlotCount() || 2;

        return productionSlots + (hasManagementSkillSlots ? managementSlotsCount : 0);
    }

    /**
     * Get a count of how many additional bitcoins player hideout can hold with elite skill
     */
    protected getEliteSkillAdditionalBitcoinSlotCount(): number {
        return this.databaseService.getGlobals().config.SkillsSettings.HideoutManagement.EliteSlots.BitcoinFarm
            .Container;
    }

    /**
     * HideoutManagement skill gives a consumption bonus the higher the level
     * 0.5% per level per 1-51, (25.5% at max)
     * @param pmcData Profile to get hideout consumption level level from
     * @returns consumption bonus
     */
    protected getHideoutManagementConsumptionBonus(pmcData: IPmcData): number {
        const hideoutManagementSkill = this.profileHelper.getSkillFromProfile(pmcData, SkillTypes.HIDEOUT_MANAGEMENT);
        if (!hideoutManagementSkill || hideoutManagementSkill.Progress === 0) {
            return 0;
        }

        // If the level is 51 we need to round it at 50 so on elite you dont get 25.5%
        // at level 1 you already get 0.5%, so it goes up until level 50. For some reason the wiki
        // says that it caps at level 51 with 25% but as per dump data that is incorrect apparently
        let roundedLevel = Math.floor(hideoutManagementSkill.Progress / 100);
        roundedLevel = roundedLevel === 51 ? roundedLevel - 1 : roundedLevel;

        return (
            (roundedLevel *
                this.databaseService.getGlobals().config.SkillsSettings.HideoutManagement
                    .ConsumptionReductionPerLevel) /
            100
        );
    }

    /**
     * Get a multipler based on players skill level and value per level
     * @param pmcData Player profile
     * @param skill Player skill from profile
     * @param valuePerLevel Value from globals.config.SkillsSettings - `PerLevel`
     * @returns Multipler from 0 to 1
     */
    protected getSkillBonusMultipliedBySkillLevel(pmcData: IPmcData, skill: SkillTypes, valuePerLevel: number): number {
        const profileSkill = this.profileHelper.getSkillFromProfile(pmcData, skill);
        if (!profileSkill || profileSkill.Progress === 0) {
            return 0;
        }

        // If the level is 51 we need to round it at 50 so on elite you dont get 25.5%
        // at level 1 you already get 0.5%, so it goes up until level 50. For some reason the wiki
        // says that it caps at level 51 with 25% but as per dump data that is incorrect apparently
        let roundedLevel = Math.floor(profileSkill.Progress / 100);
        roundedLevel = roundedLevel === 51 ? roundedLevel - 1 : roundedLevel;

        return (roundedLevel * valuePerLevel) / 100;
    }

    /**
     * @param pmcData Player profile
     * @param productionTime Time to complete hideout craft in seconds
     * @param skill Skill bonus to get reduction from
     * @param amountPerLevel Skill bonus amount to apply
     * @returns Seconds to reduce craft time by
     */
    public getSkillProductionTimeReduction(
        pmcData: IPmcData,
        productionTime: number,
        skill: SkillTypes,
        amountPerLevel: number,
    ): number {
        const skillTimeReductionMultipler = this.getSkillBonusMultipliedBySkillLevel(pmcData, skill, amountPerLevel);

        return productionTime * skillTimeReductionMultipler;
    }

    public isProduction(productive: IProductive): productive is IProduction {
        return (productive as IProduction).Progress !== undefined || (productive as IProduction).RecipeId !== undefined;
    }

    /**
     * Gather crafted BTC from hideout area and add to inventory
     * Reset production start timestamp if hideout area at full coin capacity
     * @param pmcData Player profile
     * @param request Take production request
     * @param sessionId Session id
     * @param output Output object to update
     */
    public getBTC(
        pmcData: IPmcData,
        request: IHideoutTakeProductionRequestData,
        sessionId: string,
        output: IItemEventRouterResponse,
    ): void {
        // Get how many coins were crafted and ready to pick up
        const craftedCoinCount = pmcData.Hideout.Production[HideoutHelper.bitcoinFarm]?.Products?.length ?? 0;
        if (!craftedCoinCount) {
            const errorMsg = this.localisationService.getText("hideout-no_bitcoins_to_collect");
            this.logger.error(errorMsg);

            this.httpResponse.appendErrorToOutput(output, errorMsg);

            return;
        }

        const itemsToAdd: IItem[][] = [];
        for (let index = 0; index < craftedCoinCount; index++) {
            itemsToAdd.push([
                {
                    _id: this.hashUtil.generate(),
                    _tpl: ItemTpl.BARTER_PHYSICAL_BITCOIN,
                    upd: { StackObjectsCount: 1 },
                },
            ]);
        }

        // Create request for what we want to add to stash
        const addItemsRequest: IAddItemsDirectRequest = {
            itemsWithModsToAdd: itemsToAdd,
            foundInRaid: true,
            useSortingTable: false,
            callback: undefined,
        };

        // Add FiR coins to player inventory
        this.inventoryHelper.addItemsToStash(sessionId, addItemsRequest, pmcData, output);
        if (output.warnings.length > 0) {
            return;
        }

        // Is at max capacity + we collected all coins - reset production start time
        const coinSlotCount = this.getBTCSlots(pmcData);
        if (pmcData.Hideout.Production[HideoutHelper.bitcoinFarm].Products.length >= coinSlotCount) {
            // Set start to now
            pmcData.Hideout.Production[HideoutHelper.bitcoinFarm].StartTimestamp = this.timeUtil
                .getTimestamp()
                .toString();
        }

        // Remove crafted coins from production in profile now they've been collected
        // Can only collect all coins, not individially
        pmcData.Hideout.Production[HideoutHelper.bitcoinFarm].Products = [];
    }

    /**
     * Upgrade hideout wall from starting level to interactable level if necessary stations have been upgraded
     * @param pmcProfile Profile to upgrade wall in
     */
    public unlockHideoutWallInProfile(pmcProfile: IPmcData): void {
        const waterCollector = pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.WATER_COLLECTOR);
        const medStation = pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.MEDSTATION);
        const wall = pmcProfile.Hideout.Areas.find((x) => x.type === HideoutAreas.EMERGENCY_WALL);

        // No collector or med station, skip
        if (!(waterCollector && medStation)) {
            return;
        }

        // If medstation > level 1 AND water collector > level 1 AND wall is level 0
        if (waterCollector?.level >= 1 && medStation?.level >= 1 && wall?.level <= 0) {
            wall.level = 3;
        }
    }

    /**
     * Hideout improvement is flagged as complete
     * @param improvement hideout improvement object
     * @returns true if complete
     */
    protected hideoutImprovementIsComplete(improvement: IHideoutImprovement): boolean {
        return !!improvement?.completed;
    }

    /**
     * Iterate over hideout improvements not completed and check if they need to be adjusted
     * @param pmcProfile Profile to adjust
     */
    public setHideoutImprovementsToCompleted(pmcProfile: IPmcData): void {
        for (const improvementId in pmcProfile.Hideout.Improvements) {
            const improvementDetails = pmcProfile.Hideout.Improvements[improvementId];
            if (
                improvementDetails.completed === false &&
                improvementDetails.improveCompleteTimestamp < this.timeUtil.getTimestamp()
            ) {
                improvementDetails.completed = true;
            }
        }
    }

    /**
     * Add/remove bonus combat skill based on number of dogtags in place of fame hideout area
     * @param pmcData Player profile
     */
    public applyPlaceOfFameDogtagBonus(pmcData: IPmcData): void {
        const fameAreaProfile = pmcData.Hideout.Areas.find((area) => area.type === HideoutAreas.PLACE_OF_FAME);

        // Get hideout area 16 bonus array
        const fameAreaDb = this.databaseService
            .getHideout()
            .areas.find((area) => area.type === HideoutAreas.PLACE_OF_FAME);

        // Get SkillGroupLevelingBoost object
        const combatBoostBonusDb = fameAreaDb.stages[fameAreaProfile.level].bonuses.find(
            (bonus) => bonus.type === "SkillGroupLevelingBoost",
        );

        // Get SkillGroupLevelingBoost object in profile
        const combatBonusProfile = pmcData.Bonuses.find((bonus) => bonus.id === combatBoostBonusDb.id);

        // Get all slotted dogtag items
        const activeDogtags = pmcData.Inventory.items.filter((item) => item?.slotId?.startsWith("dogtag"));

        // Calculate bonus percent (apply hideoutManagement bonus)
        const hideoutManagementSkill = this.profileHelper.getSkillFromProfile(pmcData, SkillTypes.HIDEOUT_MANAGEMENT);
        const hideoutManagementSkillBonusPercent = 1 + hideoutManagementSkill.Progress / 10000; // 5100 becomes 0.51, add 1 to it, 1.51
        const bonus =
            this.getDogtagCombatSkillBonusPercent(pmcData, activeDogtags) * hideoutManagementSkillBonusPercent;

        // Update bonus value to above calcualted value
        combatBonusProfile.value = Number.parseFloat(bonus.toFixed(2));
    }

    /**
     * Calculate the raw dogtag combat skill bonus for place of fame based on number of dogtags
     * Reverse engineered from client code
     * @param pmcData Player profile
     * @param activeDogtags Active dogtags in place of fame dogtag slots
     * @returns combat bonus
     */
    protected getDogtagCombatSkillBonusPercent(pmcData: IPmcData, activeDogtags: IItem[]): number {
        // Not own dogtag
        // Side = opposite of player
        let result = 0;
        for (const dogtag of activeDogtags) {
            if (!dogtag.upd.Dogtag) {
                continue;
            }

            if (Number.parseInt(dogtag.upd.Dogtag?.AccountId) === pmcData.aid) {
                continue;
            }

            result += 0.01 * dogtag.upd.Dogtag.Level;
        }

        return result;
    }

    /**
     * The wall pollutes a profile with various temp buffs/debuffs,
     * Remove them all
     * @param wallAreaDb Hideout area data
     * @param pmcData Player profile
     */
    public removeHideoutWallBuffsAndDebuffs(wallAreaDb: IHideoutArea, pmcData: IPmcData) {
        // Smush all stage bonuses into one array for easy iteration
        const wallBonuses = Object.values(wallAreaDb.stages).flatMap((stage) => stage.bonuses);

        // Get all bonus Ids that the wall adds
        const bonusIdsToRemove: string[] = [];
        for (const bonus of wallBonuses) {
            bonusIdsToRemove.push(bonus.id);
        }

        this.logger.debug(`Removing: ${bonusIdsToRemove.length} bonuses from profile`);

        // Remove the wall bonuses from profile by id
        pmcData.Bonuses = pmcData.Bonuses.filter((bonus) => !bonusIdsToRemove.includes(bonus.id));
    }
}
