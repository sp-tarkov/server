import sourcemapSupport from "source-map-support";
import { inject, injectable, injectAll } from "tsyringe";

import os from "node:os";
import { OnLoad } from "../di/OnLoad";
import { OnUpdate } from "../di/OnUpdate";
import { ILogger } from "../models/spt/utils/ILogger";
import { LocalisationService } from "../services/LocalisationService";
import { EncodingUtil } from "./EncodingUtil";
import { TimeUtil } from "./TimeUtil";

@injectable()
export class App
{
    protected onUpdateLastRun = {};

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("EncodingUtil") protected encodingUtil: EncodingUtil,
        @injectAll("OnLoad") protected onLoadComponents: OnLoad[],
        @injectAll("OnUpdate") protected onUpdateComponents: OnUpdate[]
    )
    { }

    public async load(): Promise<void>
    {
        // bind callbacks
        sourcemapSupport.install();

        // execute onLoad callbacks
        this.logger.info(this.localisationService.getText("executing_startup_callbacks"));

        this.logger.debug(`OS: ${os.arch()} | ${os.version()} | ${process.platform}`);
        this.logger.debug(`CPU: ${os.cpus()[0]?.model} cores: ${os.cpus().length}`);
        this.logger.debug(`RAM: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)}GB`);
        this.logger.debug(`PATH: ${this.encodingUtil.toBase64(process.argv[0])}`);
        this.logger.debug(`PATH: ${this.encodingUtil.toBase64(process.execPath)}`);

        for (const onLoad of this.onLoadComponents)
        {
            await onLoad.onLoad();
        }

        setInterval(() =>
        {
            this.update(this.onUpdateComponents);
        }, 5000);
    }

    protected async update(onUpdateComponents: OnUpdate[]): Promise<void>
    {
        for (const updateable of onUpdateComponents)
        {
            let success = false;
            const lastRunTimeTimestamp = this.onUpdateLastRun[updateable.getRoute()] || 0; // 0 on first load so all update() calls occur on first load
            const secondsSinceLastRun = this.timeUtil.getTimestamp() - lastRunTimeTimestamp;

            try
            {
                success = await updateable.onUpdate(secondsSinceLastRun);
            }
            catch (err)
            {
                this.logUpdateException(err, updateable);
            }

            if (success)
            {
                this.onUpdateLastRun[updateable.getRoute()] = this.timeUtil.getTimestamp();
            }
            else
            {
                /* temporary for debug */
                const warnTime = 20 * 60;

                if (success === void 0 && !(secondsSinceLastRun % warnTime))
                {
                    this.logger.debug(this.localisationService.getText("route_onupdate_no_response", updateable.getRoute()));
                }
            }
        }
    }

    protected logUpdateException(err: any, updateable: OnUpdate): void
    {
        this.logger.error(this.localisationService.getText("scheduled_event_failed_to_run", updateable.getRoute()));
        if (err.message) 
        {
            this.logger.error(err.message);
        }
        if (err.stack) 
        {
            this.logger.error(err.stack);
        }
    }
}