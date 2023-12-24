import { ICommandoAction } from "@spt-aki/helpers/Dialogue/Commando/ICommandoAction";

export interface ICommandoCommand
{
    getCommandPrefix(): string;
    getCommandHelp(command: string): string;
    getCommands(): Set<string>;
    getCommandAction(command: string): ICommandoAction;
}
