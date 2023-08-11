export interface ISellScavItemsToFenceRequestData
{
    Action: "SellAllFromSavage",
    fromOwner: IPerson
}

export interface IPerson
{
    id: string
    type: string
}