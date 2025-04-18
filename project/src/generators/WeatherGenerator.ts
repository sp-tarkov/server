import { ApplicationContext } from "@spt/context/ApplicationContext";
import { WeatherHelper } from "@spt/helpers/WeatherHelper";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { IWeather, IWeatherData } from "@spt/models/eft/weather/IWeatherData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { Season } from "@spt/models/enums/Season";
import { WindDirection } from "@spt/models/enums/WindDirection";
import { ISeasonalValues, IWeatherConfig } from "@spt/models/spt/config/IWeatherConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class WeatherGenerator {
    protected weatherConfig: IWeatherConfig;

    // Note: If this value gets save/load support, raid time could be tracked across server restarts
    // Currently it will set the In Raid time to your current real time on server launch
    private serverStartTimestampMS = Date.now();

    constructor(
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("WeatherHelper") protected weatherHelper: WeatherHelper,
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.weatherConfig = this.configServer.getConfig(ConfigTypes.WEATHER);
    }

    /**
     * Get current + raid datetime and format into correct BSG format and return
     * @param data Weather data
     * @returns IWeatherData
     */
    public calculateGameTime(data: IWeatherData): IWeatherData {
        const computedDate = new Date();
        const formattedDate = this.timeUtil.formatDate(computedDate);

        data.date = formattedDate;
        data.time = this.getBsgFormattedInRaidTime();
        data.acceleration = this.weatherConfig.acceleration;

        data.season = this.seasonalEventService.getActiveWeatherSeason();

        return data;
    }

    /**
     * Get server uptime seconds multiplied by a multiplier and add to current time as seconds
     * Format to BSGs requirements
     * @param currentDate current date
     * @returns formatted time
     */
    protected getBsgFormattedInRaidTime(): string {
        const clientAcceleratedDate = this.weatherHelper.getInRaidTime();

        return this.getBSGFormattedTime(clientAcceleratedDate);
    }

    /**
     * Get current time formatted to fit BSGs requirement
     * @param date date to format into bsg style
     * @returns Time formatted in BSG format
     */
    protected getBSGFormattedTime(date: Date): string {
        return this.timeUtil.formatTime(date).replace("-", ":").replace("-", ":");
    }

    /**
     * Return randomised Weather data with help of config/weather.json
     * @param currentSeason the currently active season
     * @param timestamp OPTIONAL what timestamp to generate the weather data at, defaults to now when not supplied
     * @returns Randomised weather data
     */
    public generateWeather(currentSeason: Season, timestamp?: number): IWeather {
        const weatherValues = this.getWeatherValuesBySeason(currentSeason);
        const clouds = this.getWeightedClouds(weatherValues);

        // Force rain to off if no clouds
        const rain = clouds <= 0.6 ? 0 : this.getWeightedRain(weatherValues);

        const result: IWeather = {
            cloud: clouds,
            wind_speed: this.getWeightedWindSpeed(weatherValues),
            wind_direction: this.getWeightedWindDirection(weatherValues),
            wind_gustiness: this.getRandomFloat(weatherValues.windGustiness.min, weatherValues.windGustiness.max, 2),
            rain: rain,
            rain_intensity:
                rain > 1 ? this.getRandomFloat(weatherValues.rainIntensity.min, weatherValues.rainIntensity.max) : 0,
            fog: this.getWeightedFog(weatherValues),
            temp: 0,
            pressure: this.getRandomFloat(weatherValues.pressure.min, weatherValues.pressure.max),
            time: "",
            date: "",
            timestamp: 0, // Added below
            sptInRaidTimestamp: 0, // Added below
        };

        this.setCurrentDateTime(result, timestamp);

        result.temp = this.getRaidTemperature(weatherValues, result.sptInRaidTimestamp);

        return result;
    }

    protected getWeatherValuesBySeason(currentSeason: Season): ISeasonalValues {
        const result = this.weatherConfig.weather.seasonValues[Season[currentSeason]];
        if (!result) {
            return this.weatherConfig.weather.seasonValues.default;
        }

        return result;
    }

    /**
     * Choose a temprature for the raid based on time of day
     * @param currentSeason What season tarkov is currently in
     * @param inRaidTimestamp What time is the raid running at
     * @returns Timestamp
     */
    protected getRaidTemperature(weather: ISeasonalValues, inRaidTimestamp: number): number {
        // Convert timestamp to date so we can get current hour and check if its day or night
        const currentRaidTime = new Date(inRaidTimestamp);
        const minMax = this.weatherHelper.isHourAtNightTime(currentRaidTime.getHours())
            ? weather.temp.night
            : weather.temp.day;

        return Number.parseFloat(this.randomUtil.getFloat(minMax.min, minMax.max).toPrecision(2));
    }

    /**
     * Set IWeather date/time/timestamp values to now
     * @param weather Object to update
     * @param timestamp OPTIONAL, define timestamp used
     */
    protected setCurrentDateTime(weather: IWeather, timestamp?: number): void {
        const inRaidTime = this.weatherHelper.getInRaidTime(timestamp);
        const normalTime = this.getBSGFormattedTime(inRaidTime);
        const formattedDate = this.timeUtil.formatDate(timestamp ? new Date(timestamp) : new Date());
        const datetimeBsgFormat = `${formattedDate} ${normalTime}`;

        weather.timestamp = Math.floor(timestamp ? timestamp : inRaidTime.getTime() / 1000); // matches weather.date
        weather.date = formattedDate; // matches weather.timestamp
        weather.time = datetimeBsgFormat; // matches weather.timestamp
        weather.sptInRaidTimestamp = inRaidTime.getTime();
    }

    protected getWeightedWindDirection(weather: ISeasonalValues): WindDirection {
        return this.weightedRandomHelper.weightedRandom(weather.windDirection.values, weather.windDirection.weights)
            .item;
    }

    protected getWeightedClouds(weather: ISeasonalValues): number {
        return this.weightedRandomHelper.weightedRandom(weather.clouds.values, weather.clouds.weights).item;
    }

    protected getWeightedWindSpeed(weather: ISeasonalValues): number {
        return this.weightedRandomHelper.weightedRandom(weather.windSpeed.values, weather.windSpeed.weights).item;
    }

    protected getWeightedFog(weather: ISeasonalValues): number {
        return this.weightedRandomHelper.weightedRandom(weather.fog.values, weather.fog.weights).item;
    }

    protected getWeightedRain(weather: ISeasonalValues): number {
        return this.weightedRandomHelper.weightedRandom(weather.rain.values, weather.rain.weights).item;
    }

    protected getRandomFloat(min: number, max: number, precision = 3): number {
        return Number.parseFloat(this.randomUtil.getFloat(min, max).toPrecision(precision));
    }
}
