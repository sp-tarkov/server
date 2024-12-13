import path from "node:path";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IBackupConfig } from "@spt/models/spt/config/IBackupConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import fs from "fs-extra";
import { inject, injectable } from "tsyringe";

@injectable()
export class BackupService {
    protected backupConfig: IBackupConfig;
    protected readonly profileDir = "./user/profiles";

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.backupConfig = this.configServer.getConfig(ConfigTypes.BACKUP);
        this.startBackupInterval();
    }

    /**
     * Create a backup of all user profiles.
     */
    public async init(): Promise<void> {
        if (!this.isEnabled()) {
            return;
        }

        const targetDir = this.generateBackupTargetDir();

        let currentProfiles: string[] = [];
        try {
            currentProfiles = await fs.readdir(this.profileDir);
            // Ensure only JSON files are being backed up
            currentProfiles = currentProfiles.filter((profileName: string) => profileName.endsWith(".json"));
        } catch (error) {
            this.logger.error(`Unable to read profiles directory: ${error.message}`);
            return;
        }

        if (!currentProfiles.length) {
            this.logger.debug("No profiles to backup");
            return;
        }

        try {
            await fs.copy(this.profileDir, targetDir);
        } catch (error) {
            this.logger.error(`Unable to write to backup profile directory: ${error.message}`);
            return;
        }

        this.logger.debug(`Profile backup created: ${targetDir}`);

        await this.cleanBackups();
    }

    /**
     * Check to see if the backup service is enabled via the config.
     *
     * @returns True if enabled, false otherwise.
     */
    protected isEnabled(): boolean {
        if (!this.backupConfig.enabled) {
            this.logger.debug("Profile backups disabled");
            return false;
        }
        return true;
    }

    /**
     * Generates the target directory path for the backup. The directory path is constructed using the `directory` from
     * the configuration and the current backup date.
     *
     * @returns The target directory path for the backup.
     */
    protected generateBackupTargetDir(): string {
        const backupDate = this.generateBackupDate();
        return path.normalize(`${this.backupConfig.directory}/${backupDate}`);
    }

    /**
     * Generates a formatted backup date string based on the current date and time. The format is defined by the
     * `backupConfig.dateFormat` property.
     *
     * @returns The formatted backup date string.
     */
    protected generateBackupDate(): string {
        const now = new Date();
        return this.backupConfig.dateFormat
            .toUpperCase()
            .replace("YYYY", now.getFullYear().toString())
            .replace("MM", String(now.getMonth() + 1).padStart(2, "0"))
            .replace("DD", String(now.getDate()).padStart(2, "0"))
            .replace("HH", String(now.getHours()).padStart(2, "0"))
            .replace("MM", String(now.getMinutes()).padStart(2, "0"))
            .replace("SS", String(now.getSeconds()).padStart(2, "0"));
    }

    /**
     * Cleans up old backups in the backup directory.
     *
     * This method reads the backup directory, and sorts backups by modification time. If the number of backups exceeds
     * the configured maximum, it deletes the oldest backups.
     *
     * @returns A promise that resolves when the cleanup is complete.
     */
    protected async cleanBackups(): Promise<void> {
        const backupDir = this.backupConfig.directory;

        let backups: string[] = [];
        try {
            backups = await fs.readdir(backupDir);
        } catch (error) {
            this.logger.error(`Unable to read backup directory: ${error.message}`);
            return;
        }

        // Filter directories and sort by modification time.
        const backupPaths = backups
            .map((backup) => path.join(backupDir, backup))
            .filter((backupPath) => fs.statSync(backupPath).isDirectory())
            .sort((a, b) => {
                const aTime = fs.statSync(a).mtimeMs;
                const bTime = fs.statSync(b).mtimeMs;
                return aTime - bTime; // Oldest first
            });

        // Remove oldest backups if the number exceeds the configured maximum.
        const excessCount = backupPaths.length - this.backupConfig.maxBackups;
        if (excessCount > 0) {
            for (let i = 0; i < excessCount; i++) {
                try {
                    await fs.remove(backupPaths[i]);
                    this.logger.debug(`Deleted old profile backup: ${backupPaths[i]}`);
                } catch (error) {
                    this.logger.error(`Failed to delete profile backup: ${backupPaths[i]} - ${error.message}`);
                }
            }
        }
    }

    /**
     * Start the backup interval if enabled in the configuration.
     */
    protected startBackupInterval(): void {
        if (!this.backupConfig.backupInterval.enabled) {
            return;
        }

        const minutes = this.backupConfig.backupInterval.intervalMinutes * 60 * 1000; // minutes to milliseconds
        setInterval(() => {
            this.init().catch((error) => this.logger.error(`Profile backup failed: ${error.message}`));
        }, minutes);
    }
}
