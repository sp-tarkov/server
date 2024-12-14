import path from "node:path";
import { PreSptModLoader } from "@spt/loaders/PreSptModLoader";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IBackupConfig } from "@spt/models/spt/config/IBackupConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import fs from "fs-extra";
import { inject, injectable } from "tsyringe";

@injectable()
export class BackupService {
    protected backupConfig: IBackupConfig;
    protected readonly activeServerMods: string[] = [];
    protected readonly profileDir = "./user/profiles";

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("PreSptModLoader") protected preSptModLoader: PreSptModLoader,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.backupConfig = this.configServer.getConfig(ConfigTypes.BACKUP);
        this.activeServerMods = this.getActiveServerMods();
        this.startBackupInterval();
    }

    /**
     * Initializes the backup process.
     *
     * This method orchestrates the profile backup service. Handles copying profiles to a backup directory and cleaning
     * up old backups if the number exceeds the configured maximum.
     *
     * @returns A promise that resolves when the backup process is complete.
     */
    public async init(): Promise<void> {
        if (!this.isEnabled()) {
            return;
        }

        const targetDir = this.generateBackupTargetDir();

        // Fetch all profiles in the profile directory.
        let currentProfiles: string[] = [];
        try {
            currentProfiles = await this.fetchProfileFiles();
        } catch (error) {
            this.logger.error(`Unable to read profiles directory: ${error.message}`);
            return;
        }

        if (!currentProfiles.length) {
            this.logger.debug("No profiles to backup");
            return;
        }

        try {
            await fs.ensureDir(targetDir);

            // Track write promises.
            const writes: Promise<void>[] = currentProfiles.map((profile) =>
                fs.copy(path.join(this.profileDir, profile), path.join(targetDir, profile)),
            );

            // Write a copy of active mods.
            writes.push(fs.writeJson(path.join(targetDir, "activeMods.json"), this.activeServerMods));

            await Promise.all(writes); // Wait for all writes to complete.
        } catch (error) {
            this.logger.error(`Unable to write to backup profile directory: ${error.message}`);
            return;
        }

        this.logger.debug(`Profile backup created: ${targetDir}`);

        this.cleanBackups();
    }

    /**
     * Fetches the names of all JSON files in the profile directory.
     *
     * This method normalizes the profile directory path and reads all files within it. It then filters the files to
     * include only those with a `.json` extension and returns their names.
     *
     * @returns A promise that resolves to an array of JSON file names.
     */
    protected async fetchProfileFiles(): Promise<string[]> {
        const normalizedProfileDir = path.normalize(this.profileDir);

        try {
            const allFiles = await fs.readdir(normalizedProfileDir);
            return allFiles.filter((file) => path.extname(file).toLowerCase() === ".json");
        } catch (error) {
            return Promise.reject(error);
        }
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
     * Generates a formatted backup date string in the format `YYYY-MM-DD_hh-mm-ss`.
     *
     * @returns The formatted backup date string.
     */
    protected generateBackupDate(): string {
        const now = new Date();
        const [year, month, day, hour, minute, second] = [
            now.getFullYear(),
            now.getMonth() + 1,
            now.getDate(),
            now.getHours(),
            now.getMinutes(),
            now.getSeconds(),
        ].map((num) => num.toString().padStart(2, "0"));

        return `${year}-${month}-${day}_${hour}-${minute}-${second}`;
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
        const excessCount: number = backupPaths.length - this.backupConfig.maxBackups;
        if (excessCount > 0) {
            try {
                const removePromises: Promise<void>[] = backupPaths
                    .slice(0, excessCount)
                    .map((backupPath) => fs.remove(backupPath));

                await Promise.all(removePromises); // Wait for all remove operations to complete.

                removePromises.forEach((_promise, index) => {
                    this.logger.debug(`Deleted old profile backup: ${backupPaths[index]}`);
                });
            } catch (error) {
                this.logger.error(`Failed to delete profile backups: ${error.message}`);
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

        const minutes = this.backupConfig.backupInterval.intervalMinutes * 60 * 1000; // Minutes to milliseconds
        setInterval(() => {
            this.init().catch((error) => this.logger.error(`Profile backup failed: ${error.message}`));
        }, minutes);
    }

    /**
     * Get an array of active server mod details.
     *
     * @returns An array of mod names.
     */
    protected getActiveServerMods(): string[] {
        const result = [];

        const activeMods = this.preSptModLoader.getImportedModDetails();
        for (const activeModKey in activeMods) {
            result.push(
                `${activeModKey}-${activeMods[activeModKey].author ?? "unknown"}-${activeMods[activeModKey].version ?? ""}`,
            );
        }
        return result;
    }
}
