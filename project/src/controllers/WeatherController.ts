import { inject, injectable } from "tsyringe";

import { WeatherGenerator } from "@spt-aki/generators/WeatherGenerator";
import { IWeatherData } from "@spt-aki/models/eft/weather/IWeatherData";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IWeatherConfig } from "@spt-aki/models/spt/config/IWeatherConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";

@injectable()
export class WeatherController
{
    protected weatherConfig: IWeatherConfig;

    constructor(
        @inject("WeatherGenerator") protected weatherGenerator: WeatherGenerator,
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.weatherConfig = this.configServer.getConfig(ConfigTypes.WEATHER);
    }

    /** Handle client/weather */
    public generate(): IWeatherData
    {
        let result: IWeatherData = {
            acceleration: 0,
            time: "",
            date: "",
            weather: null,
            winterEventEnabled: this.weatherConfig.forceWinterEvent,
        };

        result = this.weatherGenerator.calculateGameTime(result);
        result.weather = this.weatherGenerator.generateWeather();

        return result;
    }

    /**
     * Get the current in-raid time (MUST HAVE PLAYER LOGGED INTO CLIENT TO WORK)
     * @returns Date object
     */
    public getCurrentInRaidTime(): Date
    {
        return this.weatherGenerator.getInRaidTime();
    }
}
