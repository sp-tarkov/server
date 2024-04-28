import { inject, injectable } from "tsyringe";

import { InsuranceCallbacks } from "@spt-aki/callbacks/InsuranceCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";
import { IGetInsuranceCostResponseData } from "@spt-aki/models/eft/insurance/IGetInsuranceCostResponseData";

@injectable()
export class InsuranceStaticRouter extends StaticRouter
{
    constructor(@inject("InsuranceCallbacks") protected insuranceCallbacks: InsuranceCallbacks)
    {
        super([
            new RouteAction(
                "/client/insurance/items/list/cost",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetInsuranceCostResponseData>> =>
                {
                    return this.insuranceCallbacks.getInsuranceCost(url, info, sessionID);
                },
            ),
        ]);
    }
}
