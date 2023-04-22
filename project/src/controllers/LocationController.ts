import { inject, injectable } from "tsyringe";

import { LocationGenerator } from "../generators/LocationGenerator";
import { LootGenerator } from "../generators/LootGenerator";
import { WeightedRandomHelper } from "../helpers/WeightedRandomHelper";
import { ILocation } from "../models/eft/common/ILocation";
import { ILocationBase } from "../models/eft/common/ILocationBase";
import {
    ILocationsGenerateAllResponse
} from "../models/eft/common/ILocationsSourceDestinationBase";
import { ILooseLoot, SpawnpointTemplate } from "../models/eft/common/ILooseLoot";
import { AirdropTypeEnum } from "../models/enums/AirdropType";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { IAirdropConfig } from "../models/spt/config/IAirdropConfig";
import { ILocations } from "../models/spt/server/ILocations";
import { LootItem } from "../models/spt/services/LootItem";
import { LootRequest } from "../models/spt/services/LootRequest";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { LocalisationService } from "../services/LocalisationService";
import { HashUtil } from "../utils/HashUtil";
import { JsonUtil } from "../utils/JsonUtil";
import { TimeUtil } from "../utils/TimeUtil";

@injectable()
export class LocationController
{
    protected airdropConfig: IAirdropConfig;

    constructor(
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("LocationGenerator") protected locationGenerator: LocationGenerator,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("LootGenerator") protected lootGenerator: LootGenerator,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.airdropConfig = this.configServer.getConfig(ConfigTypes.AIRDROP);
    }

    /* get a location with generated loot data */
    public get(location: string): ILocationBase
    {
        const name = location.toLowerCase().replace(" ", "");
        return this.generate(name);
    }

    /* generates a random location preset to use for local session */
    public generate(name: string): ILocationBase
    {
        const location: ILocation = this.databaseServer.getTables().locations[name];
        const output: ILocationBase = location.base;
        // const ids = {};

        output.UnixDateTime = this.timeUtil.getTimestamp();

        // don't generate loot on hideout
        if (name === "hideout")
        {
            return output;
        }

        const locationName = location.base.Name;

        // generate loot
        const staticWeapons = this.jsonUtil.clone(this.databaseServer.getTables().loot.staticContainers[locationName].staticWeapons);
        const staticContainers = this.jsonUtil.clone(this.databaseServer.getTables().loot.staticContainers[locationName].staticContainers);
        const staticForced = this.jsonUtil.clone(this.databaseServer.getTables().loot.staticContainers[locationName].staticForced);
        const staticLootDist = this.jsonUtil.clone(this.databaseServer.getTables().loot.staticLoot);
        const staticAmmoDist = this.jsonUtil.clone(this.databaseServer.getTables().loot.staticAmmo);

        output.Loot = [];

        // mounted weapons
        for (const mi of staticWeapons)
        {
            output.Loot.push(mi);
        }

        let count = 0;
        // static loot
        for (const ci of staticContainers)
        {
            const container = this.locationGenerator.generateContainerLoot(ci, staticForced, staticLootDist, staticAmmoDist, name);
            output.Loot.push(container);
            count++;
        }

        this.logger.success(this.localisationService.getText("location-containers_generated_success", count));

        // dyanmic loot
        const dynamicLootDist: ILooseLoot = this.jsonUtil.clone(location.looseLoot);
        const dynamicLoot: SpawnpointTemplate[] = this.locationGenerator.generateDynamicLoot(dynamicLootDist, staticAmmoDist, name);
        for (const dli of dynamicLoot)
        {
            output.Loot.push(dli);
        }

        // done generating
        this.logger.success(this.localisationService.getText("location-dynamic_items_spawned_success", dynamicLoot.length));
        this.logger.success(this.localisationService.getText("location-generated_success", name));

        return output;
    }

    /**
     * Get all maps base location properties without loot data
     * @returns ILocationsGenerateAllResponse
     */
    public generateAll(): ILocationsGenerateAllResponse
    {
        const locations = this.databaseServer.getTables().locations;

        const returnResult: ILocationsGenerateAllResponse = {
            locations: undefined,
            paths: []
        };
        // use right id's and strip loot
        const data: ILocations = {};
        for (const name in locations)
        {
            if (name === "base")
            {
                continue;
            }

            const map = locations[name].base;

            map.Loot = [];
            data[map._Id] = map;
        }

        returnResult.locations = data;
        returnResult.paths = locations.base.paths;
        return returnResult;
    }

    /**
     * Get loot for an airdop container
     * Generates it randomly based on config/airdrop.json values
     * @returns Array of LootItem objects
     */
    public getAirdropLoot(): LootItem[]
    {
        const airdropType = this.chooseAirdropType();

        this.logger.debug(`Chose ${airdropType} for airdrop loot`);

        const airdropConfig = this.getAirdropLootConfigByType(airdropType);

        return this.lootGenerator.createRandomLoot(airdropConfig);
    }

    /**
     * Randomly pick a type of airdrop loot using weighted values from config
     * @returns airdrop type value
     */
    protected chooseAirdropType(): AirdropTypeEnum
    {
        const possibleAirdropTypes = this.airdropConfig.airdropTypeWeightings;

        return this.weightedRandomHelper.getWeightedValue(possibleAirdropTypes);
    }

    /**
     * Get the configuration for a specific type of airdrop
     * @param airdropType Type of airdrop to get settings for
     * @returns LootRequest
     */
    protected getAirdropLootConfigByType(airdropType: AirdropTypeEnum): LootRequest
    {
        let lootSettingsByType = this.airdropConfig.loot[airdropType];
        if (!lootSettingsByType)
        {
            this.logger.error(`Unable to find airdrop config settings for type: ${airdropType}, falling back to mixed`);
            lootSettingsByType = this.airdropConfig.loot[AirdropTypeEnum.MIXED];
        }

        return {
            presetCount: lootSettingsByType.presetCount,
            itemCount: lootSettingsByType.itemCount,
            itemBlacklist: lootSettingsByType.itemBlacklist,
            itemTypeWhitelist: lootSettingsByType.itemTypeWhitelist,
            itemLimits: lootSettingsByType.itemLimits,
            itemStackLimits: lootSettingsByType.itemStackLimits,
            armorLevelWhitelist: lootSettingsByType.armorLevelWhitelist
        };
    }
}