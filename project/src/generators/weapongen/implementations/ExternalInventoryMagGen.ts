import { inject, injectable } from "tsyringe";

import { BotWeaponGeneratorHelper } from "../../../helpers/BotWeaponGeneratorHelper";
import { ItemHelper } from "../../../helpers/ItemHelper";
import { EquipmentSlots } from "../../../models/enums/EquipmentSlots";
import { ItemAddedResult } from "../../../models/enums/ItemAddedResult";
import { ILogger } from "../../../models/spt/utils/ILogger";
import { LocalisationService } from "../../../services/LocalisationService";
import { IInventoryMagGen } from "../IInventoryMagGen";
import { InventoryMagGen } from "../InventoryMagGen";

@injectable()
export class ExternalInventoryMagGen implements IInventoryMagGen
{

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("BotWeaponGeneratorHelper") protected botWeaponGeneratorHelper: BotWeaponGeneratorHelper
    )
    { }

    getPriority(): number 
    {
        return 99;
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    canHandleInventoryMagGen(inventoryMagGen: InventoryMagGen): boolean 
    {
        return true; // Fallback, if code reaches here it means no other implementation can handle this type of magazine
    }

    process(inventoryMagGen: InventoryMagGen): void 
    {
        let magTemplate = inventoryMagGen.getMagazineTemplate();
        let magazineTpl = magTemplate._id;
        const randomizedMagazineCount = Number(this.botWeaponGeneratorHelper.getRandomizedMagazineCount(inventoryMagGen.getMagCount()));
        for (let i = 0; i < randomizedMagazineCount; i++)
        {
            const magazineWithAmmo = this.botWeaponGeneratorHelper.createMagazineWithAmmo(magazineTpl, inventoryMagGen.getAmmoTemplate()._id, magTemplate);

            const ableToFitMagazinesIntoBotInventory = this.botWeaponGeneratorHelper.addItemWithChildrenToEquipmentSlot(
                [EquipmentSlots.TACTICAL_VEST, EquipmentSlots.POCKETS],
                magazineWithAmmo[0]._id,
                magazineTpl,
                magazineWithAmmo,
                inventoryMagGen.getPmcInventory());

            if (ableToFitMagazinesIntoBotInventory === ItemAddedResult.NO_SPACE && i < randomizedMagazineCount)
            {
                /* We were unable to fit at least the minimum amount of magazines,
                     * so we fallback to default magazine and try again.
                     * Temporary workaround to Killa spawning with no extras if he spawns with a drum mag */

                if (magazineTpl === this.botWeaponGeneratorHelper.getWeaponsDefaultMagazineTpl(inventoryMagGen.getWeaponTemplate()))
                {
                    // We were already on default - stop here to prevent infinite looping
                    break;
                }

                // Get default magazine tpl, reset loop counter by 1 and try again
                magazineTpl = this.botWeaponGeneratorHelper.getWeaponsDefaultMagazineTpl(inventoryMagGen.getWeaponTemplate());
                magTemplate = this.itemHelper.getItem(magazineTpl)[1];
                if (!magTemplate)
                {
                    this.logger.error(this.localisationService.getText("bot-unable_to_find_default_magazine_item", magazineTpl));
                    break;
                }

                if (magTemplate._props.ReloadMagType === "InternalMagazine")
                {
                    break;
                }

                i--;
            }
        }
    }
    
}