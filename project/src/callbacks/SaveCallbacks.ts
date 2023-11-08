import { inject, injectable } from "tsyringe";

import { OnLoad } from "@spt-aki/di/OnLoad";
import { OnUpdate } from "@spt-aki/di/OnUpdate";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { ICoreConfig } from "@spt-aki/models/spt/config/ICoreConfig";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { SaveServer } from "@spt-aki/servers/SaveServer";

@injectable()
export class SaveCallbacks implements OnLoad, OnUpdate {
    protected coreConfig: ICoreConfig;

    constructor(
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("ConfigServer") protected configServer: ConfigServer
    ) {
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
    }

    public async onLoad(): Promise<void> {
        this.saveServer.load();
    }

    public getRoute(): string {
        return "aki-save";
    }

    public async onUpdate(secondsSinceLastRun: number): Promise<boolean> {
        // run every 15 seconds
        if (secondsSinceLastRun > this.coreConfig.profileSaveIntervalSeconds) {
            this.saveServer.save();
            return true;
        }

        return false;
    }
}
