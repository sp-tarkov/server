import { inject, injectable } from "tsyringe";

import { ApplicationContext } from "@spt-aki/context/ApplicationContext";
import { ContextVariableType } from "@spt-aki/context/ContextVariableType";
import { WeightedRandomHelper } from "@spt-aki/helpers/WeightedRandomHelper";
import { IWeather, IWeatherData } from "@spt-aki/models/eft/weather/IWeatherData";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { WindDirection } from "@spt-aki/models/enums/WindDirection";
import { IWeatherConfig } from "@spt-aki/models/spt/config/IWeatherConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class WeatherGenerator
{
    protected weatherConfig: IWeatherConfig;

    // Note: If this value gets save/load support, raid time could be tracked across server restarts
    // Currently it will set the In Raid time to your current real time on server launch
    private serverStartTimestampMS = Date.now();

    constructor(
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.weatherConfig = this.configServer.getConfig(ConfigTypes.WEATHER);
    }

    /**
     * Get current + raid datetime and format into correct BSG format and return
     * @param data Weather data
     * @returns IWeatherData
     */
    public calculateGameTime(data: IWeatherData): IWeatherData
    {
        const computedDate = new Date();
        const formattedDate = this.timeUtil.formatDate(computedDate);

        data.date = formattedDate;
        data.time = this.getBsgFormattedInRaidTime();
        data.acceleration = this.weatherConfig.acceleration;
        data.winterEventEnabled = this.weatherConfig.forceWinterEvent;

        return data;
    }

    /**
     * Get server uptime seconds multiplied by a multiplier and add to current time as seconds
     * Format to BSGs requirements
     * @param currentDate current date
     * @returns formatted time
     */
    protected getBsgFormattedInRaidTime(): string
    {
        const clientAcceleratedDate = this.getInRaidTime();

        return this.getBSGFormattedTime(clientAcceleratedDate);
    }

    /**
     * Get the current in-raid time
     * @param currentDate (new Date())
     * @returns Date object of current in-raid time
     */
    public getInRaidTime(): Date
    {
        // tarkov time = (real time * 7 % 24 hr) + 3 hour
        const russiaOffset = (this.timeUtil.getHoursAsSeconds(3)) * 1000;
        return new Date(
            (russiaOffset + (new Date().getTime() * this.weatherConfig.acceleration))
                % (this.timeUtil.getHoursAsSeconds(24) * 1000),
        );
    }

    /**
     * Get current time formatted to fit BSGs requirement
     * @param date date to format into bsg style
     * @returns Time formatted in BSG format
     */
    protected getBSGFormattedTime(date: Date): string
    {
        return this.timeUtil.formatTime(date).replace("-", ":").replace("-", ":");
    }

    /**
     * Return randomised Weather data with help of config/weather.json
     * @returns Randomised weather data
     */
    public generateWeather(): IWeather
    {
        const rain = this.getWeightedRain();

        const result: IWeather = {
            cloud: this.getWeightedClouds(),
            wind_speed: this.getWeightedWindSpeed(),
            wind_direction: this.getWeightedWindDirection(),
            wind_gustiness: this.getRandomFloat("windGustiness"),
            rain: rain,
            rain_intensity: (rain > 1) ? this.getRandomFloat("rainIntensity") : 0,
            fog: this.getWeightedFog(),
            temp: this.getRandomFloat("temp"),
            pressure: this.getRandomFloat("pressure"),
            time: "",
            date: "",
            timestamp: 0,
        };

        this.setCurrentDateTime(result);

        return result;
    }

    /**
     * Set IWeather date/time/timestamp values to now
     * @param weather Object to update
     */
    protected setCurrentDateTime(weather: IWeather): void
    {
        const currentDate = this.getInRaidTime();
        const normalTime = this.getBSGFormattedTime(currentDate);
        const formattedDate = this.timeUtil.formatDate(currentDate);
        const datetime = `${formattedDate} ${normalTime}`;

        weather.timestamp = Math.floor(currentDate.getTime() / 1000); // matches weather.date
        weather.date = formattedDate; // matches weather.timestamp
        weather.time = datetime; // matches weather.timestamp
    }

    protected getWeightedWindDirection(): WindDirection
    {
        return this.weightedRandomHelper.weightedRandom(
            this.weatherConfig.weather.windDirection.values,
            this.weatherConfig.weather.windDirection.weights,
        ).item;
    }

    protected getWeightedClouds(): number
    {
        return this.weightedRandomHelper.weightedRandom(
            this.weatherConfig.weather.clouds.values,
            this.weatherConfig.weather.clouds.weights,
        ).item;
    }

    protected getWeightedWindSpeed(): number
    {
        return this.weightedRandomHelper.weightedRandom(
            this.weatherConfig.weather.windSpeed.values,
            this.weatherConfig.weather.windSpeed.weights,
        ).item;
    }

    protected getWeightedFog(): number
    {
        return this.weightedRandomHelper.weightedRandom(
            this.weatherConfig.weather.fog.values,
            this.weatherConfig.weather.fog.weights,
        ).item;
    }

    protected getWeightedRain(): number
    {
        return this.weightedRandomHelper.weightedRandom(
            this.weatherConfig.weather.rain.values,
            this.weatherConfig.weather.rain.weights,
        ).item;
    }

    protected getRandomFloat(node: string): number
    {
        return parseFloat(
            this.randomUtil.getFloat(this.weatherConfig.weather[node].min, this.weatherConfig.weather[node].max)
                .toPrecision(3),
        );
    }
}
