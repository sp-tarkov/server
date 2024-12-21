import { NotifierCallbacks } from "@spt/callbacks/NotifierCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { INotifierChannel } from "@spt/models/eft/notifier/INotifier";
import type { ISelectProfileResponse } from "@spt/models/eft/notifier/ISelectProfileResponse";
import { inject, injectable } from "tsyringe";

@injectable()
export class NotifierStaticRouter extends StaticRouter {
    constructor(@inject("NotifierCallbacks") protected notifierCallbacks: NotifierCallbacks) {
        super([
            new RouteAction(
                "/client/notifier/channel/create",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<INotifierChannel>> => {
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
                ): Promise<IGetBodyResponseData<ISelectProfileResponse>> => {
                    return this.notifierCallbacks.selectProfile(url, info, sessionID);
                },
            ),
        ]);
    }
}
