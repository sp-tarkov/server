import { inject, injectable } from "tsyringe";

import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { ICoreConfig } from "@spt-aki/models/spt/config/ICoreConfig";
import { LogTextColor } from "@spt-aki/models/spt/logging/LogTextColor";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";

@injectable()
export class WatermarkLocale
{
    protected description: string[];
    protected warning: string[];
    protected modding: string[];

    constructor(@inject("LocalisationService") protected localisationService: LocalisationService)
    {
        this.description = [
            this.localisationService.getText("watermark-discord_url"),
            "",
            this.localisationService.getText("watermark-free_of_charge"),
            this.localisationService.getText("watermark-paid_scammed"),
            this.localisationService.getText("watermark-commercial_use_prohibited"),
        ];
        this.warning = [
            "",
            this.localisationService.getText("watermark-testing_build"),
            this.localisationService.getText("watermark-no_support"),
            "",
            `${this.localisationService.getText("watermark-report_issues_to")}:`,
            this.localisationService.getText("watermark-issue_tracker_url"),
            "",
            this.localisationService.getText("watermark-use_at_own_risk"),
        ];
        this.modding = [
            "",
            this.localisationService.getText("watermark-modding_disabled"),
            "",
            this.localisationService.getText("watermark-not_an_issue"),
            this.localisationService.getText("watermark-do_not_report"),
        ];
    }

    public getDescription(): string[]
    {
        return this.description;
    }

    public getWarning(): string[]
    {
        return this.warning;
    }

    public getModding(): string[]
    {
        return this.modding;
    }
}

@injectable()
export class Watermark
{
    protected akiConfig: ICoreConfig;
    protected text: string[] = [];
    protected versionLabel = "";

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("WatermarkLocale") protected watermarkLocale?: WatermarkLocale,
    )
    {
        this.akiConfig = this.configServer.getConfig<ICoreConfig>(ConfigTypes.CORE);
    }

    public initialize(): void
    {
        const description = this.watermarkLocale.getDescription();
        const warning = this.watermarkLocale.getWarning();
        const modding = this.watermarkLocale.getModding();
        const versionTag = this.getVersionTag();

        this.versionLabel = `${this.akiConfig.projectName} ${versionTag}`;

        this.text = [this.versionLabel];
        this.text = [...this.text, ...description];

        if (globalThis.G_DEBUG_CONFIGURATION)
        {
            this.text = this.text.concat([...warning]);
        }
        if (!globalThis.G_MODS_ENABLED)
        {
            this.text = this.text.concat([...modding]);
        }

        this.setTitle();
        this.resetCursor();
        this.draw();
    }

    /**
     * Get a version string (x.x.x) or (x.x.x-BLEEDINGEDGE) OR (X.X.X (18xxx))
     * @param withEftVersion Include the eft version this spt version was made for
     * @returns string
     */
    public getVersionTag(withEftVersion = false): string
    {
        const versionTag = (globalThis.G_DEBUG_CONFIGURATION)
            ? `${this.akiConfig.akiVersion} - ${this.localisationService.getText("bleeding_edge_build")}`
            : this.akiConfig.akiVersion;

        if (withEftVersion)
        {
            const tarkovVersion = this.akiConfig.compatibleTarkovVersion.split(".").pop();
            return `${versionTag} (${tarkovVersion})`;
        }

        return versionTag;
    }

    /**
     * Handle singleplayer/settings/version
     * Get text shown in game on screen, can't be translated as it breaks bsgs client when certian characters are used
     * @returns string
     */
    public getInGameVersionLabel(): string
    {
        const versionTag = (globalThis.G_DEBUG_CONFIGURATION)
            ? `${this.akiConfig.akiVersion} - BLEEDINGEDGE ${this.akiConfig.commit?.slice(0, 6) ?? ""}`
            : `${this.akiConfig.akiVersion} - ${this.akiConfig.commit?.slice(0, 6) ?? ""}`;

        return `${this.akiConfig.projectName} ${versionTag}`;
    }

    /** Set window title */
    protected setTitle(): void
    {
        process.title = this.versionLabel;
    }

    /** Reset console cursor to top */
    protected resetCursor(): void
    {
        process.stdout.write("\u001B[2J\u001B[0;0f");
    }

    /** Draw the watermark */
    protected draw(): void
    {
        const result = [];

        // calculate size
        const longestLength = this.text.reduce((a, b) =>
        {
            const a2 = String(a).replace(/[\u0391-\uFFE5]/g, "ab");
            const b2 = String(b).replace(/[\u0391-\uFFE5]/g, "ab");
            return a2.length > b2.length ? a2 : b2;
        }).length;

        // get top-bottom line
        let line = "";

        for (let i = 0; i < longestLength; ++i)
        {
            line += "─";
        }

        // get watermark to draw
        result.push(`┌─${line}─┐`);

        for (const text of this.text)
        {
            const spacingSize = longestLength - this.textLength(text);
            let spacingText = text;

            for (let i = 0; i < spacingSize; ++i)
            {
                spacingText += " ";
            }

            result.push(`│ ${spacingText} │`);
        }

        result.push(`└─${line}─┘`);

        // draw the watermark
        for (const text of result)
        {
            this.logger.logWithColor(text, LogTextColor.YELLOW);
        }
    }

    /** Caculate text length */
    protected textLength(s: string): number
    {
        return String(s).replace(/[\u0391-\uFFE5]/g, "ab").length;
    }
}
