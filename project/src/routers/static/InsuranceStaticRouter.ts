import { InsuranceCallbacks } from "@spt/callbacks/InsuranceCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { IGetInsuranceCostResponseData } from "@spt/models/eft/insurance/IGetInsuranceCostResponseData";
import { inject, injectable } from "tsyringe";

@injectable()
export class InsuranceStaticRouter extends StaticRouter {
    constructor(@inject("InsuranceCallbacks") protected insuranceCallbacks: InsuranceCallbacks) {
        super([
            new RouteAction(
                "/client/insurance/items/list/cost",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetInsuranceCostResponseData>> => {
                    return this.insuranceCallbacks.getInsuranceCost(url, info, sessionID);
                },
            ),
        ]);
    }
}
