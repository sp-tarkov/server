import {ICommandoAction} from "@spt-aki/helpers/Dialogue/Commando/ICommandoAction";

export interface ISptCommand extends ICommandoAction
{
    getCommand(): string;
    getCommandHelp(): string;
}
