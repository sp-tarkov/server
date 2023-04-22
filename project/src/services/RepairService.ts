import { inject, injectable } from "tsyringe";

import { ItemHelper } from "../helpers/ItemHelper";
import { QuestHelper } from "../helpers/QuestHelper";
import { RepairHelper } from "../helpers/RepairHelper";
import { TraderHelper } from "../helpers/TraderHelper";
import { WeightedRandomHelper } from "../helpers/WeightedRandomHelper";
import { ArmorType } from "../models/eft/common/IGlobals";
import { IPmcData } from "../models/eft/common/IPmcData";
import { Item } from "../models/eft/common/tables/IItem";
import { ITemplateItem } from "../models/eft/common/tables/ITemplateItem";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { RepairKitsInfo } from "../models/eft/repair/IRepairActionDataRequest";
import { RepairItem } from "../models/eft/repair/ITraderRepairActionDataRequest";
import { IProcessBuyTradeRequestData } from "../models/eft/trade/IProcessBuyTradeRequestData";
import { BaseClasses } from "../models/enums/BaseClasses";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { BonusSettings, IRepairConfig } from "../models/spt/config/IRepairConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { RandomUtil } from "../utils/RandomUtil";
import { PaymentService } from "./PaymentService";

@injectable()
export class RepairService
{
    protected repairConfig: IRepairConfig;
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("PaymentService") protected paymentService: PaymentService,
        @inject("RepairHelper") protected repairHelper: RepairHelper,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.repairConfig = this.configServer.getConfig(ConfigTypes.REPAIR);
    }

    /**
     * Use trader to repair an items durability
     * @param sessionID Session id
     * @param pmcData profile to find item to repair in
     * @param repairItemDetails details of the item to repair
     * @param traderId Trader being used to repair item
     * @returns RepairDetails object
     */
    public repairItemByTrader(sessionID: string, pmcData: IPmcData, repairItemDetails: RepairItem, traderId: string): RepairDetails
    {
        const itemToRepair = pmcData.Inventory.items.find(x => x._id === repairItemDetails._id);
        if (itemToRepair === undefined)
        {
            throw new Error(`Item ${repairItemDetails._id} not found in profile inventory, unable to repair`);
        }

        const priceCoef = this.traderHelper.getLoyaltyLevel(traderId, pmcData).repair_price_coef;
        const traderRepairDetails = this.traderHelper.getTrader(traderId, sessionID).repair;
        const repairQualityMultiplier = traderRepairDetails.quality;
        const repairRate = (priceCoef <= 0)
            ? 1
            : (priceCoef / 100 + 1);

        const itemToRepairDetails = this.databaseServer.getTables().templates.items[itemToRepair._tpl];
        const repairItemIsArmor = (!!itemToRepairDetails._props.ArmorMaterial);

        this.repairHelper.updateItemDurability(
            itemToRepair,
            itemToRepairDetails,
            repairItemIsArmor,
            repairItemDetails.count,
            false,
            repairQualityMultiplier,
            repairQualityMultiplier !== 0 && this.repairConfig.applyRandomizeDurabilityLoss
        );

        // get repair price
        const itemRepairCost = this.databaseServer.getTables().templates.items[itemToRepair._tpl]._props.RepairCost;
        const repairCost = Math.round((itemRepairCost * repairItemDetails.count * repairRate) * this.repairConfig.priceMultiplier);

        this.logger.debug(`item base repair cost: ${itemRepairCost}`, true);
        this.logger.debug(`price multipler: ${this.repairConfig.priceMultiplier}`, true);
        this.logger.debug(`repair cost: ${repairCost}`, true);

        return {
            repairCost: repairCost,
            repairedItem: itemToRepair,
            repairedItemIsArmor: repairItemIsArmor,
            repairAmount: repairItemDetails.count,
            repairedByKit: false
        };
    }

    /**
     * 
     * @param sessionID Session id
     * @param pmcData profile to take money from
     * @param repairedItemId Repaired item id
     * @param repairCost Cost to repair item in roubles
     * @param traderId Id of the trader who repaired the item / who is paid
     * @param output 
     */
    public payForRepair(
        sessionID: string,
        pmcData: IPmcData,
        repairedItemId: string,
        repairCost: number,
        traderId: string,
        output: IItemEventRouterResponse): void
    {
        const options: IProcessBuyTradeRequestData = {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            scheme_items: [
                {
                    id: repairedItemId,
                    count: Math.round(repairCost)
                }
            ],
            tid: traderId,
            Action: "",
            type: "",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            item_id: "",
            count: 0,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            scheme_id: 0
        };

        this.paymentService.payMoney(pmcData, options, sessionID, output);
    }

    /**
     * Add skill points to profile after repairing an item
     * @param sessionId Session id
     * @param repairDetails details of item repaired, cost/item
     * @param pmcData Profile to add points to
     */
    public addRepairSkillPoints(sessionId: string,
        repairDetails: RepairDetails,
        pmcData: IPmcData): void
    {
        if (this.itemHelper.isOfBaseclass(repairDetails.repairedItem._tpl, BaseClasses.WEAPON))
        {
            const progress = this.databaseServer.getTables().globals.config.SkillsSettings.WeaponTreatment.SkillPointsPerRepair;
            this.questHelper.rewardSkillPoints(sessionId, pmcData, "WeaponTreatment", progress);
        }

        // Handle kit repairs of armor
        if (repairDetails.repairedByKit && this.itemHelper.isOfBaseclasses(repairDetails.repairedItem._tpl, [BaseClasses.ARMOR, BaseClasses.VEST]))
        {
            const itemDetails = this.itemHelper.getItem(repairDetails.repairedItem._tpl);
            if (!itemDetails[0])
            {
                this.logger.error(`Unable to find item ${repairDetails.repairedItem._tpl} in items db, cannot add skill points`);
                return;
            }

            const isHeavyArmor = itemDetails[1]._props.ArmorType === "Heavy";
            const skillToLevel = (isHeavyArmor) ? "HeavyVests" : "LightVests";
            const pointsToAddToSkill = repairDetails.repairAmount * this.repairConfig.armorKitSkillPointGainPerRepairPointMultiplier;

            this.questHelper.rewardSkillPoints(sessionId, pmcData, skillToLevel, pointsToAddToSkill);
        }
    }
    
    /**
     * 
     * @param sessionId Session id
     * @param pmcData Profile to update repaired item in
     * @param repairKits Array of Repair kits to use
     * @param itemToRepairId Item id to repair
     * @param output IItemEventRouterResponse
     * @returns Details of repair, item/price
     */
    public repairItemByKit(
        sessionId: string,
        pmcData: IPmcData,
        repairKits: RepairKitsInfo[],
        itemToRepairId: string,
        output: IItemEventRouterResponse): RepairDetails
    {
        // Find item to repair in inventory
        const itemToRepair = pmcData.Inventory.items.find((x: { _id: string; }) => x._id === itemToRepairId);
        if (itemToRepair === undefined)
        {
            throw new Error(`Item ${itemToRepairId} not found, unable to repair`);
        }

        const itemToRepairDetails = this.databaseServer.getTables().templates.items[itemToRepair._tpl];
        const repairItemIsArmor = (!!itemToRepairDetails._props.ArmorMaterial);

        this.repairHelper.updateItemDurability(
            itemToRepair,
            itemToRepairDetails,
            repairItemIsArmor,
            repairKits[0].count / this.getKitDivisor(itemToRepairDetails, repairItemIsArmor, pmcData),
            this.repairConfig.applyRandomizeDurabilityLoss,
            1);

        // Find and use repair kit defined in body
        for (const repairKit of repairKits)
        {
            const repairKitInInventory = pmcData.Inventory.items.find(x => x._id === repairKit._id);
            const repairKitDetails = this.databaseServer.getTables().templates.items[repairKitInInventory._tpl];
            const repairKitReductionAmount = repairKit.count;

            this.addMaxResourceToKitIfMissing(repairKitDetails, repairKitInInventory);

            // reduce usages on repairkit used
            repairKitInInventory.upd.RepairKit.Resource -= repairKitReductionAmount;

            output.profileChanges[sessionId].items.change.push(repairKitInInventory);
        }

        return {
            repairedItem: itemToRepair,
            repairedItemIsArmor: repairItemIsArmor,
            repairAmount: repairKits[0].count,
            repairedByKit: true
        };
    }

    /**
     * Calculate value repairkit points need to be divided by to get the durability points to be added to an item
     * @param itemToRepairDetails Item to repair details
     * @param isArmor Is the item being repaired armor
     * @param pmcData Player profile
     * @returns Number to divide kit points by
     */
    protected getKitDivisor(itemToRepairDetails: ITemplateItem, isArmor: boolean, pmcData: IPmcData): number 
    {
        const globals = this.databaseServer.getTables().globals;
        const globalRepairSettings = globals.config.RepairSettings;

        const intellectRepairPointsPerLevel = globals.config.SkillsSettings.Intellect.RepairPointsCostReduction;
        const profileIntellectLevel = pmcData.Skills?.Common?.find(s => s.Id === "Intellect")?.Progress ?? 0;
        const intellectPointReduction = intellectRepairPointsPerLevel * Math.trunc(profileIntellectLevel / 100);

        if (isArmor)
        {
            const durabilityPointCostArmor = globalRepairSettings.durabilityPointCostArmor;
            const repairArmorBonus = this.getBonusMultiplierValue("RepairArmorBonus", pmcData);
            const armorBonus = (1.0 - (repairArmorBonus - 1.0) - intellectPointReduction);
            const materialType = itemToRepairDetails._props.ArmorMaterial ?? "";
            const armorMaterial = globals.config.ArmorMaterials[materialType] as ArmorType;
            const destructability = (1 + armorMaterial.Destructibility);
            const armorClass = parseInt(`${itemToRepairDetails._props.armorClass}`);
            const armorClassDivisor = globals.config.RepairSettings.armorClassDivisor;
            const armorClassMultiplier = (1.0 + armorClass / armorClassDivisor);

            return durabilityPointCostArmor * armorBonus * destructability * armorClassMultiplier;
        }
        else 
        {
            const repairWeaponBonus = this.getBonusMultiplierValue("RepairWeaponBonus", pmcData) - 1;
            const repairPointMultiplier = (1.0 - repairWeaponBonus - intellectPointReduction);
            const durabilityPointCostGuns = globals.config.RepairSettings.durabilityPointCostGuns;

            return durabilityPointCostGuns * repairPointMultiplier;
        }
    }

    /**
     * Get the bonus multiplier for a skill from a player profile
     * @param skillBonusName Name of bonus to get multipler of
     * @param pmcData Player profile to look in for skill
     * @returns Multiplier value
     */
    protected getBonusMultiplierValue(skillBonusName: string, pmcData: IPmcData): number
    {
        const bonusesMatched = pmcData?.Bonuses?.filter(b => b.type === skillBonusName);
        let value = 1;
        if (bonusesMatched != null)
        {
            const sumedPercentage = bonusesMatched.map(b => b.value).reduce((v1,v2) => v1 + v2, 0);
            value = 1 + sumedPercentage / 100;
        }

        return value;
    }

    /**
     * Update repair kits Resource object if it doesn't exist
     * @param repairKitDetails Repair kit details from db
     * @param repairKitInInventory Repair kit to update
     */
    protected addMaxResourceToKitIfMissing(repairKitDetails: ITemplateItem, repairKitInInventory: Item): void
    {
        const maxRepairAmount = repairKitDetails._props.MaxRepairResource;
        if (!repairKitInInventory.upd.RepairKit?.Resource)
        {
            repairKitInInventory.upd.RepairKit = {
                Resource: maxRepairAmount
            };
        }
    }

    /**
     * Chance to apply buff to an item (Armor/weapon) if repaired by armor kit
     * @param repairDetails Repair details of item
     * @param pmcData Player profile
     */
    public addBuffToItem(repairDetails: RepairDetails, pmcData: IPmcData): void
    {
        // Buffs are repair kit only
        if (!repairDetails.repairedByKit)
        {
            return;
        }

        if (this.shouldBuffItem(repairDetails, pmcData))
        {
            if (this.itemHelper.isOfBaseclasses(repairDetails.repairedItem._tpl, [BaseClasses.ARMOR, BaseClasses.VEST]))
            {
                const armorConfig = this.repairConfig.repairKit.armor;
                this.addBuff(armorConfig, repairDetails);
            }
            else if (this.itemHelper.isOfBaseclass(repairDetails.repairedItem._tpl, BaseClasses.WEAPON))
            {
                const weaponConfig = this.repairConfig.repairKit.weapon;
                this.addBuff(weaponConfig, repairDetails);
            }
            // TODO: Knife repair kits may be added at some point, a bracket needs to be added here
        }
    }

    /**
     * Add buff to item
     * @param itemConfig weapon/armor config 
     * @param repairDetails Details for item to repair
     */
    protected addBuff(itemConfig: BonusSettings, repairDetails: RepairDetails): void
    {
        const bonusRarity = this.weightedRandomHelper.getWeightedInventoryItem(itemConfig.rarityWeight);
        const bonusType = this.weightedRandomHelper.getWeightedInventoryItem(itemConfig.bonusTypeWeight);

        const bonusValues = itemConfig[bonusRarity][bonusType].valuesMinMax;
        const bonusValue = this.randomUtil.getFloat(bonusValues.min, bonusValues.max);

        const bonusThresholdPercents = itemConfig[bonusRarity][bonusType].activeDurabilityPercentMinMax;
        const bonusThresholdPercent = this.randomUtil.getInt(bonusThresholdPercents.min, bonusThresholdPercents.max);

        repairDetails.repairedItem.upd.Buff = {
            rarity: bonusRarity,
            buffType: bonusType,
            value: bonusValue,
            thresholdDurability: this.randomUtil.getPercentOfValue(bonusThresholdPercent, repairDetails.repairedItem.upd.Repairable.Durability)
        };
    }

    /**
     * Check if item should be buffed by checking the item type and relevant player skill level
     * @param repairDetails Item that was repaired
     * @param itemTpl tpl of item to be buffed
     * @param pmcData Player profile
     * @returns True if item should have buff applied
     */
    protected shouldBuffItem(repairDetails: RepairDetails, pmcData: IPmcData): boolean
    {
        const globals = this.databaseServer.getTables().globals;

        const hasTemplate = this.itemHelper.getItem(repairDetails.repairedItem._tpl);
        if (!hasTemplate[0])
            return false;
        const template = hasTemplate[1];

        const itemSkillType = this.getItemSkillType(template);
        if (!itemSkillType)
            return false;

        const commonBuffMinChanceValue = globals.config.SkillsSettings[itemSkillType].BuffSettings.CommonBuffMinChanceValue;
        const commonBuffChanceLevelBonus = globals.config.SkillsSettings[itemSkillType].BuffSettings.CommonBuffChanceLevelBonus;
        const receivedDurabilityMaxPercent = globals.config.SkillsSettings[itemSkillType].BuffSettings.ReceivedDurabilityMaxPercent;

        const skillLevel = Math.trunc((pmcData?.Skills?.Common?.find(s => s.Id === itemSkillType)?.Progress ?? 0) / 100);

        const durabilityToRestorePercent = repairDetails.repairAmount / template._props.MaxDurability;
        const durabilityMultiplier = this.getDurabilityMultiplier(receivedDurabilityMaxPercent, durabilityToRestorePercent);

        const doBuff = commonBuffMinChanceValue + commonBuffChanceLevelBonus * skillLevel * durabilityMultiplier;

        if (Math.random() <= doBuff)
        {
            return true;
        }

        return false;
    }
    
    /**
     * Based on item, what underlying skill does this item use for buff settings
     * @param itemTemplate Item to check for skill
     * @returns Skill name
     */
    protected getItemSkillType(itemTemplate: ITemplateItem): string  
    {
        if (this.itemHelper.isOfBaseclass(itemTemplate._id, BaseClasses.ARMOR))
        {
            if (itemTemplate._props.ArmorType === "Light")
            {
                return "LightVests";
            }
            else if (itemTemplate._props.ArmorType === "Heavy")
            {
                return "HeavyVests";
            }
        }
        else if (this.itemHelper.isOfBaseclass(itemTemplate._id, BaseClasses.WEAPON))
        {
            return "WeaponTreatment";
        }
        else if (this.itemHelper.isOfBaseclass(itemTemplate._id, BaseClasses.KNIFE))
        {
            return "Melee";
        }

        return undefined;
    }

    /**
     * Ensure multiplier is between 1 and 0.01
     * @param receiveDurabilityMaxPercent Max durabiltiy percent
     * @param receiveDurabilityPercent current durability percent
     * @returns durability multipler value
     */
    protected getDurabilityMultiplier(receiveDurabilityMaxPercent: number, receiveDurabilityPercent: number): number
    {
        receiveDurabilityMaxPercent = ((receiveDurabilityMaxPercent > 0) ? receiveDurabilityMaxPercent : 0.01);
        const num = receiveDurabilityPercent / receiveDurabilityMaxPercent;
        if (num > 1)
        {
            return 1.0;
        }
        if (num < 0.01)
        {
            return 0.01;
        }

        return num;
    }
}

export class RepairDetails
{
    repairCost?: number;
    repairedItem: Item;
    repairedItemIsArmor: boolean;
    repairAmount: number;
    repairedByKit: boolean;
}