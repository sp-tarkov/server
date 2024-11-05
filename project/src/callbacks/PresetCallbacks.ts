import { PresetController } from "@spt/controllers/PresetController";
import { OnLoad } from "@spt/di/OnLoad";
import { inject, injectable } from "tsyringe";

@injectable()
export class PresetCallbacks implements OnLoad {
    constructor(@inject("PresetController") protected presetController: PresetController) {}

    public async onLoad(): Promise<void> {
        this.presetController.initialize();
    }

    public getRoute(): string {
        return "spt-presets";
    }
}
