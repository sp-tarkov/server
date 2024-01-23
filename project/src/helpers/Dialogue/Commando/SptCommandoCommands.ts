import { ICommandoCommand } from "@spt-aki/helpers/Dialogue/Commando/ICommandoCommand";
import { ISptCommand } from "@spt-aki/helpers/Dialogue/Commando/SptCommands/ISptCommand";
import { ISendMessageRequest } from "@spt-aki/models/eft/dialog/ISendMessageRequest";
import { IUserDialogInfo } from "@spt-aki/models/eft/profile/IAkiProfile";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { ICoreConfig } from "@spt-aki/models/spt/config/ICoreConfig";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { inject, injectAll, injectable } from "tsyringe";

@injectable()
export class SptCommandoCommands implements ICommandoCommand
{
    constructor(
        @inject("ConfigServer") protected configServer: ConfigServer,
        @injectAll("SptCommand") protected sptCommands: ISptCommand[],
    )
    {
        const coreConfigs = this.configServer.getConfig<ICoreConfig>(ConfigTypes.CORE);
        // if give command is disabled or commando commands are disabled
        if (
            !(coreConfigs.features?.chatbotFeatures?.commandoFeatures?.giveCommandEnabled
                && coreConfigs.features?.chatbotFeatures?.commandoEnabled)
        )
        {
            const giveCommand = this.sptCommands.find((c) => c.getCommand().toLocaleLowerCase() === "give");
            this.sptCommands.splice(this.sptCommands.indexOf(giveCommand), 1);
        }
    }

    public registerSptCommandoCommand(command: ISptCommand): void
    {
        if (this.sptCommands.some((c) => c.getCommand() === command.getCommand()))
        {
            throw new Error(`The command ${command.getCommand()} being registered for SPT Commands already exists!`);
        }
        this.sptCommands.push(command);
    }

    public getCommandHelp(command: string): string
    {
        return this.sptCommands.find((c) => c.getCommand() === command)?.getCommandHelp();
    }

    public getCommandPrefix(): string
    {
        return "spt";
    }

    public getCommands(): Set<string>
    {
        return new Set(this.sptCommands.map((c) => c.getCommand()));
    }

    public handle(
        command: string,
        commandHandler: IUserDialogInfo,
        sessionId: string,
        request: ISendMessageRequest,
    ): string
    {
        return this.sptCommands.find((c) => c.getCommand() === command).performAction(
            commandHandler,
            sessionId,
            request,
        );
    }
}
