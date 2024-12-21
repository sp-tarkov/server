import { QuestController } from "@spt/controllers/QuestController";
import { RepeatableQuestController } from "@spt/controllers/RepeatableQuestController";
import type { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import type { IQuest } from "@spt/models/eft/common/tables/IQuest";
import type { IPmcDataRepeatableQuest } from "@spt/models/eft/common/tables/IRepeatableQuests";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import type { IAcceptQuestRequestData } from "@spt/models/eft/quests/IAcceptQuestRequestData";
import type { ICompleteQuestRequestData } from "@spt/models/eft/quests/ICompleteQuestRequestData";
import type { IHandoverQuestRequestData } from "@spt/models/eft/quests/IHandoverQuestRequestData";
import type { IListQuestsRequestData } from "@spt/models/eft/quests/IListQuestsRequestData";
import type { IRepeatableQuestChangeRequest } from "@spt/models/eft/quests/IRepeatableQuestChangeRequest";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class QuestCallbacks {
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("QuestController") protected questController: QuestController,
        @inject("RepeatableQuestController") protected repeatableQuestController: RepeatableQuestController,
    ) {}

    /**
     * Handle RepeatableQuestChange event
     */
    public changeRepeatableQuest(
        pmcData: IPmcData,
        body: IRepeatableQuestChangeRequest,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.repeatableQuestController.changeRepeatableQuest(pmcData, body, sessionID);
    }

    /**
     * Handle QuestAccept event
     */
    public acceptQuest(pmcData: IPmcData, body: IAcceptQuestRequestData, sessionID: string): IItemEventRouterResponse {
        if (body.type === "repeatable") {
            return this.questController.acceptRepeatableQuest(pmcData, body, sessionID);
        }
        return this.questController.acceptQuest(pmcData, body, sessionID);
    }

    /**
     * Handle QuestComplete event
     */
    public completeQuest(
        pmcData: IPmcData,
        body: ICompleteQuestRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.questController.completeQuest(pmcData, body, sessionID);
    }

    /**
     * Handle QuestHandover event
     */
    public handoverQuest(
        pmcData: IPmcData,
        body: IHandoverQuestRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.questController.handoverQuest(pmcData, body, sessionID);
    }

    /**
     * Handle client/quest/list
     */
    public listQuests(url: string, info: IListQuestsRequestData, sessionID: string): IGetBodyResponseData<IQuest[]> {
        return this.httpResponse.getBody(this.questController.getClientQuests(sessionID));
    }

    /**
     * Handle client/repeatalbeQuests/activityPeriods
     */
    public activityPeriods(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IPmcDataRepeatableQuest[]> {
        return this.httpResponse.getBody(this.repeatableQuestController.getClientRepeatableQuests(sessionID));
    }
}
