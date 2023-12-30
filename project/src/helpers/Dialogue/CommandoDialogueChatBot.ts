import { inject, injectAll, injectable } from "tsyringe";

import { IChatCommand } from "@spt-aki/helpers/Dialogue/Commando/IChatCommand";
import { IUserDialogInfo } from "@spt-aki/models/eft/profile/IAkiProfile";
import { MemberCategory } from "@spt-aki/models/enums/MemberCategory";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { MailSendService } from "@spt-aki/services/MailSendService";
import { AbstractDialogueChatBot } from "@spt-aki/helpers/Dialogue/AbstractDialogueChatBot";

@injectable()
export class CommandoDialogueChatBot extends AbstractDialogueChatBot
{
    public constructor(
        @inject("WinstonLogger") logger: ILogger,
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
            info: { Level: 1, MemberCategory: MemberCategory.DEVELOPER, Nickname: "Commando", Side: "Usec" },
        };
    }

    protected getUnrecognizedCommandMessage(): string
    {
        return `Im sorry soldier, I dont recognize the command you are trying to use! Type "help" to see available commands.`;
    }
}
