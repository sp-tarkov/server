import { inject, injectable } from "tsyringe";

import { NotifierCallbacks } from "@spt-aki/callbacks/NotifierCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";
import { INotifierChannel } from "@spt-aki/models/eft/notifier/INotifier";
import { ISelectProfileResponse } from "@spt-aki/models/eft/notifier/ISelectProfileResponse";

@injectable()
export class NotifierStaticRouter extends StaticRouter
{
    constructor(@inject("NotifierCallbacks") protected notifierCallbacks: NotifierCallbacks)
    {
        super([
            new RouteAction(
                "/client/notifier/channel/create",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<INotifierChannel>> =>
                {
                    return this.notifierCallbacks.createNotifierChannel(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/game/profile/select",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ISelectProfileResponse>> =>
                {
                    return this.notifierCallbacks.selectProfile(url, info, sessionID);
                },
            ),
        ]);
    }
}
