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
        data.time = this.getBsgFormattedInRaidTime(computedDate);
        data.acceleration = this.weatherConfig.acceleration;

        return data;
    }

    /**
     * Get server uptime seconds multiplied by a multiplier and add to current time as seconds
     * Format to BSGs requirements
     * @param currentDate current date
     * @returns formatted time
     */
    protected getBsgFormattedInRaidTime(currentDate: Date): string
    {
        const clientAcceleratedDate = this.getInRaidTime(currentDate);

        return this.getBSGFormattedTime(clientAcceleratedDate);
    }

    /**
     * Get the current in-raid time
     * @param currentDate (new Date())
     * @returns Date object of current in-raid time
     */
    public getInRaidTime(currentDate: Date): Date
    {
        // Get timestamp of when client conneted to server
        const gameStartTimeStampMS = this.applicationContext.getLatestValue(ContextVariableType.CLIENT_START_TIMESTAMP)
            .getValue<number>();

        // Get delta between now and when client connected to server in milliseconds
        const deltaMSFromNow = Date.now() - gameStartTimeStampMS;
        const acceleratedMS = deltaMSFromNow * (this.weatherConfig.acceleration - 1); // For some reason nodejs moves faster than client time, reducing acceleration by 1 when client is 7 helps
        const clientAcceleratedDate = new Date(currentDate.valueOf() + acceleratedMS);

        return clientAcceleratedDate;
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
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wind_speed: this.getWeightedWindSpeed(),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wind_direction: this.getWeightedWindDirection(),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            wind_gustiness: this.getRandomFloat("windGustiness"),
            rain: rain,
            // eslint-disable-next-line @typescript-eslint/naming-convention
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
        const currentDate = this.getInRaidTime(new Date());
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
