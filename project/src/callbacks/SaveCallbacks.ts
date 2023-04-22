import { inject, injectable } from "tsyringe";

import { OnLoad } from "../di/OnLoad";
import { OnUpdate } from "../di/OnUpdate";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { ICoreConfig } from "../models/spt/config/ICoreConfig";
import { ConfigServer } from "../servers/ConfigServer";
import { SaveServer } from "../servers/SaveServer";

@injectable()
export class SaveCallbacks implements OnLoad, OnUpdate
{
    protected coreConfig: ICoreConfig;

    constructor(
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
    }
    
    public async onLoad(): Promise<void>
    {
        this.saveServer.load();
    }

    public getRoute(): string 
    {
        return "aki-save";
    }

    public async onUpdate(secondsSinceLastRun: number): Promise<boolean>
    {
        // run every 15 seconds
        if (secondsSinceLastRun > this.coreConfig.profileSaveIntervalSeconds)
        {
            this.saveServer.save();
            return true;
        }

        return false;
    }
}