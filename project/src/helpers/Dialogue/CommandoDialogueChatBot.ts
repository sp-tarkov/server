import {inject, injectable, injectAll} from "tsyringe";

import {IDialogueChatBot} from "@spt-aki/helpers/Dialogue/IDialogueChatBot";
import {IUserDialogInfo} from "@spt-aki/models/eft/profile/IAkiProfile";
import {ISendMessageRequest} from "@spt-aki/models/eft/dialog/ISendMessageRequest";
import {MemberCategory} from "@spt-aki/models/enums/MemberCategory";
import {ICommandoCommand} from "@spt-aki/helpers/Dialogue/Commando/ICommandoCommand";
import {ILogger} from "@spt-aki/models/spt/utils/ILogger";
import {MailSendService} from "@spt-aki/services/MailSendService";
import {ICommandoAction} from "@spt-aki/helpers/Dialogue/Commando/ICommandoAction";

@injectable()
export class CommandoDialogueChatBot implements IDialogueChatBot {

    // A map that contains the command prefix. That contains a map that contains the prefix commands with their respective actions.
    protected registeredCommands: Map<string, Map<string, ICommandoAction>> = new Map<string, Map<string, ICommandoAction>>();
    public constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @injectAll("CommandoCommand") protected commandoCommands: ICommandoCommand[]
    ) {
        for (const commandoCommand of commandoCommands) {
            if (this.registeredCommands.has(commandoCommand.getCommandPrefix()) || commandoCommand.getCommandPrefix().toLowerCase() == "help") {
                this.logger.error(`Could not registered command prefix ${commandoCommand.getCommandPrefix()} as it already has been registered. Skipping.`);
                continue;
            }

            const commandMap = new Map<string, ICommandoAction>();
            this.registeredCommands.set(commandoCommand.getCommandPrefix(), commandMap);
            for (const command of commandoCommand.getCommands()) {
                commandMap.set(command, commandoCommand.getCommandAction(command))
            }
        }
    }

    public getChatBot(): IUserDialogInfo {
        return {
            _id: "sptCommando",
            info: {
                Level: 1,
                MemberCategory: MemberCategory.DEVELOPER,
                Nickname: "Commando",
                Side: "Usec",
            },
        };
    }

    public handleMessage(sessionId: string, request: ISendMessageRequest): string {
        if ((request.text ?? "").length == 0)
        {
            this.logger.error(`Commando command came in as empty text! Invalid data!`);
            return request.dialogId;
        }

        const splitCommand = request.text.split(" ");

        if (this.registeredCommands.has(splitCommand[0]) && this.registeredCommands.get(splitCommand[0]).has(splitCommand[1]))
            return this.registeredCommands.get(splitCommand[0]).get(splitCommand[1]).handle(this.getChatBot(), sessionId, request);

        if (splitCommand[0].toLowerCase() == "help")
        {
            const helpMessage = this.commandoCommands.filter(c => this.registeredCommands.has(c.getCommandPrefix()))
                .filter(c => Array.from(c.getCommands()).some(com => this.registeredCommands.get(c.getCommandPrefix()).has(com)))
                .map(c => `Help for ${c.getCommandPrefix()}:\n${Array.from(c.getCommands()).map(command => c.getCommandHelp(command)).join("\n")}`)
                .join("\n");
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                this.getChatBot(),
                helpMessage
            );
            return request.dialogId;
        }

        this.mailSendService.sendUserMessageToPlayer(
            sessionId,
            this.getChatBot(),
            `Im sorry soldier, I dont recognize the command you are trying to use! Type "help" to see available commands.`
        );
    }

}
