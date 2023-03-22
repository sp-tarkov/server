import { IProcessBaseTradeRequestData } from "./IProcessBaseTradeRequestData";

export interface IProcessSellTradeRequestData extends IProcessBaseTradeRequestData 
{
    Action: "sell_to_trader"
    type: string
    tid: string
    price: number
    items: Item[]
}

export interface Item 
{
    id: string
    count: number
    // eslint-disable-next-line @typescript-eslint/naming-convention
    scheme_id: number
}