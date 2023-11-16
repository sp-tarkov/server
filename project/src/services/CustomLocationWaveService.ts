import { inject, injectable } from "tsyringe";

import { BossLocationSpawn, ILocationBase, Wave } from "@spt-aki/models/eft/common/ILocationBase";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { ILocationConfig } from "@spt-aki/models/spt/config/ILocationConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

@injectable()
export class CustomLocationWaveService
{
    protected locationConfig: ILocationConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
    }

    /**
     * Add a boss wave to a map
     * @param locationId e.g. factory4_day, bigmap
     * @param waveToAdd Boss wave to add to map
     */
    public addBossWaveToMap(locationId: string, waveToAdd: BossLocationSpawn): void
    {
        this.locationConfig.customWaves.boss[locationId].push(waveToAdd);
    }

    /**
     * Add a normal bot wave to a map
     * @param locationId e.g. factory4_day, bigmap
     * @param waveToAdd Wave to add to map
     */
    public addNormalWaveToMap(locationId: string, waveToAdd: Wave): void
    {
        this.locationConfig.customWaves.normal[locationId].push(waveToAdd);
    }

    /**
     * Clear all custom boss waves from a map
     * @param locationId e.g. factory4_day, bigmap
     */
    public clearBossWavesForMap(locationId: string): void
    {
        this.locationConfig.customWaves.boss[locationId] = [];
    }

    /**
     * Clear all custom normal waves from a map
     * @param locationId e.g. factory4_day, bigmap
     */
    public clearNormalWavesForMap(locationId: string): void
    {
        this.locationConfig.customWaves.normal[locationId] = [];
    }

    /**
     * Add custom boss and normal waves to maps found in config/location.json to db
     */
    public applyWaveChangesToAllMaps(): void
    {
        const bossWavesToApply = this.locationConfig.customWaves.boss;
        const normalWavesToApply = this.locationConfig.customWaves.normal;

        for (const mapKey in bossWavesToApply)
        {
            const location: ILocationBase = this.databaseServer.getTables().locations[mapKey].base;
            for (const bossWave of bossWavesToApply[mapKey])
            {
                if (location.BossLocationSpawn.find((x) => x.sptId === bossWave.sptId))
                {
                    // Already exists, skip
                    continue;
                }
                location.BossLocationSpawn.push(bossWave);
                this.logger.debug(
                    `Added custom boss wave to ${mapKey} of type ${bossWave.BossName}, time: ${bossWave.Time}, chance: ${bossWave.BossChance}, zone: ${bossWave.BossZone}`,
                );
            }
        }

        for (const mapKey in normalWavesToApply)
        {
            const location: ILocationBase = this.databaseServer.getTables().locations[mapKey].base;
            for (const normalWave of normalWavesToApply[mapKey])
            {
                if (location.waves.find((x) => x.sptId === normalWave.sptId))
                {
                    // Already exists, skip
                    continue;
                }

                normalWave.number = location.waves.length;
                location.waves.push(normalWave);
            }
        }
    }
}
