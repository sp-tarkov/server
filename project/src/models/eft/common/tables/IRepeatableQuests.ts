import { IQuest, IQuestConditionTypes, IQuestRewards } from "@spt/models/eft/common/tables/IQuest";

export interface IRepeatableQuest extends IQuest {
    changeCost: IChangeCost[];
    changeStandingCost: number;
    sptRepatableGroupName: string;
}

export interface IRepeatableQuestDatabase {
    templates: IRepeatableTemplates;
    rewards: IRewardOptions;
    data: IOptions;
    samples: ISampleQuests[];
}

export interface IRepeatableTemplates {
    Elimination: IQuest;
    Completion: IQuest;
    Exploration: IQuest;
}

export interface IPmcDataRepeatableQuest {
    id?: string;
    name: string;
    unavailableTime?: string;
    activeQuests: IRepeatableQuest[];
    inactiveQuests: IRepeatableQuest[];
    endTime: number;
    changeRequirement: Record<string, IChangeRequirement>; // What it costs to reset <QuestId, ChangeRequirement> redundant to change requirements within IRepeatableQuest
    freeChanges: number;
    freeChangesAvailable: number;
}

export interface IChangeRequirement {
    changeCost: IChangeCost[];
    changeStandingCost: number;
}

export interface IChangeCost {
    templateId: string; // what item it will take to reset daily
    count: number; // amount of item needed to reset
}

// Config Options

export interface IRewardOptions {
    itemsBlacklist: string[];
}

export interface IOptions {
    Completion: ICompletionFilter;
}

export interface ICompletionFilter {
    itemsBlacklist: IItemsBlacklist[];
    itemsWhitelist: IItemsWhitelist[];
}

export interface IItemsBlacklist {
    minPlayerLevel: number;
    itemIds: string[];
}

export interface IItemsWhitelist {
    minPlayerLevel: number;
    itemIds: string[];
}

export interface ISampleQuests {
    _id: string;
    traderId: string;
    location: string;
    image: string;
    type: string;
    isKey: boolean;
    restartable: boolean;
    instantComplete: boolean;
    secretQuest: boolean;
    canShowNotificationsInGame: boolean;
    rewards: IQuestRewards;
    conditions: IQuestConditionTypes;
    name: string;
    note: string;
    description: string;
    successMessageText: string;
    failMessageText: string;
    startedMessageText: string;
    templateId: string;
}
