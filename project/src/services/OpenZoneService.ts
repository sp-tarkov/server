import { ILocationBase } from "@spt/models/eft/common/ILocationBase";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ILocationConfig } from "@spt/models/spt/config/ILocationConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { inject, injectable } from "tsyringe";

/** Service for adding new zones to a maps OpenZones property */
@injectable()
export class OpenZoneService {
    protected locationConfig: ILocationConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
    }

    /**
     * Add open zone to specified map
     * @param locationId map location (e.g. factory4_day)
     * @param zoneToAdd zone to add
     */
    public addZoneToMap(locationId: string, zoneToAdd: string): void {
        const location = this.locationConfig.openZones[locationId];
        if (!location) {
            this.locationConfig.openZones[locationId] = [];
        }

        if (!this.locationConfig.openZones[locationId].includes(zoneToAdd)) {
            this.locationConfig.openZones[locationId].push(zoneToAdd);
        }
    }

    /**
     * Add open zones to all maps found in config/location.json to db
     */
    public applyZoneChangesToAllMaps(): void {
        const dbLocations = this.databaseService.getLocations();
        for (const mapKey in this.locationConfig.openZones) {
            if (!dbLocations[mapKey]) {
                this.logger.error(this.localisationService.getText("openzone-unable_to_find_map", mapKey));

                continue;
            }

            const dbLocationToUpdate: ILocationBase = dbLocations[mapKey].base;
            const zonesToAdd = this.locationConfig.openZones[mapKey];

            // Convert openzones string into array, easier to work wih
            const mapOpenZonesArray = dbLocationToUpdate.OpenZones.split(",");
            for (const zoneToAdd of zonesToAdd) {
                if (!mapOpenZonesArray.includes(zoneToAdd)) {
                    // Add new zone to array and convert array into string again
                    mapOpenZonesArray.push(zoneToAdd);
                    dbLocationToUpdate.OpenZones = mapOpenZonesArray.join(",");
                }
            }
        }
    }
}
