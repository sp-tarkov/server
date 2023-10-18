import { WindDirection } from "@spt-aki/models/enums/WindDirection";

export interface IWeatherData
{
    acceleration: number;
    time: string;
    date: string;
    weather?: IWeather
}

export  interface IWeather 
{
    pressure: number;
    temp: number;
    fog: number;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    rain_intensity: number;
    rain: number;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    wind_gustiness: number;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    wind_direction: WindDirection;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    wind_speed: number;
    cloud: number;
    time: string;
    date: string;
    timestamp: number;
}