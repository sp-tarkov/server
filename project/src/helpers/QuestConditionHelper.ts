import { IQuestCondition } from "@spt/models/eft/common/tables/IQuest";
import { injectable } from "tsyringe";

@injectable()
export class QuestConditionHelper {
    public getQuestConditions(
        q: IQuestCondition[],
        furtherFilter?: (a: IQuestCondition) => IQuestCondition[],
    ): IQuestCondition[] {
        return this.filterConditions(q, "Quest", furtherFilter);
    }

    public getLevelConditions(
        q: IQuestCondition[],
        furtherFilter?: (a: IQuestCondition) => IQuestCondition[],
    ): IQuestCondition[] {
        return this.filterConditions(q, "Level", furtherFilter);
    }

    public getLoyaltyConditions(
        q: IQuestCondition[],
        furtherFilter?: (a: IQuestCondition) => IQuestCondition[],
    ): IQuestCondition[] {
        return this.filterConditions(q, "TraderLoyalty", furtherFilter);
    }

    public getStandingConditions(
        q: IQuestCondition[],
        furtherFilter?: (a: IQuestCondition) => IQuestCondition[],
    ): IQuestCondition[] {
        return this.filterConditions(q, "TraderStanding", furtherFilter);
    }

    protected filterConditions(
        q: IQuestCondition[],
        questType: string,
        furtherFilter?: (a: IQuestCondition) => IQuestCondition[],
    ): IQuestCondition[] {
        const filteredQuests = q.filter((c) => {
            if (c.conditionType === questType) {
                if (furtherFilter) {
                    return furtherFilter(c);
                }
                return true;
            }
            return false;
        });

        return filteredQuests;
    }
}
