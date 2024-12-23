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
            this.logger.debug("Skipping profile backup: Unable to read profiles directory");
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
        const backupPaths = await this.getBackupPaths(backupDir);

        // Filter out invalid backup paths by ensuring they contain a valid date.
        const validBackupPaths = backupPaths.filter((path) => this.extractDateFromFolderName(path) !== null);

        const excessCount = validBackupPaths.length - this.backupConfig.maxBackups;
        if (excessCount > 0) {
            const excessBackups = backupPaths.slice(0, excessCount);
            await this.removeExcessBackups(excessBackups);
        }
    }

    /**
     * Retrieves and sorts the backup file paths from the specified directory.
     *
     * @param dir - The directory to search for backup files.
     * @returns A promise that resolves to an array of sorted backup file paths.
     */
    private async getBackupPaths(dir: string): Promise<string[]> {
        const backups = await fs.readdir(dir);
        return backups.filter((backup) => path.join(dir, backup)).sort(this.compareBackupDates.bind(this));
    }

    /**
     * Compares two backup folder names based on their extracted dates.
     *
     * @param a - The name of the first backup folder.
     * @param b - The name of the second backup folder.
     * @returns The difference in time between the two dates in milliseconds, or `null` if either date is invalid.
     */
    private compareBackupDates(a: string, b: string): number | null {
        const dateA = this.extractDateFromFolderName(a);
        const dateB = this.extractDateFromFolderName(b);

        if (!dateA || !dateB) {
            return null; // Skip comparison if either date is invalid.
        }

        return dateA.getTime() - dateB.getTime();
    }

    /**
     * Extracts a date from a folder name string formatted as `YYYY-MM-DD_hh-mm-ss`.
     *
     * @param folderName - The name of the folder from which to extract the date.
     * @returns A Date object if the folder name is in the correct format, otherwise null.
     */
    private extractDateFromFolderName(folderName: string): Date | null {
        const parts = folderName.split(/[-_]/);
        if (parts.length !== 6) {
            console.warn(`Invalid backup folder name format: ${folderName}`);
            return null;
        }

        const [year, month, day, hour, minute, second] = parts;

        return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    }

    /**
     * Removes excess backups from the backup directory.
     *
     * @param backups - An array of backup file names to be removed.
     * @returns A promise that resolves when all specified backups have been removed.
     */
    private async removeExcessBackups(backups: string[]): Promise<void> {
        const removePromises = backups.map((backupPath) =>
            fs.remove(path.join(this.backupConfig.directory, backupPath)),
        );
        await Promise.all(removePromises);

        removePromises.forEach((_promise, index) => {
            this.logger.debug(`Deleted old profile backup: ${backups[index]}`);
        });
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
