import { WeatherGenerator } from "@spt/generators/WeatherGenerator";
import { WeatherHelper } from "@spt/helpers/WeatherHelper";
import { IWeather, IWeatherData } from "@spt/models/eft/weather/IWeatherData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IWeatherConfig } from "@spt/models/spt/config/IWeatherConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { IGetLocalWeatherResponseData } from "@spt/models/spt/weather/IGetLocalWeatherResponseData";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { RaidWeatherService } from "@spt/services/RaidWeatherService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { inject, injectable } from "tsyringe";

@injectable()
export class WeatherController {
    protected weatherConfig: IWeatherConfig;

    constructor(
        @inject("WeatherGenerator") protected weatherGenerator: WeatherGenerator,
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("RaidWeatherService") protected raidWeatherService: RaidWeatherService,
        @inject("WeatherHelper") protected weatherHelper: WeatherHelper,
    ) {
        this.weatherConfig = this.configServer.getConfig(ConfigTypes.WEATHER);
    }

    /** Handle client/weather */
    public generate(): IWeatherData {
        let result: IWeatherData = { acceleration: 0, time: "", date: "", weather: undefined, season: 1 }; // defaults, hydrated below

        result = this.weatherGenerator.calculateGameTime(result);
        result.weather = this.weatherGenerator.generateWeather(result.season);

        return result;
    }

    /** Handle client/localGame/weather */
    public generateLocal(sesssionId: string): IGetLocalWeatherResponseData {
        const result: IGetLocalWeatherResponseData = {
            season: this.seasonalEventService.getActiveWeatherSeason(),
            weather: [],
        };

        result.weather.push(...this.raidWeatherService.getUpcomingWeather());

        return result;
    }
}
