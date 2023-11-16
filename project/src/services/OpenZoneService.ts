import { inject, injectable } from "tsyringe";

import { ILocationBase } from "@spt-aki/models/eft/common/ILocationBase";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { ILocationConfig } from "@spt-aki/models/spt/config/ILocationConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

/** Service for adding new zones to a maps OpenZones property */
@injectable()
export class OpenZoneService
{
    protected locationConfig: ILocationConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
    }

    /**
     * Add open zone to specified map
     * @param locationId map location (e.g. factory4_day)
     * @param zoneToAdd zone to add
     */
    public addZoneToMap(locationId: string, zoneToAdd: string): void
    {
        const location = this.locationConfig.openZones[locationId];
        if (!location)
        {
            this.locationConfig.openZones[locationId] = [];
        }

        if (!this.locationConfig.openZones[locationId].includes(zoneToAdd))
        {
            this.locationConfig.openZones[locationId].push(zoneToAdd);
        }
    }

    /**
     * Add open zones to all maps found in config/location.json to db
     */
    public applyZoneChangesToAllMaps(): void
    {
        const dbLocations = this.databaseServer.getTables().locations;
        for (const mapKey in this.locationConfig.openZones)
        {
            if (!dbLocations[mapKey])
            {
                this.logger.error(this.localisationService.getText("openzone-unable_to_find_map", mapKey));
            }

            const dbLocationToUpdate: ILocationBase = dbLocations[mapKey].base;
            const zonesToAdd = this.locationConfig.openZones[mapKey];

            // Convert openzones string into array, easier to work wih
            const mapOpenZonesArray = dbLocationToUpdate.OpenZones.split(",");
            for (const zoneToAdd of zonesToAdd)
            {
                if (!mapOpenZonesArray.includes(zoneToAdd))
                {
                    // Add new zone to array and convert array into string again
                    mapOpenZonesArray.push(zoneToAdd);
                    dbLocationToUpdate.OpenZones = mapOpenZonesArray.join(",");
                }
            }
        }
    }
}
