import { inject, injectable } from "tsyringe";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { IPreset } from "@spt/models/eft/common/IGlobals";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt/servers/DatabaseServer";

@injectable()
export class PresetController
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
    )
    {}

    public initialize(): void
    {
        const presets: [string, IPreset][] = Object.entries(this.databaseServer.getTables().globals.ItemPresets);
        const reverse: Record<string, string[]> = {};

        for (const [id, preset] of presets)
        {
            if (id !== preset._id)
            {
                this.logger.error(
                    `Preset for template tpl: '${preset._items[0]._tpl} ${preset._name}' has invalid key: (${id} != ${preset._id}). Skipping`,
                );

                continue;
            }

            const tpl = preset._items[0]._tpl;

            if (!(tpl in reverse))
            {
                reverse[tpl] = [];
            }

            reverse[tpl].push(preset._id);
        }

        this.presetHelper.hydratePresetStore(reverse);
    }
}
