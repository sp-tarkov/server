import { inject, injectAll, injectable } from "tsyringe";

import { ICommandoCommand } from "@spt-aki/helpers/Dialogue/Commando/ICommandoCommand";
import { IDialogueChatBot } from "@spt-aki/helpers/Dialogue/IDialogueChatBot";
import { ISendMessageRequest } from "@spt-aki/models/eft/dialog/ISendMessageRequest";
import { IUserDialogInfo } from "@spt-aki/models/eft/profile/IAkiProfile";
import { MemberCategory } from "@spt-aki/models/enums/MemberCategory";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { MailSendService } from "@spt-aki/services/MailSendService";

@injectable()
export class CommandoDialogueChatBot implements IDialogueChatBot
{
    public constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @injectAll("CommandoCommand") protected commandoCommands: ICommandoCommand[],
    )
    {
    }

    public registerCommandoCommand(commandoCommand: ICommandoCommand): void
    {
        if (this.commandoCommands.some((cc) => cc.getCommandPrefix() === commandoCommand.getCommandPrefix()))
        {
            throw new Error(
                `The commando command ${commandoCommand.getCommandPrefix()} being registered already exists!`,
            );
        }
        this.commandoCommands.push(commandoCommand);
    }

    public getChatBot(): IUserDialogInfo
    {
        return {
            _id: "sptCommando",
            aid: 1234567,
            Info: { Level: 1, MemberCategory: MemberCategory.DEVELOPER, Nickname: "Commando", Side: "Usec" },
        };
    }

    public handleMessage(sessionId: string, request: ISendMessageRequest): string
    {
        if ((request.text ?? "").length === 0)
        {
            this.logger.error("Commando command came in as empty text! Invalid data!");
            return request.dialogId;
        }

        const splitCommand = request.text.split(" ");

        const commandos = this.commandoCommands.filter((c) => c.getCommandPrefix() === splitCommand[0]);
        if (commandos[0]?.getCommands().has(splitCommand[1]))
        {
            return commandos[0].handle(splitCommand[1], this.getChatBot(), sessionId, request);
        }

        if (splitCommand[0].toLowerCase() === "help")
        {
            const helpMessage = this.commandoCommands.map((c) =>
                `Help for ${c.getCommandPrefix()}:\n${
                    Array.from(c.getCommands()).map((command) => c.getCommandHelp(command)).join("\n")
                }`
            ).join("\n");
            this.mailSendService.sendUserMessageToPlayer(sessionId, this.getChatBot(), helpMessage);
            return request.dialogId;
        }

        this.mailSendService.sendUserMessageToPlayer(
            sessionId,
            this.getChatBot(),
            `Im sorry soldier, I dont recognize the command you are trying to use! Type "help" to see available commands.`,
        );
    }
}
