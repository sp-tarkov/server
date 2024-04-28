import { inject, injectable } from "tsyringe";

import { WeatherCallbacks } from "@spt-aki/callbacks/WeatherCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";
import { IWeatherData } from "@spt-aki/models/eft/weather/IWeatherData";

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
