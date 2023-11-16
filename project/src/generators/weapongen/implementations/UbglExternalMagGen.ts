import { inject, injectable } from "tsyringe";

import { IInventoryMagGen } from "@spt-aki/generators/weapongen/IInventoryMagGen";
import { InventoryMagGen } from "@spt-aki/generators/weapongen/InventoryMagGen";
import { BotWeaponGeneratorHelper } from "@spt-aki/helpers/BotWeaponGeneratorHelper";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { EquipmentSlots } from "@spt-aki/models/enums/EquipmentSlots";

@injectable()
export class UbglExternalMagGen implements IInventoryMagGen
{
    constructor(@inject("BotWeaponGeneratorHelper") protected botWeaponGeneratorHelper: BotWeaponGeneratorHelper)
    {}

    public getPriority(): number
    {
        return 1;
    }

    public canHandleInventoryMagGen(inventoryMagGen: InventoryMagGen): boolean
    {
        return inventoryMagGen.getWeaponTemplate()._parent === BaseClasses.UBGL;
    }

    public process(inventoryMagGen: InventoryMagGen): void
    {
        const bulletCount = this.botWeaponGeneratorHelper.getRandomizedBulletCount(
            inventoryMagGen.getMagCount(),
            inventoryMagGen.getMagazineTemplate(),
        );
        this.botWeaponGeneratorHelper.addAmmoIntoEquipmentSlots(
            inventoryMagGen.getAmmoTemplate()._id,
            bulletCount,
            inventoryMagGen.getPmcInventory(),
            [EquipmentSlots.TACTICAL_VEST],
        );
    }
}
