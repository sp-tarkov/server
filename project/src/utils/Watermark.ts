import { ProgramStatics } from "@spt/ProgramStatics";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import { LogTextColor } from "@spt/models/spt/logging/LogTextColor";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { LocalisationService } from "@spt/services/LocalisationService";
import { inject, injectable } from "tsyringe";

@injectable()
export class WatermarkLocale {
    protected description: string[];
    protected warning: string[];
    protected modding: string[];

    constructor(@inject("LocalisationService") protected localisationService: LocalisationService) {
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

    public getDescription(): string[] {
        return this.description;
    }

    public getWarning(): string[] {
        return this.warning;
    }

    public getModding(): string[] {
        return this.modding;
    }
}

@injectable()
export class Watermark {
    protected sptConfig: ICoreConfig;
    protected text: string[] = [];
    protected versionLabel = "";

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("WatermarkLocale") protected watermarkLocale: WatermarkLocale,
    ) {
        this.sptConfig = this.configServer.getConfig<ICoreConfig>(ConfigTypes.CORE);
    }

    public initialize(): void {
        const description = this.watermarkLocale.getDescription();
        const warning = this.watermarkLocale.getWarning();
        const modding = this.watermarkLocale.getModding();
        const versionTag = this.getVersionTag();

        this.versionLabel = `${this.sptConfig.projectName} ${versionTag}`;

        this.text = [this.versionLabel];
        this.text = [...this.text, ...description];

        if (ProgramStatics.DEBUG) {
            this.text = this.text.concat([...warning]);
        }
        if (!ProgramStatics.MODS) {
            this.text = this.text.concat([...modding]);
        }

        if (this.sptConfig.customWatermarkLocaleKeys) {
            if (this.sptConfig.customWatermarkLocaleKeys.length > 0) {
                for (const key of this.sptConfig.customWatermarkLocaleKeys) {
                    this.text.push(...["", this.localisationService.getText(key)]);
                }
            }
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
    public getVersionTag(withEftVersion = false): string {
        const sptVersion = ProgramStatics.SPT_VERSION || this.sptConfig.sptVersion;
        const versionTag = ProgramStatics.DEBUG
            ? `${sptVersion} - ${this.localisationService.getText("bleeding_edge_build")}`
            : sptVersion;

        if (withEftVersion) {
            const tarkovVersion = this.sptConfig.compatibleTarkovVersion.split(".").pop();
            return `${versionTag} (${tarkovVersion})`;
        }

        return versionTag;
    }

    /**
     * Handle singleplayer/settings/version
     * Get text shown in game on screen, can't be translated as it breaks bsgs client when certian characters are used
     * @returns string
     */
    public getInGameVersionLabel(): string {
        const sptVersion = ProgramStatics.SPT_VERSION || this.sptConfig.sptVersion;
        const versionTag = ProgramStatics.DEBUG
            ? `${sptVersion} - BLEEDINGEDGE ${ProgramStatics.COMMIT?.slice(0, 6) ?? ""}`
            : `${sptVersion} - ${ProgramStatics.COMMIT?.slice(0, 6) ?? ""}`;

        return `${this.sptConfig.projectName} ${versionTag}`;
    }

    /** Set window title */
    protected setTitle(): void {
        process.title = this.versionLabel;
    }

    /** Reset console cursor to top */
    protected resetCursor(): void {
        if (!ProgramStatics.COMPILED) {
            process.stdout.write("\u001B[2J\u001B[0;0f");
        }
    }

    /** Draw the watermark */
    protected draw(): void {
        const result: string[] = [];

        // Calculate size, add 10% for spacing to the right
        const longestLength =
            this.text.reduce((a, b) => {
                return a.length > b.length ? a : b;
            }).length * 1.1;

        // Create line of - to add top/bottom of watermark
        let line = "";
        for (let i = 0; i < longestLength; ++i) {
            line += "─";
        }

        // Opening line
        result.push(`┌─${line}─┐`);

        // Add content of watermark to screen
        for (const watermarkText of this.text) {
            const spacingSize = longestLength - watermarkText.length;
            let textWithRightPadding = watermarkText;

            for (let i = 0; i < spacingSize; ++i) {
                textWithRightPadding += " ";
            }

            result.push(`│ ${textWithRightPadding} │`);
        }

        // Closing line
        result.push(`└─${line}─┘`);

        // Log watermark to screen
        for (const text of result) {
            this.logger.logWithColor(text, LogTextColor.YELLOW);
        }
    }
}
