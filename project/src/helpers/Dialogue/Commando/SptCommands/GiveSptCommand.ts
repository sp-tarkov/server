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
import { LocaleService } from "@spt-aki/services/LocaleService";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { closestMatch, distance } from "closest-match";
import { SavedCommand } from "@spt-aki/helpers/Dialogue/Commando/SptCommands/SavedCommand";

@injectable()
export class GiveSptCommand implements ISptCommand
{
    /**
     * Regex to account for all these cases:
     * spt give "item name" 5
     * spt give templateId 5
     * spt give en "item name in english" 5
     * spt give es "nombre en español" 5
     * spt give 5 <== this is the reply when the algo isnt sure about an item
     */
    private static commandRegex = /^spt give (((([a-z]{2,5}) )?"(.+)"|\w+) )?([0-9]+)$/;
    private static maxAllowedDistance = 1.5;

    protected savedCommand: SavedCommand;

    public constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("LocaleService") protected localeService: LocaleService,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
    )
    {
    }

    public getCommand(): string
    {
        return "give";
    }

    public getCommandHelp(): string
    {
        return "Usage:\n\t- spt give tplId quantity\n\t- spt give locale \"item name\" quantity\n\t- spt give \"item name\" quantity\nIf using name, must be as seen in the wiki.";
    }

    public performAction(commandHandler: IUserDialogInfo, sessionId: string, request: ISendMessageRequest): string
    {
        if (!GiveSptCommand.commandRegex.test(request.text))
        {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                commandHandler,
                "Invalid use of give command! Use \"Help\" for more info",
            );
            return request.dialogId;
        }

        const result = GiveSptCommand.commandRegex.exec(request.text);

        let item: string;
        let quantity: number;
        let isItemName: boolean;
        let locale: string;
        // this is a reply to a give request previously made pending a reply
        if (result[1] === undefined)
        {
            if (this.savedCommand === undefined)
            {
                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    commandHandler,
                    "Invalid use of give command! Use \"Help\" for more info",
                );
                return request.dialogId;
            }
            if (+result[6] > this.savedCommand.potentialItemNames.length)
            {
                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    commandHandler,
                    "Invalid item selected, outside of bounds! Use \"Help\" for more info",
                );
                return request.dialogId;
            }
            item = this.savedCommand.potentialItemNames[+result[6] - 1];
            quantity = this.savedCommand.quantity;
            locale = this.savedCommand.locale;
            isItemName = true;
            this.savedCommand = undefined;
        }
        else
        {
            // a new give request was entered, we need to ignore the old saved command
            this.savedCommand = undefined;
            isItemName = result[5] !== undefined;
            item = result[5] ? result[5] : result[2];
            quantity = +result[6];

            if (isItemName)
            {
                locale = result[4] ? result[4] : this.localeService.getDesiredGameLocale();
                if (!this.localeService.getServerSupportedLocales().includes(locale))
                {
                    this.mailSendService.sendUserMessageToPlayer(
                        sessionId,
                        commandHandler,
                        `Invalid use of give command! Unknown locale "${locale}". Use "Help" for more info`,
                    );
                    return request.dialogId;
                }

                const localizedGlobal = this.databaseServer.getTables().locales.global[locale];

                const closestItemsMatchedByName = closestMatch(item.toLowerCase(), this.itemHelper.getItems()
                    .filter(i => i._type !== "Node")
                    .map(i => localizedGlobal[`${i?._id} Name`]?.toLowerCase())
                    .filter(i => i !== undefined), true) as string[];

                if (closestItemsMatchedByName === undefined || closestItemsMatchedByName.length === 0)
                {
                    this.mailSendService.sendUserMessageToPlayer(
                        sessionId,
                        commandHandler,
                        "We couldnt find any items that are similar to what you entered.",
                    );
                    return request.dialogId;
                }
                if (closestItemsMatchedByName.length > 1)
                {
                    let i = 1;
                    const slicedItems = closestItemsMatchedByName.slice(0, 10);
                    // max 10 item names and map them
                    const itemList = slicedItems.map(iname => `\t${i++}. ${iname}`).join("\n");
                    this.savedCommand = new SavedCommand(quantity, slicedItems, locale);
                    this.mailSendService.sendUserMessageToPlayer(
                        sessionId,
                        commandHandler,
                        `We couldnt find the exact name match you were looking for. The closest matches are:\n${itemList}\nType in "spt give number" to indicate which one you want.`,
                    );
                    return request.dialogId;
                }
                else
                {
                    const dist = distance(item, closestItemsMatchedByName[0]);
                    if (dist > GiveSptCommand.maxAllowedDistance)
                    {
                        this.mailSendService.sendUserMessageToPlayer(
                            sessionId,
                            commandHandler,
                            `There was only one match for your item search of "${item}" but its outside the acceptable bounds: ${closestItemsMatchedByName[0]}`,
                        );
                        return request.dialogId;
                    }
                    // only one available so we get that entry and use it
                    item = closestItemsMatchedByName[0];
                }
            }
        }

        // if item is an item name, we need to search using that item name and the locale which one we want
        // otherwise item is just the tpl id
        const tplId = isItemName ? this.itemHelper.getItems()
                .find(i => this.databaseServer.getTables().locales.global[locale][`${i?._id} Name`]?.toLowerCase() === item)
                ._id
            : item;

        const checkedItem = this.itemHelper.getItem(tplId);
        if (!checkedItem[0])
        {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                commandHandler,
                "Invalid template ID requested for give command. The item doesnt exists on the DB.",
            );
            return request.dialogId;
        }

        const itemsToSend: Item[] = [];
        if (this.itemHelper.isOfBaseclass(checkedItem[1]._id, BaseClasses.WEAPON))
        {
            const preset = this.presetHelper.getDefaultPreset(checkedItem[1]._id);
            if (!preset)
            {
                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    commandHandler,
                    "Invalid weapon template ID requested. There are no default presets for this weapon.",
                );
                return request.dialogId;
            }
            itemsToSend.push(...this.jsonUtil.clone(preset._items));
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
                upd: { StackObjectsCount: +quantity },
            };
            try 
            {
                itemsToSend.push(...this.itemHelper.splitStack(item));
            }
            catch
            {
                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    commandHandler,
                    "The amount of items you requested to be given caused an error, try using a smaller amount!",
                );
                return request.dialogId;
            }
        }

        this.mailSendService.sendSystemMessageToPlayer(sessionId, "Give command!", itemsToSend);
        return request.dialogId;
    }
}
