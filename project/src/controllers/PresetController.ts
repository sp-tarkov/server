import { PresetHelper } from "@spt/helpers/PresetHelper";
import { IPreset } from "@spt/models/eft/common/IGlobals";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseService } from "@spt/services/DatabaseService";
import { inject, injectable } from "tsyringe";

@injectable()
export class PresetController {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
    ) {}

    public initialize(): void {
        const presets: [string, IPreset][] = Object.entries(this.databaseService.getGlobals().ItemPresets);
        const reverse: Record<string, string[]> = {};

        for (const [id, preset] of presets) {
            if (id !== preset._id) {
                this.logger.error(
                    `Preset for template tpl: '${preset._items[0]._tpl} ${preset._name}' has invalid key: (${id} != ${preset._id}). Skipping`,
                );

                continue;
            }

            const tpl = preset._items[0]._tpl;

            if (!(tpl in reverse)) {
                reverse[tpl] = [];
            }

            reverse[tpl].push(preset._id);
        }

        this.presetHelper.hydratePresetStore(reverse);
    }
}
