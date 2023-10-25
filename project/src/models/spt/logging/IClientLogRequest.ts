import { LogLevel } from "./LogLevel";

export interface IClientLogRequest 
{
    Source: string
    Level: LogLevel | string
    Message: string
    Color?: string
    BackgroundColor?: string
}