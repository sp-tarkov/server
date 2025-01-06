import { LootGenerator } from "@spt/generators/LootGenerator";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IGetAirdropLootRequest } from "@spt/models/eft/location/IGetAirdropLootRequest";
import { IGetAirdropLootResponse } from "@spt/models/eft/location/IGetAirdropLootResponse";
import { AirdropTypeEnum, SptAirdropTypeEnum } from "@spt/models/enums/AirdropType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import { IAirdropConfig, IAirdropLoot } from "@spt/models/spt/config/IAirdropConfig";
import { IAirdropLootRequest, ILootRequest } from "@spt/models/spt/services/ILootRequest";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { ItemFilterService } from "@spt/services/ItemFilterService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HashUtil } from "@spt/utils/HashUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class AirdropService {
    protected airdropConfig: IAirdropConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("LootGenerator") protected lootGenerator: LootGenerator,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.airdropConfig = this.configServer.getConfig(ConfigTypes.AIRDROP);
    }

    public generateCustomAirdropLoot(request: IGetAirdropLootRequest): IGetAirdropLootResponse {
        const customAirdropInformation = this.airdropConfig.customAirdropMapping[request.containerId];
        if (!customAirdropInformation) {
            this.logger.warning(
                `Unable to find data for custom airdrop ${request.containerId}, returning random airdrop instead`,
            );

            return this.generateAirdropLoot();
        }

        return this.generateAirdropLoot(customAirdropInformation);
    }

    /**
     * Handle client/location/getAirdropLoot
     * Get loot for an airdrop container
     * Generates it randomly based on config/airdrop.json values
     * @param forcedAirdropType OPTIONAL - Desired airdrop type, randomised when not provided
     * @returns Array of LootItem objects
     */
    public generateAirdropLoot(forcedAirdropType = null): IGetAirdropLootResponse {
        const airdropType = forcedAirdropType ? forcedAirdropType : this.chooseAirdropType();
        this.logger.debug(`Chose: ${airdropType} for airdrop loot`);

        // Common/weapon/etc
        const airdropConfig = this.getAirdropLootConfigByType(airdropType);

        // generate loot to put into airdrop crate
        const crateLoot = airdropConfig.useForcedLoot
            ? this.lootGenerator.createForcedLoot(airdropConfig.forcedLoot)
            : this.lootGenerator.createRandomLoot(airdropConfig);

        // Create airdrop crate and add to result in first spot
        const airdropCrateItem = this.getAirdropCrateItem(airdropType);

        // Add crate to front of array
        crateLoot.unshift(airdropCrateItem);

        // Reparent loot items to crate we added above
        for (const item of crateLoot) {
            if (item._id === airdropCrateItem._id) {
                // Crate itself, don't alter
                continue;
            }

            // no parentId = root item, make item have create as parent
            if (!item.parentId) {
                item.parentId = airdropCrateItem._id;
                item.slotId = "main";
            }
        }

        return { icon: airdropConfig.icon, container: crateLoot };
    }

    /**
     * Create a container create item based on passed in airdrop type
     * @param airdropType What tpye of container: weapon/common etc
     * @returns Item
     */
    protected getAirdropCrateItem(airdropType: SptAirdropTypeEnum): IItem {
        const airdropContainer = {
            _id: this.hashUtil.generate(),
            _tpl: "", // picked later
            upd: {
                SpawnedInSession: true,
                StackObjectsCount: 1,
            },
        };

        switch (airdropType) {
            case SptAirdropTypeEnum.FOOD_MEDICAL:
                airdropContainer._tpl = ItemTpl.LOOTCONTAINER_AIRDROP_MEDICAL_CRATE;
                break;
            case SptAirdropTypeEnum.SUPPLY:
                airdropContainer._tpl = ItemTpl.LOOTCONTAINER_AIRDROP_SUPPLY_CRATE;
                break;
            case SptAirdropTypeEnum.WEAPON_ARMOR:
                airdropContainer._tpl = ItemTpl.LOOTCONTAINER_AIRDROP_WEAPON_CRATE;
                break;
            case SptAirdropTypeEnum.COMMON:
                airdropContainer._tpl = ItemTpl.LOOTCONTAINER_AIRDROP_COMMON_SUPPLY_CRATE;
                break;
            case SptAirdropTypeEnum.RADAR:
                airdropContainer._tpl = ItemTpl.LOOTCONTAINER_AIRDROP_TECHNICAL_SUPPLY_CRATE_EVENT_1;
                break;
            default:
                airdropContainer._tpl = ItemTpl.LOOTCONTAINER_AIRDROP_COMMON_SUPPLY_CRATE;
                break;
        }

        return airdropContainer;
    }

    /**
     * Randomly pick a type of airdrop loot using weighted values from config
     * @returns airdrop type value
     */
    protected chooseAirdropType(): SptAirdropTypeEnum {
        const possibleAirdropTypes = this.airdropConfig.airdropTypeWeightings;

        return this.weightedRandomHelper.getWeightedValue(possibleAirdropTypes);
    }

    /**
     * Get the configuration for a specific type of airdrop
     * @param airdropType Type of airdrop to get settings for
     * @returns LootRequest
     */
    protected getAirdropLootConfigByType(airdropType: AirdropTypeEnum): IAirdropLootRequest {
        let lootSettingsByType: IAirdropLoot = this.airdropConfig.loot[airdropType];
        if (!lootSettingsByType) {
            this.logger.error(
                this.localisationService.getText("location-unable_to_find_airdrop_drop_config_of_type", airdropType),
            );

            // Default to common
            lootSettingsByType = this.airdropConfig.loot[AirdropTypeEnum.COMMON];
        }

        // Get all items that match the blacklisted types and fold into item blacklist
        const itemTypeBlacklist = this.itemFilterService.getItemRewardBaseTypeBlacklist();
        const itemsMatchingTypeBlacklist = Object.values(this.itemHelper.getItems())
            .filter((templateItem) => this.itemHelper.isOfBaseclasses(templateItem._parent, itemTypeBlacklist))
            .map((templateItem) => templateItem._id);
        const itemBlacklist = new Set([
            ...lootSettingsByType.itemBlacklist,
            ...this.itemFilterService.getItemRewardBlacklist(),
            ...this.itemFilterService.getBossItems(),
            ...itemsMatchingTypeBlacklist,
        ]);

        return {
            icon: lootSettingsByType.icon,
            weaponPresetCount: lootSettingsByType.weaponPresetCount,
            armorPresetCount: lootSettingsByType.armorPresetCount,
            itemCount: lootSettingsByType.itemCount,
            weaponCrateCount: lootSettingsByType.weaponCrateCount,
            itemBlacklist: Array.from(itemBlacklist),
            itemTypeWhitelist: lootSettingsByType.itemTypeWhitelist,
            itemLimits: lootSettingsByType.itemLimits,
            itemStackLimits: lootSettingsByType.itemStackLimits,
            armorLevelWhitelist: lootSettingsByType.armorLevelWhitelist,
            allowBossItems: lootSettingsByType.allowBossItems,
            useForcedLoot: lootSettingsByType.useForcedLoot,
            forcedLoot: lootSettingsByType.forcedLoot,
        };
    }
}
