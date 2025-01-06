import { IInventoryMagGen } from "@spt/generators/weapongen/IInventoryMagGen";
import { InventoryMagGen } from "@spt/generators/weapongen/InventoryMagGen";
import { BotGeneratorHelper } from "@spt/helpers/BotGeneratorHelper";
import { BotWeaponGeneratorHelper } from "@spt/helpers/BotWeaponGeneratorHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { EquipmentSlots } from "@spt/models/enums/EquipmentSlots";
import { ItemAddedResult } from "@spt/models/enums/ItemAddedResult";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { LocalisationService } from "@spt/services/LocalisationService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class ExternalInventoryMagGen implements IInventoryMagGen {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("BotWeaponGeneratorHelper") protected botWeaponGeneratorHelper: BotWeaponGeneratorHelper,
        @inject("BotGeneratorHelper") protected botGeneratorHelper: BotGeneratorHelper,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
    ) {}

    getPriority(): number {
        return 99;
    }

    canHandleInventoryMagGen(inventoryMagGen: InventoryMagGen): boolean {
        return true; // Fallback, if code reaches here it means no other implementation can handle this type of magazine
    }

    process(inventoryMagGen: InventoryMagGen): void {
        // Cout of attempts to fit a magazine into bot inventory
        let fitAttempts = 0;

        // Magazine Db template
        let magTemplate = inventoryMagGen.getMagazineTemplate();
        let magazineTpl = magTemplate._id;
        const weapon = inventoryMagGen.getWeaponTemplate();
        const attemptedMagBlacklist: string[] = [];
        const defaultMagazineTpl = this.botWeaponGeneratorHelper.getWeaponsDefaultMagazineTpl(weapon);
        const randomizedMagazineCount = Number(
            this.botWeaponGeneratorHelper.getRandomizedMagazineCount(inventoryMagGen.getMagCount()),
        );
        for (let i = 0; i < randomizedMagazineCount; i++) {
            const magazineWithAmmo = this.botWeaponGeneratorHelper.createMagazineWithAmmo(
                magazineTpl,
                inventoryMagGen.getAmmoTemplate()._id,
                magTemplate,
            );

            const fitsIntoInventory = this.botGeneratorHelper.addItemWithChildrenToEquipmentSlot(
                [EquipmentSlots.TACTICAL_VEST, EquipmentSlots.POCKETS],
                magazineWithAmmo[0]._id,
                magazineTpl,
                magazineWithAmmo,
                inventoryMagGen.getPmcInventory(),
            );

            if (fitsIntoInventory === ItemAddedResult.NO_CONTAINERS) {
                // No containers to fit magazines, stop trying
                break;
            }

            // No space for magazine and we haven't reached desired magazine count
            if (fitsIntoInventory === ItemAddedResult.NO_SPACE && i < randomizedMagazineCount) {
                // Prevent infinite loop by only allowing 5 attempts at fitting a magazine into inventory
                if (fitAttempts > 5) {
                    this.logger.debug(
                        `Failed ${fitAttempts} times to add magazine ${magazineTpl} to bot inventory, stopping`,
                    );

                    break;
                }

                /* We were unable to fit at least the minimum amount of magazines,
                 * so we fallback to default magazine and try again.
                 * Temporary workaround to Killa spawning with no extra mags if he spawns with a drum mag */

                if (magazineTpl === defaultMagazineTpl) {
                    // We were already on default - stop here to prevent infinite looping
                    break;
                }

                // Add failed magazine tpl to blacklist
                attemptedMagBlacklist.push(magazineTpl);

                // Set chosen magazine tpl to the weapons default magazine tpl and try to fit into inventory next loop
                magazineTpl = defaultMagazineTpl;
                magTemplate = this.itemHelper.getItem(magazineTpl)[1];
                if (!magTemplate) {
                    this.logger.error(
                        this.localisationService.getText("bot-unable_to_find_default_magazine_item", magazineTpl),
                    );

                    break;
                }

                // Edge case - some weapons (SKS) have an internal magazine as default, choose random non-internal magazine to add to bot instead
                if (magTemplate._props.ReloadMagType === "InternalMagazine") {
                    const result = this.getRandomExternalMagazineForInternalMagazineGun(
                        inventoryMagGen.getWeaponTemplate()._id,
                        attemptedMagBlacklist,
                    );
                    if (!result?._id) {
                        this.logger.debug(
                            `Unable to add additional magazine into bot inventory for weapon: ${weapon._name}, attempted: ${fitAttempts} times`,
                        );

                        break;
                    }

                    magazineTpl = result._id;
                    magTemplate = result;
                    fitAttempts++;
                }

                // Reduce loop counter by 1 to ensure we get full cout of desired magazines
                i--;
            }

            if (fitsIntoInventory === ItemAddedResult.SUCCESS) {
                // Reset fit counter now it succeeded
                fitAttempts = 0;
            }
        }
    }

    /**
     * Get a random compatible external magazine for a weapon, exclude internal magazines from possible pool
     * @param weaponTpl Weapon to get mag for
     * @returns tpl of magazine
     */
    protected getRandomExternalMagazineForInternalMagazineGun(
        weaponTpl: string,
        magazineBlacklist: string[],
    ): ITemplateItem | undefined {
        // The mag Slot data for the weapon
        const magSlot = this.itemHelper.getItem(weaponTpl)[1]._props.Slots.find((x) => x._name === "mod_magazine");
        if (!magSlot) {
            return undefined;
        }

        // All possible mags that fit into the weapon excluding blacklisted
        const magazinePool = magSlot._props.filters[0].Filter.filter((x) => !magazineBlacklist.includes(x)).map(
            (x) => this.itemHelper.getItem(x)[1],
        );
        if (!magazinePool) {
            return undefined;
        }

        // Non-internal magazines that fit into the weapon
        const externalMagazineOnlyPool = magazinePool.filter((x) => x._props.ReloadMagType !== "InternalMagazine");
        if (!externalMagazineOnlyPool || externalMagazineOnlyPool?.length === 0) {
            return undefined;
        }

        // Randomly chosen external magazine
        return this.randomUtil.getArrayValue(externalMagazineOnlyPool);
    }
}
