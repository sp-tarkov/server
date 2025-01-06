import { ApplicationContext } from "@spt/context/ApplicationContext";
import { ContextVariableType } from "@spt/context/ContextVariableType";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { ILocationBase } from "@spt/models/eft/common/ILocationBase";
import { IGetRaidTimeRequest } from "@spt/models/eft/game/IGetRaidTimeRequest";
import { ExtractChange, IGetRaidTimeResponse } from "@spt/models/eft/game/IGetRaidTimeResponse";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import {
    ILocationConfig,
    ILootMultiplier,
    IScavRaidTimeLocationSettings,
} from "@spt/models/spt/config/ILocationConfig";
import { IRaidChanges } from "@spt/models/spt/location/IRaidChanges";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class RaidTimeAdjustmentService {
    protected locationConfig: ILocationConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
    }

    /**
     * Make alterations to the base map data passed in
     * Loot multipliers/waves/wave start times
     * @param raidAdjustments Changes to process on map
     * @param mapBase Map to adjust
     */
    public makeAdjustmentsToMap(raidAdjustments: IRaidChanges, mapBase: ILocationBase): void {
        this.logger.debug(
            `Adjusting dynamic loot multipliers to ${raidAdjustments.dynamicLootPercent}% and static loot multipliers to ${raidAdjustments.staticLootPercent}% of original`,
        );

        // Change loot multipler values before they're used below
        this.adjustLootMultipliers(this.locationConfig.looseLootMultiplier, raidAdjustments.dynamicLootPercent);
        this.adjustLootMultipliers(this.locationConfig.staticLootMultiplier, raidAdjustments.staticLootPercent);

        const mapSettings = this.getMapSettings(mapBase.Id);
        if (mapSettings.adjustWaves) {
            // Make alterations to bot spawn waves now player is simulated spawning later
            this.adjustWaves(mapBase, raidAdjustments);
        }
    }

    /**
     * Adjust the loot multiplier values passed in to be a % of their original value
     * @param mapLootMultiplers Multiplers to adjust
     * @param loosePercent Percent to change values to
     */
    protected adjustLootMultipliers(mapLootMultiplers: ILootMultiplier, loosePercent: number): void {
        for (const key in mapLootMultiplers) {
            mapLootMultiplers[key] = this.randomUtil.getPercentOfValue(mapLootMultiplers[key], loosePercent);
        }
    }

    /**
     * Adjust bot waves to act as if player spawned later
     * @param mapBase map to adjust
     * @param raidAdjustments Map adjustments
     */
    protected adjustWaves(mapBase: ILocationBase, raidAdjustments: IRaidChanges): void {
        // Remove waves that spawned before the player joined
        const originalWaveCount = mapBase.waves.length;
        mapBase.waves = mapBase.waves.filter((x) => x.time_max > raidAdjustments.simulatedRaidStartSeconds);

        // Adjust wave min/max times to match new simulated start
        for (const wave of mapBase.waves) {
            // Dont let time fall below 0
            wave.time_min -= Math.max(raidAdjustments.simulatedRaidStartSeconds, 0);
            wave.time_max -= Math.max(raidAdjustments.simulatedRaidStartSeconds, 0);
        }

        this.logger.debug(
            `Removed ${originalWaveCount - mapBase.waves.length} wave from map due to simulated raid start time of ${
                raidAdjustments.simulatedRaidStartSeconds / 60
            } minutes`,
        );
    }

    /**
     * Create a randomised adjustment to the raid based on map data in location.json
     * @param sessionId Session id
     * @param request Raid adjustment request
     * @returns Response to send to client
     */
    public getRaidAdjustments(sessionId: string, request: IGetRaidTimeRequest): IGetRaidTimeResponse {
        const globals = this.databaseService.getGlobals();
        const mapBase: ILocationBase = this.databaseService.getLocation(request.Location.toLowerCase()).base;
        const baseEscapeTimeMinutes = mapBase.EscapeTimeLimit;

        // Prep result object to return
        const result: IGetRaidTimeResponse = {
            RaidTimeMinutes: baseEscapeTimeMinutes,
            ExitChanges: [],
            NewSurviveTimeSeconds: undefined,
            OriginalSurvivalTimeSeconds: globals.config.exp.match_end.survived_seconds_requirement,
        };

        // Pmc raid, send default
        if (request.Side.toLowerCase() === "pmc") {
            return result;
        }

        // We're scav adjust values
        const mapSettings = this.getMapSettings(request.Location);

        // Chance of reducing raid time for scav, not guaranteed
        if (!this.randomUtil.getChance100(mapSettings.reducedChancePercent)) {
            // Send default
            return result;
        }

        // Get the weighted percent to reduce the raid time by
        const chosenRaidReductionPercent = Number.parseInt(
            this.weightedRandomHelper.getWeightedValue<string>(mapSettings.reductionPercentWeights),
        );
        const raidTimeRemainingPercent = 100 - chosenRaidReductionPercent;

        // How many minutes raid will last
        const newRaidTimeMinutes = Math.floor(
            this.randomUtil.reduceValueByPercent(baseEscapeTimeMinutes, chosenRaidReductionPercent),
        );

        // Time player spawns into the raid if it was online
        const simulatedRaidStartTimeMinutes = baseEscapeTimeMinutes - newRaidTimeMinutes;

        if (mapSettings.reduceLootByPercent) {
            // Store time reduction percent in app context so loot gen can pick it up later
            this.applicationContext.addValue(ContextVariableType.RAID_ADJUSTMENTS, {
                dynamicLootPercent: Math.max(raidTimeRemainingPercent, mapSettings.minDynamicLootPercent),
                staticLootPercent: Math.max(raidTimeRemainingPercent, mapSettings.minStaticLootPercent),
                simulatedRaidStartSeconds: simulatedRaidStartTimeMinutes * 60,
            });
        }

        // Update result object with new time
        result.RaidTimeMinutes = newRaidTimeMinutes;

        this.logger.debug(
            `Reduced: ${request.Location} raid time by: ${chosenRaidReductionPercent}% to ${newRaidTimeMinutes} minutes`,
        );

        // Calculate how long player needs to be in raid to get a `survived` extract status
        result.NewSurviveTimeSeconds = Math.max(
            result.OriginalSurvivalTimeSeconds - (baseEscapeTimeMinutes - newRaidTimeMinutes) * 60,
            0,
        );

        const exitAdjustments = this.getExitAdjustments(mapBase, newRaidTimeMinutes);
        if (exitAdjustments) {
            result.ExitChanges.push(...exitAdjustments);
        }

        return result;
    }

    /**
     * Get raid start time settings for specific map
     * @param location Map Location e.g. bigmap
     * @returns IScavRaidTimeLocationSettings
     */
    protected getMapSettings(location: string): IScavRaidTimeLocationSettings {
        const mapSettings = this.locationConfig.scavRaidTimeSettings.maps[location.toLowerCase()];
        if (!mapSettings) {
            this.logger.warning(`Unable to find scav raid time settings for map: ${location}, using defaults`);
            return this.locationConfig.scavRaidTimeSettings.maps.default;
        }

        return mapSettings;
    }

    /**
     * Adjust exit times to handle scavs entering raids part-way through
     * @param mapBase Map base file player is on
     * @param newRaidTimeMinutes How long raid is in minutes
     * @returns List of  exit changes to send to client
     */
    protected getExitAdjustments(mapBase: ILocationBase, newRaidTimeMinutes: number): ExtractChange[] | undefined {
        const result: ExtractChange[] = [];
        // Adjust train exits only
        for (const exit of mapBase.exits) {
            if (exit.PassageRequirement !== "Train") {
                continue;
            }

            // Prepare train adjustment object
            const exitChange: ExtractChange = {
                Name: exit.Name,
                MinTime: undefined,
                MaxTime: undefined,
                Chance: undefined,
            };

            // At what minute we simulate the player joining the raid
            const simulatedRaidEntryTimeMinutes = mapBase.EscapeTimeLimit - newRaidTimeMinutes;

            // How many seconds have elapsed in the raid when the player joins
            const reductionSeconds = simulatedRaidEntryTimeMinutes * 60;

            // Delay between the train extract activating and it becoming available to board
            //
            // Test method for determining this value:
            // 1) Set MinTime, MaxTime, and Count for the train extract all to 120
            // 2) Load into Reserve or Lighthouse as a PMC (both have the same result)
            // 3) Board the train when it arrives
            // 4) Check the raid time on the Raid Ended Screen (it should always be the same)
            //
            // trainArrivalDelaySeconds = [raid time on raid-ended screen] - MaxTime - Count - ExfiltrationTime
            // Example: Raid Time = 5:33 = 333 seconds
            //          trainArrivalDelaySeconds = 333 - 120 - 120 - 5 = 88
            //
            // I added 2 seconds just to be safe...
            //
            const trainArrivalDelaySeconds =
                this.locationConfig.scavRaidTimeSettings.settings.trainArrivalDelayObservedSeconds;

            // Determine the earliest possible time in the raid when the train would leave
            const earliestPossibleDepartureMinutes =
                (exit.MinTime + exit.Count + exit.ExfiltrationTime + trainArrivalDelaySeconds) / 60;

            // If raid is after last moment train can leave, assume train has already left, disable extract
            const mostPossibleTimeRemainingAfterDeparture = mapBase.EscapeTimeLimit - earliestPossibleDepartureMinutes;
            if (newRaidTimeMinutes < mostPossibleTimeRemainingAfterDeparture) {
                exitChange.Chance = 0;

                this.logger.debug(
                    `Train Exit: ${exit.Name} disabled as new raid time ${newRaidTimeMinutes} minutes is below ${mostPossibleTimeRemainingAfterDeparture} minutes`,
                );

                result.push(exitChange);

                continue;
            }

            // Reduce extract arrival times. Negative values seem to make extract turn red in game.
            exitChange.MinTime = Math.max(exit.MinTime - reductionSeconds, 0);
            exitChange.MaxTime = Math.max(exit.MaxTime - reductionSeconds, 0);

            this.logger.debug(
                `Train appears between: ${exitChange.MinTime} and ${exitChange.MaxTime} seconds raid time`,
            );

            result.push(exitChange);
        }

        return result.length > 0 ? result : undefined;
    }
}
