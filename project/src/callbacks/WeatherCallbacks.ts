import { WeatherController } from "@spt/controllers/WeatherController";
import type { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { IWeatherData } from "@spt/models/eft/weather/IWeatherData";
import type { IGetLocalWeatherResponseData } from "@spt/models/spt/weather/IGetLocalWeatherResponseData";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class WeatherCallbacks {
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("WeatherController") protected weatherController: WeatherController,
    ) {}

    /**
     * Handle client/weather
     * @returns IWeatherData
     */
    public getWeather(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IWeatherData> {
        return this.httpResponse.getBody(this.weatherController.generate());
    }

    /** Handle client/localGame/weather */
    public getLocalWeather(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGetLocalWeatherResponseData> {
        return this.httpResponse.getBody(this.weatherController.generateLocal(sessionID));
    }
}
