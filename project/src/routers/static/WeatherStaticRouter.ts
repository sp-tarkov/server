import { WeatherCallbacks } from "@spt/callbacks/WeatherCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { IWeatherData } from "@spt/models/eft/weather/IWeatherData";
import { IGetLocalWeatherResponseData } from "@spt/models/spt/weather/IGetLocalWeatherResponseData";
import { inject, injectable } from "tsyringe";

@injectable()
export class WeatherStaticRouter extends StaticRouter {
    constructor(@inject("WeatherCallbacks") protected weatherCallbacks: WeatherCallbacks) {
        super([
            new RouteAction(
                "/client/weather",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IWeatherData>> => {
                    return this.weatherCallbacks.getWeather(url, info, sessionID);
                },
            ),

            new RouteAction(
                "/client/localGame/weather",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    _output: string,
                ): Promise<IGetBodyResponseData<IGetLocalWeatherResponseData>> => {
                    return this.weatherCallbacks.getLocalWeather(url, info, sessionID);
                },
            ),
        ]);
    }
}
