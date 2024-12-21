import type { IInventoryMagGen } from "@spt/generators/weapongen/IInventoryMagGen";
import type { InventoryMagGen } from "@spt/generators/weapongen/InventoryMagGen";
import { BotWeaponGeneratorHelper } from "@spt/helpers/BotWeaponGeneratorHelper";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { EquipmentSlots } from "@spt/models/enums/EquipmentSlots";
import { inject, injectable } from "tsyringe";

@injectable()
export class UbglExternalMagGen implements IInventoryMagGen {
    constructor(@inject("BotWeaponGeneratorHelper") protected botWeaponGeneratorHelper: BotWeaponGeneratorHelper) {}

    public getPriority(): number {
        return 1;
    }

    public canHandleInventoryMagGen(inventoryMagGen: InventoryMagGen): boolean {
        return inventoryMagGen.getWeaponTemplate()._parent === BaseClasses.UBGL;
    }

    public process(inventoryMagGen: InventoryMagGen): void {
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
