import { ILocationsGenerateAllResponse } from "@spt/models/eft/common/ILocationsSourceDestinationBase";
import { IGetAirdropLootRequest } from "@spt/models/eft/location/IGetAirdropLootRequest";
import { IGetAirdropLootResponse } from "@spt/models/eft/location/IGetAirdropLootResponse";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ILocationConfig } from "@spt/models/spt/config/ILocationConfig";
import { ILocations } from "@spt/models/spt/server/ILocations";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { AirdropService } from "@spt/services/AirdropService";
import { DatabaseService } from "@spt/services/DatabaseService";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class LocationController {
    protected locationConfig: ILocationConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("AirdropService") protected airdropService: AirdropService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
    }

    /**
     * Handle client/locations
     * Get all maps base location properties without loot data
     * @param sessionId Players Id
     * @returns ILocationsGenerateAllResponse
     */
    public generateAll(sessionId: string): ILocationsGenerateAllResponse {
        const locationsFromDb = this.databaseService.getLocations();
        const locations: ILocations = {};
        for (const mapName in locationsFromDb) {
            const mapBase = locationsFromDb[mapName]?.base;
            if (!mapBase) {
                this.logger.debug(`Map: ${mapName} has no base json file, skipping generation`);
                continue;
            }

            // Clear out loot array
            mapBase.Loot = [];
            // Add map base data to dictionary
            locations[mapBase._Id] = mapBase;
        }

        return { locations: locations, paths: locationsFromDb.base.paths };
    }

    /** Handle client/airdrop/loot */
    public getAirdropLoot(request: IGetAirdropLootRequest): IGetAirdropLootResponse {
        if (request.containerId) {
            return this.airdropService.generateCustomAirdropLoot(request);
        }

        return this.airdropService.generateAirdropLoot();
    }
}
