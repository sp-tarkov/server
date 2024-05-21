import { inject, injectable } from "tsyringe";
import { WeatherCallbacks } from "@spt/callbacks/WeatherCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { IWeatherData } from "@spt/models/eft/weather/IWeatherData";

@injectable()
export class WeatherStaticRouter extends StaticRouter
{
    constructor(@inject("WeatherCallbacks") protected weatherCallbacks: WeatherCallbacks)
    {
        super([
            new RouteAction(
                "/client/weather",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IWeatherData>> =>
                {
                    return this.weatherCallbacks.getWeather(url, info, sessionID);
                },
            ),
        ]);
    }
}
