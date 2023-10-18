import { MinMax } from "@spt-aki/models/common/MinMax";
import { ELocationName } from "@spt-aki/models/enums/ELocationName";
import { SeasonalEventType } from "@spt-aki/models/enums/SeasonalEventType";
import { IBaseConfig } from "@spt-aki/models/spt/config/IBaseConfig";

export interface IQuestConfig extends IBaseConfig
{
    kind: "aki-quest"
    // Hours to get/redeem items from quest mail
    redeemTime: number
    questTemplateIds: IPlayerTypeQuestIds
    /** Show non-seasonal quests be shown to player */
    showNonSeasonalEventQuests: boolean
    eventQuests: Record<string, IEventQuestData>
    repeatableQuests: IRepeatableQuestConfig[]
    locationIdMap: Record<string, string>
    bearOnlyQuests: string[]
    usecOnlyQuests: string[]
}

export interface IPlayerTypeQuestIds
{
    pmc: IQuestTypeIds
    scav: IQuestTypeIds
}

export interface IQuestTypeIds
{
    Elimination: string
    Completion: string
    Exploration: string
}

export interface IEventQuestData
{
    name: string
    season: SeasonalEventType
    startTimestamp: number
    endTimestamp: number
    yearly: boolean
}
  
export interface IRepeatableQuestConfig 
{
    name: string
    side: string
    types: string[]
    resetTime: number
    numQuests: number
    minPlayerLevel: number
    rewardScaling: IRewardScaling
    locations: Record<ELocationName, string[]> 
    traderWhitelist: ITraderWhitelist[]
    questConfig: IRepeatableQuestTypesConfig
    /** Item base types to block when generating rewards */
    rewardBaseTypeBlacklist: string[]
    /** Item tplIds to ignore when generating rewards */
    rewardBlacklist: string[]
    rewardAmmoStackMinSize: number;
}
  
export interface IRewardScaling 
{
    levels: number[]
    experience: number[]
    roubles: number[]
    items: number[]
    reputation: number[]
    rewardSpread: number
}
  
export interface ITraderWhitelist 
{
    traderId: string
    questTypes: string[]
}
  
export interface IRepeatableQuestTypesConfig 
{
    Exploration: IExploration
    Completion: ICompletion
    Pickup: IPickup;
    Elimination: IEliminationConfig[]
}
  
export interface IExploration 
{
    maxExtracts: number
    specificExits: ISpecificExits
}
  
export interface ISpecificExits 
{
    probability: number
    passageRequirementWhitelist: string[]
}
  
export interface ICompletion 
{
    minRequestedAmount: number
    maxRequestedAmount: number
    minRequestedBulletAmount: number
    maxRequestedBulletAmount: number
    useWhitelist: boolean
    useBlacklist: boolean
}

export interface IPickup
{
    ItemTypeToFetchWithMaxCount: IPickupTypeWithMaxCount[]
}

export interface IPickupTypeWithMaxCount
{
    itemType: string
    maxPickupCount: number
    minPickupCount: number
}
  
export interface IEliminationConfig 
{
    levelRange: MinMax
    targets: ITarget[]
    bodyPartProb: number
    bodyParts: IBodyPart[]
    specificLocationProb: number
    distLocationBlacklist: string[]
    distProb: number
    maxDist: number
    minDist: number
    maxKills: number
    minKills: number
    minBossKills: number
    maxBossKills: number
    weaponCategoryRequirementProb: number
    weaponCategoryRequirements: IWeaponRequirement[]
    weaponRequirementProb: number
    weaponRequirements: IWeaponRequirement[]
}

export interface ITarget extends IProbabilityObject
{
    data: IBossInfo
}

export interface IBossInfo 
{
    isBoss: boolean
}

export interface IBodyPart extends IProbabilityObject 
{
    data: string[]
}

export interface IWeaponRequirement extends IProbabilityObject 
{
    data: string[]
}

export interface IProbabilityObject 
{
    key: string
    relativeProbability: number
    data?: any
}