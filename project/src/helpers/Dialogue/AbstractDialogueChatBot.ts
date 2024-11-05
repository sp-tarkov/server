import { IChatCommand } from "@spt/helpers/Dialogue/Commando/IChatCommand";
import { IDialogueChatBot } from "@spt/helpers/Dialogue/IDialogueChatBot";
import { ISendMessageRequest } from "@spt/models/eft/dialog/ISendMessageRequest";
import { IUserDialogInfo } from "@spt/models/eft/profile/ISptProfile";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { MailSendService } from "@spt/services/MailSendService";

export abstract class AbstractDialogueChatBot implements IDialogueChatBot {
    public constructor(
        protected logger: ILogger,
        protected mailSendService: MailSendService,
        protected chatCommands: IChatCommand[],
    ) {}

    public registerChatCommand(chatCommand: IChatCommand): void {
        if (this.chatCommands.some((cc) => cc.getCommandPrefix() === chatCommand.getCommandPrefix())) {
            throw new Error(
                `The command "${chatCommand.getCommandPrefix()}" attempting to be registered already exists.`,
            );
        }
        this.chatCommands.push(chatCommand);
    }

    public abstract getChatBot(): IUserDialogInfo;

    protected abstract getUnrecognizedCommandMessage(): string;

    public handleMessage(sessionId: string, request: ISendMessageRequest): string {
        if ((request.text ?? "").length === 0) {
            this.logger.error("Command came in as empty text! Invalid data!");
            return request.dialogId;
        }

        const splitCommand = request.text.split(" ");

        const commandos = this.chatCommands.filter((c) => c.getCommandPrefix() === splitCommand[0]);
        if (commandos[0]?.getCommands().has(splitCommand[1])) {
            return commandos[0].handle(splitCommand[1], this.getChatBot(), sessionId, request);
        }

        if (splitCommand[0].toLowerCase() === "help") {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                this.getChatBot(),
                "The available commands will be listed below:",
            );
            // due to BSG being dumb with messages we need a mandatory timeout between messages so they get out on the right order
            setTimeout(() => {
                for (const chatCommand of this.chatCommands) {
                    this.mailSendService.sendUserMessageToPlayer(
                        sessionId,
                        this.getChatBot(),
                        `Commands available for "${chatCommand.getCommandPrefix()}" prefix:`,
                    );
                    setTimeout(() => {
                        for (const subCommand of chatCommand.getCommands()) {
                            this.mailSendService.sendUserMessageToPlayer(
                                sessionId,
                                this.getChatBot(),
                                `Subcommand ${subCommand}:\n${chatCommand.getCommandHelp(subCommand)}`,
                            );
                        }
                    }, 1000);
                }
            }, 1000);
            return request.dialogId;
        }

        this.mailSendService.sendUserMessageToPlayer(
            sessionId,
            this.getChatBot(),
            this.getUnrecognizedCommandMessage(),
        );
    }
}
