import { injectable } from "tsyringe";

import { AvailableForConditions } from "@spt-aki/models/eft/common/tables/IQuest";

@injectable()
export class QuestConditionHelper
{
    public getQuestConditions(
        q: AvailableForConditions[],
        furtherFilter: (a: AvailableForConditions) => AvailableForConditions[] = null,
    ): AvailableForConditions[]
    {
        return this.filterConditions(q, "Quest", furtherFilter);
    }

    public getLevelConditions(
        q: AvailableForConditions[],
        furtherFilter: (a: AvailableForConditions) => AvailableForConditions[] = null,
    ): AvailableForConditions[]
    {
        return this.filterConditions(q, "Level", furtherFilter);
    }

    public getLoyaltyConditions(
        q: AvailableForConditions[],
        furtherFilter: (a: AvailableForConditions) => AvailableForConditions[] = null,
    ): AvailableForConditions[]
    {
        return this.filterConditions(q, "TraderLoyalty", furtherFilter);
    }

    public getStandingConditions(
        q: AvailableForConditions[],
        furtherFilter: (a: AvailableForConditions) => AvailableForConditions[] = null,
    ): AvailableForConditions[]
    {
        return this.filterConditions(q, "TraderStanding", furtherFilter);
    }

    protected filterConditions(
        q: AvailableForConditions[],
        questType: string,
        furtherFilter: (a: AvailableForConditions) => AvailableForConditions[] = null,
    ): AvailableForConditions[]
    {
        const filteredQuests = q.filter((c) =>
        {
            if (c._parent === questType)
            {
                if (furtherFilter)
                {
                    return furtherFilter(c);
                }
                return true;
            }
            return false;
        });

        return filteredQuests;
    }
}
