import { inject, injectable } from "tsyringe";

import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { ITemplateItem, Props } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IRepairConfig } from "@spt-aki/models/spt/config/IRepairConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

@injectable()
export class RepairHelper
{
    protected repairConfig: IRepairConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.repairConfig = this.configServer.getConfig(ConfigTypes.REPAIR);
    }

    /**
     * Alter an items durability after a repair by trader/repair kit
     * @param itemToRepair item to update durability details
     * @param itemToRepairDetails db details of item to repair
     * @param isArmor Is item being repaired a piece of armor
     * @param amountToRepair how many unit of durability to repair
     * @param useRepairKit Is item being repaired with a repair kit
     * @param traderQualityMultipler Trader quality value from traders base json
     * @param applyMaxDurabilityDegradation should item have max durability reduced
     */
    public updateItemDurability(
        itemToRepair: Item,
        itemToRepairDetails: ITemplateItem,
        isArmor: boolean,
        amountToRepair: number,
        useRepairKit: boolean,
        traderQualityMultipler: number,
        applyMaxDurabilityDegradation = true
    ): void
    {
        this.logger.debug(`Adding ${amountToRepair} to ${itemToRepairDetails._name} using kit: ${useRepairKit}`);
        const itemMaxDurability = this.jsonUtil.clone(itemToRepair.upd.Repairable.MaxDurability);
        const itemCurrentDurability = this.jsonUtil.clone(itemToRepair.upd.Repairable.Durability);
        const itemCurrentMaxDurability = this.jsonUtil.clone(itemToRepair.upd.Repairable.MaxDurability);

        let newCurrentDurability = itemCurrentDurability + amountToRepair;
        let newCurrentMaxDurability = itemCurrentMaxDurability + amountToRepair;

        // Ensure new max isnt above items max
        if (newCurrentMaxDurability > itemMaxDurability)
        {
            newCurrentMaxDurability = itemMaxDurability;
        }

        // Ensure new current isnt above items max
        if (newCurrentDurability > itemMaxDurability)
        {
            newCurrentDurability = itemMaxDurability;
        }

        // Construct object to return
        itemToRepair.upd.Repairable = {
            Durability: newCurrentDurability,
            MaxDurability: newCurrentMaxDurability
        };

        // when modders set the repair coefficient to 0 it means that they dont want to lose durability on items
        // the code below generates a random degradation on the weapon durability
        if (applyMaxDurabilityDegradation)
        {
            const randomisedWearAmount = (isArmor)
                ? this.getRandomisedArmorRepairDegradationValue(itemToRepairDetails._props.ArmorMaterial, useRepairKit, itemCurrentMaxDurability, traderQualityMultipler)
                : this.getRandomisedWeaponRepairDegradationValue(itemToRepairDetails._props, useRepairKit, itemCurrentMaxDurability, traderQualityMultipler);            
            
            // Apply wear to durability
            itemToRepair.upd.Repairable.MaxDurability -= randomisedWearAmount;
                
            // After adjusting max durability with degradation, ensure current dura isnt above max
            if (itemToRepair.upd.Repairable.Durability > itemToRepair.upd.Repairable.MaxDurability)
            {
                itemToRepair.upd.Repairable.Durability = itemToRepair.upd.Repairable.MaxDurability;
            }
        }

        // Repair mask cracks
        if (itemToRepair.upd.FaceShield && itemToRepair.upd.FaceShield.Hits > 0)
        {
            itemToRepair.upd.FaceShield.Hits = 0;
        }
    }

    protected getRandomisedArmorRepairDegradationValue(armorMaterial: string, isRepairKit: boolean, armorMax: number, traderQualityMultipler: number): number
    {
        const armorMaterialSettings = this.databaseServer.getTables().globals.config.ArmorMaterials[armorMaterial];

        const minMultiplier = isRepairKit
            ? armorMaterialSettings.MinRepairKitDegradation
            : armorMaterialSettings.MinRepairDegradation;

        const maxMultiplier = isRepairKit
            ? armorMaterialSettings.MaxRepairKitDegradation
            : armorMaterialSettings.MaxRepairDegradation;

        const duraLossPercent = this.randomUtil.getFloat(minMultiplier, maxMultiplier);
        const duraLossMultipliedByTraderMultiplier = (duraLossPercent * armorMax) * traderQualityMultipler; 

        return Number(duraLossMultipliedByTraderMultiplier.toFixed(2));
    }

    protected getRandomisedWeaponRepairDegradationValue(itemProps: Props, isRepairKit: boolean, weaponMax: number, traderQualityMultipler: number): number
    {
        const minRepairDeg = (isRepairKit)
            ? itemProps.MinRepairKitDegradation
            : itemProps.MinRepairDegradation;
        let maxRepairDeg = (isRepairKit)
            ? itemProps.MaxRepairKitDegradation
            : itemProps.MaxRepairDegradation;

        // WORKAROUND: Some items are always 0 when repairkit is true
        if (maxRepairDeg === 0)
        {
            maxRepairDeg = itemProps.MaxRepairDegradation;
        }

        const duraLossPercent = this.randomUtil.getFloat(minRepairDeg, maxRepairDeg);
        const duraLossMultipliedByTraderMultiplier = (duraLossPercent * weaponMax) * traderQualityMultipler; 

        return Number(duraLossMultipliedByTraderMultiplier.toFixed(2));
    }

    /**
     * Is the supplied tpl a weapon
     * @param tpl tplId to check is a weapon
     * @returns true if tpl is a weapon
     */
    public isWeaponTemplate(tpl: string): boolean
    {
        const itemTemplates = this.databaseServer.getTables().templates.items;
        const baseItem = itemTemplates[tpl];
        const baseNode = itemTemplates[baseItem._parent];
        const parentNode = itemTemplates[baseNode._parent];

        return parentNode._id === BaseClasses.WEAPON;
    }

}