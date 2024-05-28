import { inject, injectAll, injectable } from "tsyringe";
import { AbstractDialogueChatBot } from "@spt/helpers/Dialogue/AbstractDialogueChatBot";
import { IChatCommand } from "@spt/helpers/Dialogue/Commando/IChatCommand";
import { IUserDialogInfo } from "@spt/models/eft/profile/ISptProfile";
import { MemberCategory } from "@spt/models/enums/MemberCategory";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { MailSendService } from "@spt/services/MailSendService";

@injectable()
export class CommandoDialogueChatBot extends AbstractDialogueChatBot
{
    public constructor(
    @inject("PrimaryLogger") logger: ILogger,
        @inject("MailSendService") mailSendService: MailSendService,
        @injectAll("CommandoCommand") chatCommands: IChatCommand[],
    )
    {
        super(logger, mailSendService, chatCommands);
    }

    public getChatBot(): IUserDialogInfo
    {
        return {
            _id: "sptCommando",
            aid: 1234567,
            Info: { Level: 1, MemberCategory: MemberCategory.DEVELOPER, Nickname: "Commando", Side: "Usec" },
        };
    }

    protected getUnrecognizedCommandMessage(): string
    {
        return "I'm sorry soldier, I don't recognize the command you are trying to use! Type \"help\" to see available commands.";
    }
}
