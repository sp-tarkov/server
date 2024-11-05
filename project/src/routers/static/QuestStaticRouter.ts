import { QuestCallbacks } from "@spt/callbacks/QuestCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { IQuest } from "@spt/models/eft/common/tables/IQuest";
import { IPmcDataRepeatableQuest } from "@spt/models/eft/common/tables/IRepeatableQuests";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { inject, injectable } from "tsyringe";

@injectable()
export class QuestStaticRouter extends StaticRouter {
    constructor(@inject("QuestCallbacks") protected questCallbacks: QuestCallbacks) {
        super([
            new RouteAction(
                "/client/quest/list",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IQuest[]>> => {
                    return this.questCallbacks.listQuests(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/repeatalbeQuests/activityPeriods",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IPmcDataRepeatableQuest[]>> => {
                    return this.questCallbacks.activityPeriods(url, info, sessionID);
                },
            ),
        ]);
    }
}
