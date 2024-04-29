import { SavedCommand } from "@spt-aki/helpers/Dialogue/Commando/SptCommands/GiveCommand/SavedCommand";
import { ISptCommand } from "@spt-aki/helpers/Dialogue/Commando/SptCommands/ISptCommand";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { PresetHelper } from "@spt-aki/helpers/PresetHelper";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { ISendMessageRequest } from "@spt-aki/models/eft/dialog/ISendMessageRequest";
import { IUserDialogInfo } from "@spt-aki/models/eft/profile/IAkiProfile";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ItemFilterService } from "@spt-aki/services/ItemFilterService";
import { LocaleService } from "@spt-aki/services/LocaleService";
import { MailSendService } from "@spt-aki/services/MailSendService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { closestMatch, distance } from "closest-match";
import { inject, injectable } from "tsyringe";

@injectable()
export class GiveSptCommand implements ISptCommand
{
    /**
     * Regex to account for all these cases:
     * spt give "item name" 5
     * spt give templateId 5
     * spt give en "item name in english" 5
     * spt give es "nombre en español" 5
     * spt give 5 <== this is the reply when the algo isn't sure about an item
     */
    private static commandRegex = /^spt give (((([a-z]{2,5}) )?"(.+)"|\w+) )?([0-9]+)$/;
    private static maxAllowedDistance = 1.5;

    protected savedCommand: Map<string, SavedCommand> = new Map<string, SavedCommand>();

    public constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("LocaleService") protected localeService: LocaleService,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
    )
    {
    }

    public getCommand(): string
    {
        return "give";
    }

    public getCommandHelp(): string
    {
        return "spt give\n========\nSends items to the player through the message system.\n\n\tspt give [template ID] [quantity]\n\t\tEx: spt give 544fb25a4bdc2dfb738b4567 2\n\n\tspt give [\"item name\"] [quantity]\n\t\tEx: spt give \"pack of sugar\" 10\n\n\tspt give [locale] [\"item name\"] [quantity]\n\t\tEx: spt give fr \"figurine de chat\" 3";
    }

    public performAction(commandHandler: IUserDialogInfo, sessionId: string, request: ISendMessageRequest): string
    {
        if (!GiveSptCommand.commandRegex.test(request.text))
        {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                commandHandler,
                "Invalid use of give command. Use \"help\" for more information.",
            );
            return request.dialogId;
        }

        const result = GiveSptCommand.commandRegex.exec(request.text);

        let item: string;
        let quantity: number;
        let isItemName: boolean;
        let locale: string;

        // This is a reply to a give request previously made pending a reply
        if (result[1] === undefined)
        {
            if (!this.savedCommand.has(sessionId))
            {
                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    commandHandler,
                    "Invalid use of give command. Use \"help\" for more information.",
                );
                return request.dialogId;
            }
            const savedCommand = this.savedCommand.get(sessionId);
            if (+result[6] > savedCommand.potentialItemNames.length)
            {
                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    commandHandler,
                    "Invalid selection. Outside of bounds! Use \"help\" for more information.",
                );
                return request.dialogId;
            }
            item = savedCommand.potentialItemNames[+result[6] - 1];
            quantity = savedCommand.quantity;
            locale = savedCommand.locale;
            isItemName = true;
            this.savedCommand.delete(sessionId);
        }
        else
        {
            // A new give request was entered, we need to ignore the old saved command
            if (this.savedCommand.has(sessionId))
            {
                this.savedCommand.delete(sessionId);
            }
            isItemName = result[5] !== undefined;
            item = result[5] ? result[5] : result[2];
            quantity = +result[6];
            if (quantity <= 0)
            {
                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    commandHandler,
                    `Invalid quantity! Must be 1 or higher. Use \"help\" for more information.`,
                );
                return request.dialogId;
            }

            if (isItemName)
            {
                locale = result[4] ? result[4] : this.localeService.getDesiredGameLocale();
                if (!this.localeService.getServerSupportedLocales().includes(locale))
                {
                    this.mailSendService.sendUserMessageToPlayer(
                        sessionId,
                        commandHandler,
                        `Unknown locale "${locale}". Use \"help\" for more information.`,
                    );
                    return request.dialogId;
                }

                const localizedGlobal = this.databaseServer.getTables().locales.global[locale];

                const closestItemsMatchedByName = closestMatch(
                    item.toLowerCase(),
                    this.itemHelper.getItems().filter((i) => i._type !== "Node").filter((i) =>
                        !this.itemFilterService.isItemBlacklisted(i._id)
                    ).map((i) => localizedGlobal[`${i?._id} Name`]?.toLowerCase()).filter((i) => i !== undefined),
                    true,
                ) as string[];

                if (closestItemsMatchedByName === undefined || closestItemsMatchedByName.length === 0)
                {
                    this.mailSendService.sendUserMessageToPlayer(
                        sessionId,
                        commandHandler,
                        "That item could not be found. Please refine your request and try again.",
                    );
                    return request.dialogId;
                }

                if (closestItemsMatchedByName.length > 1)
                {
                    let i = 1;
                    const slicedItems = closestItemsMatchedByName.slice(0, 10);
                    // max 10 item names and map them
                    const itemList = slicedItems.map((itemName) => `${i++}. ${itemName}`).join("\n");
                    this.savedCommand.set(sessionId, new SavedCommand(quantity, slicedItems, locale));
                    this.mailSendService.sendUserMessageToPlayer(
                        sessionId,
                        commandHandler,
                        `Could not find exact match. Closest matches are:\n\n${itemList}\n\nUse "spt give [number]" to select one.`,
                    );
                    return request.dialogId;
                }

                const dist = distance(item, closestItemsMatchedByName[0]);
                if (dist > GiveSptCommand.maxAllowedDistance)
                {
                    this.mailSendService.sendUserMessageToPlayer(
                        sessionId,
                        commandHandler,
                        `Found a possible match for "${item}" but uncertain. Match: "${
                            closestItemsMatchedByName[0]
                        }". Please refine your request and try again.`,
                    );
                    return request.dialogId;
                }
                // Only one available so we get that entry and use it
                item = closestItemsMatchedByName[0];
            }
        }

        // If item is an item name, we need to search using that item name and the locale which one we want otherwise
        // item is just the tplId.
        const tplId = isItemName
            ? this.itemHelper.getItems().filter((i) => !this.itemFilterService.isItemBlacklisted(i._id)).find((i) =>
                this.databaseServer.getTables().locales.global[locale][`${i?._id} Name`]?.toLowerCase() === item
            )._id
            : item;

        const checkedItem = this.itemHelper.getItem(tplId);
        if (!checkedItem[0])
        {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                commandHandler,
                "That item could not be found. Please refine your request and try again.",
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
                    "That weapon template ID could not be found. Please refine your request and try again.",
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
                upd: { StackObjectsCount: +quantity, SpawnedInSession: true },
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
                    "Too many items requested. Please lower the amount and try again.",
                );
                return request.dialogId;
            }
        }

        // Flag the items as FiR
        this.itemHelper.setFoundInRaid(itemsToSend);

        this.mailSendService.sendSystemMessageToPlayer(sessionId, "SPT GIVE", itemsToSend);
        return request.dialogId;
    }
}
