import { SavedCommand } from "@spt/helpers/Dialogue/Commando/SptCommands/GiveCommand/SavedCommand";
import { ISptCommand } from "@spt/helpers/Dialogue/Commando/SptCommands/ISptCommand";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { ISendMessageRequest } from "@spt/models/eft/dialog/ISendMessageRequest";
import { IUserDialogInfo } from "@spt/models/eft/profile/ISptProfile";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseService } from "@spt/services/DatabaseService";
import { ItemFilterService } from "@spt/services/ItemFilterService";
import { LocaleService } from "@spt/services/LocaleService";
import { MailSendService } from "@spt/services/MailSendService";
import { HashUtil } from "@spt/utils/HashUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { stringSimilarity } from "string-similarity-js";
import { inject, injectable } from "tsyringe";

@injectable()
export class GiveSptCommand implements ISptCommand {
    /**
     * Regex to account for all these cases:
     * spt give "item name" 5
     * spt give templateId 5
     * spt give en "item name in english" 5
     * spt give es "nombre en español" 5
     * spt give 5 <== this is the reply when the algo isn't sure about an item
     */
    private static commandRegex = /^spt give (((([a-z]{2,5}) )?"(.+)"|\w+) )?([0-9]+)$/;
    private static acceptableConfidence = 0.9;
    // exception for flares
    private static excludedPresetItems = new Set<string>([
        ItemTpl.FLARE_RSP30_REACTIVE_SIGNAL_CARTRIDGE_RED,
        ItemTpl.FLARE_RSP30_REACTIVE_SIGNAL_CARTRIDGE_GREEN,
        ItemTpl.FLARE_RSP30_REACTIVE_SIGNAL_CARTRIDGE_YELLOW,
    ]);

    protected savedCommand: Map<string, SavedCommand> = new Map<string, SavedCommand>();

    public constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("LocaleService") protected localeService: LocaleService,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {}

    public getCommand(): string {
        return "give";
    }

    public getCommandHelp(): string {
        return 'spt give\n========\nSends items to the player through the message system.\n\n\tspt give [template ID] [quantity]\n\t\tEx: spt give 544fb25a4bdc2dfb738b4567 2\n\n\tspt give ["item name"] [quantity]\n\t\tEx: spt give "pack of sugar" 10\n\n\tspt give [locale] ["item name"] [quantity]\n\t\tEx: spt give fr "figurine de chat" 3';
    }

    public performAction(commandHandler: IUserDialogInfo, sessionId: string, request: ISendMessageRequest): string {
        if (!GiveSptCommand.commandRegex.test(request.text)) {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                commandHandler,
                'Invalid use of give command. Use "help" for more information.',
            );
            return request.dialogId;
        }

        const result = GiveSptCommand.commandRegex.exec(request.text);

        let item: string;
        let quantity: number;
        let isItemName: boolean;
        let locale: string;

        // This is a reply to a give request previously made pending a reply
        if (result[1] === undefined) {
            if (!this.savedCommand.has(sessionId)) {
                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    commandHandler,
                    'Invalid use of give command. Use "help" for more information.',
                );
                return request.dialogId;
            }
            const savedCommand = this.savedCommand.get(sessionId);
            if (+result[6] > savedCommand.potentialItemNames.length) {
                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    commandHandler,
                    'Invalid selection. Outside of bounds! Use "help" for more information.',
                );
                return request.dialogId;
            }
            item = savedCommand.potentialItemNames[+result[6] - 1];
            quantity = savedCommand.quantity;
            locale = savedCommand.locale;
            isItemName = true;
            this.savedCommand.delete(sessionId);
        } else {
            // A new give request was entered, we need to ignore the old saved command
            if (this.savedCommand.has(sessionId)) {
                this.savedCommand.delete(sessionId);
            }
            isItemName = result[5] !== undefined;
            item = result[5] ? result[5] : result[2];
            quantity = +result[6];
            if (quantity <= 0) {
                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    commandHandler,
                    'Invalid quantity! Must be 1 or higher. Use "help" for more information.',
                );
                return request.dialogId;
            }

            if (isItemName) {
                try {
                    locale = result[4] ? result[4] : this.localeService.getDesiredGameLocale() ?? "en";
                } catch (e) {
                    this.mailSendService.sendUserMessageToPlayer(
                        sessionId,
                        commandHandler,
                        "An error occurred while trying to use localized text. Locale will be defaulted to 'en'.",
                    );
                    this.logger.warning(e);
                    locale = "en";
                }

                const localizedGlobal =
                    this.databaseService.getLocales().global[locale] ?? this.databaseService.getLocales().global.en;

                const closestItemsMatchedByName = this.itemHelper
                    .getItems()
                    .filter((i) => this.isItemAllowed(i))
                    .map((i) => localizedGlobal[`${i?._id} Name`]?.toLowerCase() ?? i._props.Name)
                    .filter((i) => i !== undefined && i !== "")
                    .map((i) => ({
                        match: stringSimilarity(item.toLocaleLowerCase(), i.toLocaleLowerCase()),
                        itemName: i,
                    }))
                    .sort((a1, a2) => a2.match - a1.match);

                if (closestItemsMatchedByName[0].match >= GiveSptCommand.acceptableConfidence) {
                    item = closestItemsMatchedByName[0].itemName;
                } else {
                    let i = 1;
                    const slicedItems = closestItemsMatchedByName.slice(0, 10);
                    // max 10 item names and map them
                    const itemList = slicedItems
                        .map((match) => `${i++}. ${match.itemName} (conf: ${(match.match * 100).toFixed(2)})`)
                        .join("\n");
                    this.savedCommand.set(
                        sessionId,
                        new SavedCommand(
                            quantity,
                            slicedItems.map((i) => i.itemName),
                            locale,
                        ),
                    );
                    this.mailSendService.sendUserMessageToPlayer(
                        sessionId,
                        commandHandler,
                        `Could not find exact match. Closest matches are:\n\n${itemList}\n\nUse "spt give [number]" to select one.`,
                    );
                    return request.dialogId;
                }
            }
        }

        const localizedGlobal =
            this.databaseService.getLocales().global[locale] ?? this.databaseService.getLocales().global.en;
        // If item is an item name, we need to search using that item name and the locale which one we want otherwise
        // item is just the tplId.
        const tplId = isItemName
            ? this.itemHelper
                  .getItems()
                  .filter((i) => this.isItemAllowed(i))
                  .find((i) => (localizedGlobal[`${i?._id} Name`]?.toLowerCase() ?? i._props.Name) === item)._id
            : item;

        const checkedItem = this.itemHelper.getItem(tplId);
        if (!checkedItem[0]) {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                commandHandler,
                "That item could not be found. Please refine your request and try again.",
            );
            return request.dialogId;
        }

        const itemsToSend: IItem[] = [];
        const preset = this.presetHelper.getDefaultPreset(checkedItem[1]._id);
        if (preset && !GiveSptCommand.excludedPresetItems.has(checkedItem[1]._id)) {
            for (let i = 0; i < quantity; i++) {
                let items = this.cloner.clone(preset._items);
                items = this.itemHelper.replaceIDs(items);
                itemsToSend.push(...items);
            }
        } else if (this.itemHelper.isOfBaseclass(checkedItem[1]._id, BaseClasses.AMMO_BOX)) {
            for (let i = 0; i < quantity; i++) {
                const ammoBoxArray: IItem[] = [];
                ammoBoxArray.push({ _id: this.hashUtil.generate(), _tpl: checkedItem[1]._id });
                // DO NOT generate the ammo box cartridges, the mail service does it for us! :)
                // this.itemHelper.addCartridgesToAmmoBox(ammoBoxArray, checkedItem[1]);
                itemsToSend.push(...ammoBoxArray);
            }
        } else {
            if (checkedItem[1]._props.StackMaxSize === 1) {
                for (let i = 0; i < quantity; i++) {
                    itemsToSend.push({
                        _id: this.hashUtil.generate(),
                        _tpl: checkedItem[1]._id,
                        upd: this.itemHelper.generateUpdForItem(checkedItem[1]),
                    });
                }
            } else {
                const item: IItem = {
                    _id: this.hashUtil.generate(),
                    _tpl: checkedItem[1]._id,
                    upd: this.itemHelper.generateUpdForItem(checkedItem[1]),
                };
                item.upd.StackObjectsCount = quantity;
                try {
                    itemsToSend.push(...this.itemHelper.splitStack(item));
                } catch {
                    this.mailSendService.sendUserMessageToPlayer(
                        sessionId,
                        commandHandler,
                        "Too many items requested. Please lower the amount and try again.",
                    );
                    return request.dialogId;
                }
            }
        }

        // Flag the items as FiR
        this.itemHelper.setFoundInRaid(itemsToSend);

        this.mailSendService.sendSystemMessageToPlayer(sessionId, "SPT GIVE", itemsToSend);
        return request.dialogId;
    }

    /**
     * A "simple" function that checks if an item is supposed to be given to a player or not
     * @param templateItem the template item to check
     * @returns true if its obtainable, false if its not
     */
    protected isItemAllowed(templateItem: ITemplateItem): boolean {
        return (
            templateItem._type !== "Node" &&
            !this.itemHelper.isQuestItem(templateItem._id) &&
            !this.itemFilterService.isItemBlacklisted(templateItem._id) &&
            (templateItem._props?.Prefab?.path ?? "") !== "" &&
            !this.itemHelper.isOfBaseclass(templateItem._id, BaseClasses.HIDEOUT_AREA_CONTAINER) &&
            !this.itemHelper.isOfBaseclass(templateItem._id, BaseClasses.LOOT_CONTAINER) &&
            !this.itemHelper.isOfBaseclass(templateItem._id, BaseClasses.RANDOM_LOOT_CONTAINER) &&
            !this.itemHelper.isOfBaseclass(templateItem._id, BaseClasses.MOB_CONTAINER)
        );
    }
}
