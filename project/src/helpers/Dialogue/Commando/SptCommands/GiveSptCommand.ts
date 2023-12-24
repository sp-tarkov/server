import {ISptCommand} from "@spt-aki/helpers/Dialogue/Commando/SptCommands/ISptCommand";
import {ISendMessageRequest} from "@spt-aki/models/eft/dialog/ISendMessageRequest";
import {inject, injectable} from "tsyringe";
import {ILogger} from "@spt-aki/models/spt/utils/ILogger";
import {MailSendService} from "@spt-aki/services/MailSendService";
import {IUserDialogInfo} from "@spt-aki/models/eft/profile/IAkiProfile";
import {ItemHelper} from "@spt-aki/helpers/ItemHelper";
import {HashUtil} from "@spt-aki/utils/HashUtil";

@injectable()
export class GiveSptCommand implements ISptCommand
{
    public constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("MailSendService") protected mailSendService: MailSendService
    ) {
    }

    public getCommand(): string {
        return "give";
    }

    public getCommandHelp(): string {
        return "Usage: spt give tplId quantity";
    }

    public handle(commandHandler: IUserDialogInfo, sessionId: string, request: ISendMessageRequest): string {
        const giveCommand = request.text.split(" ");
        if (giveCommand[1] != "give")
        {
            this.logger.error("Invalid action received for give command!")
            return request.dialogId;
        }

        if (!giveCommand[2])
        {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                commandHandler,
                "Invalid use of give command! Template ID is missing. Use \"Help\" for more info"
            );
            return request.dialogId;
        }
        const tplId = giveCommand[2];

        if (!giveCommand[3])
        {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                commandHandler,
                "Invalid use of give command! Quantity is missing. Use \"Help\" for more info"
            );
            return request.dialogId;
        }
        const quantity = giveCommand[3];

        if (Number.isNaN(+quantity))
        {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                commandHandler,
                "Invalid use of give command! Quantity is not a valid integer. Use \"Help\" for more info"
            );
            return request.dialogId;
        }

        const checkedItem = this.itemHelper.getItem(tplId);
        if (!checkedItem[0])
        {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                commandHandler,
                "Invalid template ID requested for give command. The item doesnt exists on the DB."
            );
            return request.dialogId;
        }

        this.mailSendService.sendSystemMessageToPlayer(sessionId, "Give command!", [{
            _id: this.hashUtil.generate(),
            _tpl: checkedItem[1]._id,
            upd: {
                StackObjectsCount: +quantity
            }
        }]);

        return request.dialogId;
    }

}
