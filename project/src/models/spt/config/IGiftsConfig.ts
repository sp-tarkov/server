import { Item } from "../../../models/eft/common/tables/IItem";
import { SeasonalEventType } from "../../../models/enums/SeasonalEventType";
import { IBaseConfig } from "./IBaseConfig";

export interface IGiftsConfig extends IBaseConfig
{
    kind: "aki-gifts"
    gifts: Record<string, Gift>
}

export interface Gift
{
    items: Item[]
    sender: string
    messageText: string
    timestampToSend: number
    associatedEvent: SeasonalEventType
    maxStorageTime: number,
    redeemTime: number
}