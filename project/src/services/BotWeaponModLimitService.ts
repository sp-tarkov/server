import { ItemHelper } from "@spt/helpers/ItemHelper";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import { IBotConfig } from "@spt/models/spt/config/IBotConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { inject, injectable } from "tsyringe";

export class BotModLimits {
    scope: ItemCount;
    scopeMax: number;
    scopeBaseTypes: string[];
    flashlightLaser: ItemCount;
    flashlightLaserMax: number;
    flashlgihtLaserBaseTypes: string[];
}

export class ItemCount {
    count: number;
}

@injectable()
export class BotWeaponModLimitService {
    protected botConfig: IBotConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
    ) {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
    }

    /**
     * Initalise mod limits to be used when generating a weapon
     * @param botRole "assault", "bossTagilla" or "pmc"
     * @returns BotModLimits object
     */
    public getWeaponModLimits(botRole: string): BotModLimits {
        return {
            scope: { count: 0 },
            scopeMax: this.botConfig.equipment[botRole]?.weaponModLimits?.scopeLimit,
            scopeBaseTypes: [
                BaseClasses.OPTIC_SCOPE,
                BaseClasses.ASSAULT_SCOPE,
                BaseClasses.COLLIMATOR,
                BaseClasses.COMPACT_COLLIMATOR,
                BaseClasses.SPECIAL_SCOPE,
            ],
            flashlightLaser: { count: 0 },
            flashlightLaserMax: this.botConfig.equipment[botRole]?.weaponModLimits?.lightLaserLimit,
            flashlgihtLaserBaseTypes: [
                BaseClasses.TACTICAL_COMBO,
                BaseClasses.FLASHLIGHT,
                BaseClasses.PORTABLE_RANGE_FINDER,
            ],
        };
    }

    /**
     * Check if weapon mod item is on limited list + has surpassed the limit set for it
     * Exception: Always allow ncstar backup mount
     * Exception: Always allow scopes with a scope for a parent
     * Exception: Always disallow mounts that hold only scopes once scope limit reached
     * Exception: Always disallow mounts that hold only flashlights once flashlight limit reached
     * @param botRole role the bot has e.g. assault
     * @param modTemplate mods template data
     * @param modLimits limits set for weapon being generated for this bot
     * @param modsParent The parent of the mod to be checked
     * @returns true if over item limit
     */
    public weaponModHasReachedLimit(
        botRole: string,
        modTemplate: ITemplateItem,
        modLimits: BotModLimits,
        modsParent: ITemplateItem,
        weapon: IItem[],
    ): boolean {
        // If mod or mods parent is the NcSTAR MPR45 Backup mount, allow it as it looks cool
        if (
            modsParent._id === ItemTpl.MOUNT_NCSTAR_MPR45_BACKUP ||
            modTemplate._id === ItemTpl.MOUNT_NCSTAR_MPR45_BACKUP
        ) {
            // If weapon already has a longer ranged scope on it, allow ncstar to be spawned
            if (
                weapon.some((item) =>
                    this.itemHelper.isOfBaseclasses(item._tpl, [
                        BaseClasses.ASSAULT_SCOPE,
                        BaseClasses.OPTIC_SCOPE,
                        BaseClasses.SPECIAL_SCOPE,
                    ]),
                )
            ) {
                return false;
            }

            return true;
        }

        // Mods parent is scope and mod is scope, allow it (adds those mini-sights to the tops of sights)
        const modIsScope = this.itemHelper.isOfBaseclasses(modTemplate._id, modLimits.scopeBaseTypes);
        if (this.itemHelper.isOfBaseclasses(modsParent._id, modLimits.scopeBaseTypes) && modIsScope) {
            return false;
        }

        // If mod is a scope , Exit early
        if (modIsScope) {
            return this.weaponModLimitReached(modTemplate._id, modLimits.scope, modLimits.scopeMax, botRole);
        }

        // Don't allow multple mounts on a weapon (except when mount is on another mount)
        // Fail when:
        // Over or at scope limit on weapon
        // Item being added is a mount but the parent item is NOT a mount (Allows red dot sub-mounts on mounts)
        // Mount has one slot and its for a mod_scope
        if (
            modLimits.scope.count >= modLimits.scopeMax &&
            modTemplate._props.Slots?.length === 1 &&
            this.itemHelper.isOfBaseclass(modTemplate._id, BaseClasses.MOUNT) &&
            !this.itemHelper.isOfBaseclass(modsParent._id, BaseClasses.MOUNT) &&
            modTemplate._props.Slots.some((slot) => slot._name === "mod_scope")
        ) {
            return true;
        }

        // If mod is a light/laser, return if limit reached
        const modIsLightOrLaser = this.itemHelper.isOfBaseclasses(modTemplate._id, modLimits.flashlgihtLaserBaseTypes);
        if (modIsLightOrLaser) {
            return this.weaponModLimitReached(
                modTemplate._id,
                modLimits.flashlightLaser,
                modLimits.flashlightLaserMax,
                botRole,
            );
        }

        // Mod is a mount that can hold only flashlights ad limit is reached (dont want to add empty mounts if limit is reached)
        if (
            modLimits.scope.count >= modLimits.scopeMax &&
            modTemplate._props.Slots?.length === 1 &&
            this.itemHelper.isOfBaseclass(modTemplate._id, BaseClasses.MOUNT) &&
            modTemplate._props.Slots.some((slot) => slot._name === "mod_flashlight")
        ) {
            return true;
        }

        return false;
    }

    /**
     * Check if the specific item type on the weapon has reached the set limit
     * @param modTpl log mod tpl if over type limit
     * @param currentCount current number of this item on gun
     * @param maxLimit mod limit allowed
     * @param botRole role of bot we're checking weapon of
     * @returns true if limit reached
     */
    protected weaponModLimitReached(
        modTpl: string,
        currentCount: { count: number },
        maxLimit: number,
        botRole: string,
    ): boolean {
        // No value or 0
        if (!maxLimit) {
            return false;
        }

        // Has mod limit for bot type been reached
        if (currentCount.count >= maxLimit) {
            // this.logger.debug(`[${botRole}] scope limit reached! tried to add ${modTpl} but scope count is ${currentCount.count}`);
            return true;
        }

        // Increment scope count
        currentCount.count++;

        return false;
    }
}
