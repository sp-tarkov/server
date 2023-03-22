import { IBaseInteractionRequestData } from "../common/request/IBaseInteractionRequestData";

export interface IInventoryBaseActionRequestData extends IBaseInteractionRequestData 
{

}

export interface To 
{
    id: string
    container: string
    location?: ToLocation | number // Hack
}

export interface ToLocation 
{
    x: number
    y: number
    r: string
    rotation?: string
    isSearched: boolean
}

export interface Container 
{
    id: string
    container: string
    location?: Location | number // Hack - BSG data object shows it as Location only
}
  
export interface Location 
{
    x: number
    y: number
    r: string
    rotation?: string
    isSearched: boolean
}