import { inject, injectable } from "tsyringe";
import { WeatherController } from "@spt/controllers/WeatherController";
import { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { IWeatherData } from "@spt/models/eft/weather/IWeatherData";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";

@injectable()
export class WeatherCallbacks
{
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("WeatherController") protected weatherController: WeatherController,
    )
    {}

    /**
     * Handle client/weather
     * @returns IWeatherData
     */
    public getWeather(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<IWeatherData>
    {
        return this.httpResponse.getBody(this.weatherController.generate());
    }
}
