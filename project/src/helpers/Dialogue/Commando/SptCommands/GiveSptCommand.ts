import { ISptCommand } from "@spt-aki/helpers/Dialogue/Commando/SptCommands/ISptCommand";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { PresetHelper } from "@spt-aki/helpers/PresetHelper";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { ISendMessageRequest } from "@spt-aki/models/eft/dialog/ISendMessageRequest";
import { IUserDialogInfo } from "@spt-aki/models/eft/profile/IAkiProfile";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { MailSendService } from "@spt-aki/services/MailSendService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class GiveSptCommand implements ISptCommand
{
    public constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("MailSendService") protected mailSendService: MailSendService,
    )
    {
    }

    public getCommand(): string
    {
        return "give";
    }

    public getCommandHelp(): string
    {
        return "Usage: spt give tplId quantity";
    }

    public performAction(commandHandler: IUserDialogInfo, sessionId: string, request: ISendMessageRequest): string
    {
        const giveCommand = request.text.split(" ");
        if (giveCommand[1] !== "give")
        {
            this.logger.error("Invalid action received for give command!");
            return request.dialogId;
        }

        if (!giveCommand[2])
        {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                commandHandler,
                "Invalid use of give command! Template ID is missing. Use \"Help\" for more info",
            );
            return request.dialogId;
        }
        const tplId = giveCommand[2];

        if (!giveCommand[3])
        {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                commandHandler,
                "Invalid use of give command! Quantity is missing. Use \"Help\" for more info",
            );
            return request.dialogId;
        }
        const quantity = giveCommand[3];

        if (Number.isNaN(+quantity))
        {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                commandHandler,
                "Invalid use of give command! Quantity is not a valid integer. Use \"Help\" for more info",
            );
            return request.dialogId;
        }

        const checkedItem = this.itemHelper.getItem(tplId);
        if (!checkedItem[0])
        {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                commandHandler,
                "Invalid template ID requested for give command. The item doesn't exist in the DB.",
            );
            return request.dialogId;
        }

        const itemsToSend: Item[] = [];
        const preset = this.presetHelper.getDefaultPreset(checkedItem[1]._id);
        if (preset)
        {
            for (let i = 0; i < +quantity; i++)
            {
                // Make sure IDs are unique before adding to array - prevent collisions
                const presetToSend = this.itemHelper.replaceIDs(preset._items);
                itemsToSend.push(...presetToSend);
            }
        }
        else if (this.itemHelper.isOfBaseclass(checkedItem[1]._id, BaseClasses.AMMO_BOX))
        {
            for (let i = 0; i < +quantity; i++)
            {
                const ammoBoxArray: Item[] = [];
                ammoBoxArray.push({ _id: this.hashUtil.generate(), _tpl: checkedItem[1]._id });
                this.itemHelper.addCartridgesToAmmoBox(ammoBoxArray, checkedItem[1]);
                itemsToSend.push(...ammoBoxArray);
            }
        }
        else
        {
            const item: Item = {
                _id: this.hashUtil.generate(),
                _tpl: checkedItem[1]._id,
                upd: { StackObjectsCount: +quantity, SpawnedInSession: true },
            };
            itemsToSend.push(...this.itemHelper.splitStack(item));
        }

        // Flag the items as FiR
        this.itemHelper.setFoundInRaid(itemsToSend);

        this.mailSendService.sendSystemMessageToPlayer(sessionId, "Give command!", itemsToSend);
        return request.dialogId;
    }
}
