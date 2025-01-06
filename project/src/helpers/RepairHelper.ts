import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IProps, ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IRepairConfig } from "@spt/models/spt/config/IRepairConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class RepairHelper {
    protected repairConfig: IRepairConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
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
        itemToRepair: IItem,
        itemToRepairDetails: ITemplateItem,
        isArmor: boolean,
        amountToRepair: number,
        useRepairKit: boolean,
        traderQualityMultipler: number,
        applyMaxDurabilityDegradation = true,
    ): void {
        this.logger.debug(`Adding ${amountToRepair} to ${itemToRepairDetails._name} using kit: ${useRepairKit}`);

        const itemMaxDurability = this.cloner.clone(itemToRepair.upd.Repairable.MaxDurability);
        const itemCurrentDurability = this.cloner.clone(itemToRepair.upd.Repairable.Durability);
        const itemCurrentMaxDurability = this.cloner.clone(itemToRepair.upd.Repairable.MaxDurability);

        let newCurrentDurability = itemCurrentDurability + amountToRepair;
        let newCurrentMaxDurability = itemCurrentMaxDurability + amountToRepair;

        // Ensure new max isnt above items max
        if (newCurrentMaxDurability > itemMaxDurability) {
            newCurrentMaxDurability = itemMaxDurability;
        }

        // Ensure new current isnt above items max
        if (newCurrentDurability > itemMaxDurability) {
            newCurrentDurability = itemMaxDurability;
        }

        // Update Repairable properties with new values after repair
        itemToRepair.upd.Repairable = { Durability: newCurrentDurability, MaxDurability: newCurrentMaxDurability };

        // when modders set the repair coefficient to 0 it means that they dont want to lose durability on items
        // the code below generates a random degradation on the weapon durability
        if (applyMaxDurabilityDegradation) {
            const randomisedWearAmount = isArmor
                ? this.getRandomisedArmorRepairDegradationValue(
                      itemToRepairDetails._props.ArmorMaterial,
                      useRepairKit,
                      itemCurrentMaxDurability,
                      traderQualityMultipler,
                  )
                : this.getRandomisedWeaponRepairDegradationValue(
                      itemToRepairDetails._props,
                      useRepairKit,
                      itemCurrentMaxDurability,
                      traderQualityMultipler,
                  );

            // Apply wear to durability
            itemToRepair.upd.Repairable.MaxDurability -= randomisedWearAmount;

            // After adjusting max durability with degradation, ensure current dura isnt above max
            if (itemToRepair.upd.Repairable.Durability > itemToRepair.upd.Repairable.MaxDurability) {
                itemToRepair.upd.Repairable.Durability = itemToRepair.upd.Repairable.MaxDurability;
            }
        }

        // Repair mask cracks
        if (itemToRepair.upd.FaceShield && itemToRepair.upd.FaceShield?.Hits > 0) {
            itemToRepair.upd.FaceShield.Hits = 0;
        }
    }

    /**
     * Repairing armor reduces the total durability value slightly, get a randomised (to 2dp) amount based on armor material
     * @param armorMaterial What material is the armor being repaired made of
     * @param isRepairKit Was a repair kit used
     * @param armorMax Max amount of durability item can have
     * @param traderQualityMultipler Different traders produce different loss values
     * @returns Amount to reduce max durability by
     */
    protected getRandomisedArmorRepairDegradationValue(
        armorMaterial: string,
        isRepairKit: boolean,
        armorMax: number,
        traderQualityMultipler: number,
    ): number {
        // Degradation value is based on the armor material
        const armorMaterialSettings = this.databaseService.getGlobals().config.ArmorMaterials[armorMaterial];

        const minMultiplier = isRepairKit
            ? armorMaterialSettings.MinRepairKitDegradation
            : armorMaterialSettings.MinRepairDegradation;

        const maxMultiplier = isRepairKit
            ? armorMaterialSettings.MaxRepairKitDegradation
            : armorMaterialSettings.MaxRepairDegradation;

        const duraLossPercent = this.randomUtil.getFloat(minMultiplier, maxMultiplier);
        const duraLossMultipliedByTraderMultiplier = duraLossPercent * armorMax * traderQualityMultipler;

        return Number(duraLossMultipliedByTraderMultiplier.toFixed(2));
    }

    /**
     * Repairing weapons reduces the total durability value slightly, get a randomised (to 2dp) amount
     * @param itemProps Weapon properties
     * @param isRepairKit Was a repair kit used
     * @param weaponMax ax amount of durability item can have
     * @param traderQualityMultipler Different traders produce different loss values
     * @returns Amount to reduce max durability by
     */
    protected getRandomisedWeaponRepairDegradationValue(
        itemProps: IProps,
        isRepairKit: boolean,
        weaponMax: number,
        traderQualityMultipler: number,
    ): number {
        const minRepairDeg = isRepairKit ? itemProps.MinRepairKitDegradation : itemProps.MinRepairDegradation;
        let maxRepairDeg = isRepairKit ? itemProps.MaxRepairKitDegradation : itemProps.MaxRepairDegradation;

        // WORKAROUND: Some items are always 0 when repairkit is true
        if (maxRepairDeg === 0) {
            maxRepairDeg = itemProps.MaxRepairDegradation;
        }

        const duraLossPercent = this.randomUtil.getFloat(minRepairDeg, maxRepairDeg);
        const duraLossMultipliedByTraderMultiplier = duraLossPercent * weaponMax * traderQualityMultipler;

        return Number(duraLossMultipliedByTraderMultiplier.toFixed(2));
    }
}
