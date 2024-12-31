import os from "node:os";
import { Program } from "@spt/Program";
import { OnLoad } from "@spt/di/OnLoad";
import { OnUpdate } from "@spt/di/OnUpdate";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { HttpServer } from "@spt/servers/HttpServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { EncodingUtil } from "@spt/utils/EncodingUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectAll, injectable } from "tsyringe";

@injectable()
export class App {
    protected onUpdateLastRun = {};
    protected coreConfig: ICoreConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("EncodingUtil") protected encodingUtil: EncodingUtil,
        @inject("HttpServer") protected httpServer: HttpServer,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @injectAll("OnLoad") protected onLoadComponents: OnLoad[],
        @injectAll("OnUpdate") protected onUpdateComponents: OnUpdate[],
    ) {
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
    }

    public async load(): Promise<void> {
        // execute onLoad callbacks
        this.logger.info(this.localisationService.getText("executing_startup_callbacks"));

        this.logger.debug(`OS: ${os.arch()} | ${os.version()} | ${process.platform}`);
        this.logger.debug(`CPU: ${os.cpus()[0]?.model} cores: ${os.cpus().length}`);
        this.logger.debug(`RAM: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)}GB`);
        this.logger.debug(`PATH: ${this.encodingUtil.toBase64(process.argv[0])}`);
        this.logger.debug(`PATH: ${this.encodingUtil.toBase64(process.execPath)}`);
        this.logger.debug(`Server: ${Program.SPT_VERSION || this.coreConfig.sptVersion}`);

        if (Program.BUILD_TIME) {
            this.logger.debug(`Date: ${Program.BUILD_TIME}`);
        }

        if (Program.COMMIT) {
            this.logger.debug(`Commit: ${Program.COMMIT}`);
        }

        for (const onLoad of this.onLoadComponents) {
            await onLoad.onLoad();
        }

        setInterval(() => {
            this.update(this.onUpdateComponents);
        }, 5000);
    }

    protected async update(onUpdateComponents: OnUpdate[]): Promise<void> {
        // If the server has failed to start, skip any update calls
        if (!this.httpServer.isStarted() || !this.databaseService.isDatabaseValid()) {
            return;
        }

        for (const updateable of onUpdateComponents) {
            let success = false;
            const lastRunTimeTimestamp = this.onUpdateLastRun[updateable.getRoute()] || 0; // 0 on first load so all update() calls occur on first load
            const secondsSinceLastRun = this.timeUtil.getTimestamp() - lastRunTimeTimestamp;

            try {
                success = await updateable.onUpdate(secondsSinceLastRun);
            } catch (err) {
                this.logUpdateException(err, updateable);
            }

            if (success) {
                this.onUpdateLastRun[updateable.getRoute()] = this.timeUtil.getTimestamp();
            } else {
                /* temporary for debug */
                const warnTime = 20 * 60;

                if (success === void 0 && !(secondsSinceLastRun % warnTime)) {
                    this.logger.debug(
                        this.localisationService.getText("route_onupdate_no_response", updateable.getRoute()),
                    );
                }
            }
        }
    }

    protected logUpdateException(err: any, updateable: OnUpdate): void {
        this.logger.error(this.localisationService.getText("scheduled_event_failed_to_run", updateable.getRoute()));
        if (err.message) {
            this.logger.error(err.message);
        }
        if (err.stack) {
            this.logger.error(err.stack);
        }
    }
}
