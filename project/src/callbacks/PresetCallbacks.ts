import { inject, injectable } from "tsyringe";

import { PresetController } from "@spt-aki/controllers/PresetController";
import { OnLoad } from "@spt-aki/di/OnLoad";

@injectable()
export class PresetCallbacks implements OnLoad {
    constructor(@inject("PresetController") protected presetController: PresetController) {}

    public async onLoad(): Promise<void> {
        this.presetController.initialize();
    }

    public getRoute(): string {
        return "aki-presets";
    }
}
