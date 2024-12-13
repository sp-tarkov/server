import { OnLoad } from "@spt/di/OnLoad";
import { OnUpdate } from "@spt/di/OnUpdate";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { BackupService } from "@spt/services/BackupService";
import { inject, injectable } from "tsyringe";

@injectable()
export class SaveCallbacks implements OnLoad, OnUpdate {
    protected coreConfig: ICoreConfig;

    constructor(
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("BackupService") protected backupService: BackupService,
    ) {
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
    }

    public async onLoad(): Promise<void> {
        this.backupService.init();
        this.saveServer.load();
    }

    public getRoute(): string {
        return "spt-save";
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
