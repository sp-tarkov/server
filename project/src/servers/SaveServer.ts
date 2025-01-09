import { SaveLoadRouter } from "@spt/di/Router";
import { ISptProfile, Info } from "@spt/models/eft/profile/ISptProfile";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { LocalisationService } from "@spt/services/LocalisationService";
import { FileSystemSync } from "@spt/utils/FileSystemSync";
import { HashUtil } from "@spt/utils/HashUtil";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { Timer } from "@spt/utils/Timer";
import { inject, injectAll, injectable } from "tsyringe";

@injectable()
export class SaveServer {
    protected profileFilepath = "user/profiles/";
    protected profiles = {};
    // onLoad = require("../bindings/SaveLoad");
    protected onBeforeSaveCallbacks = {};
    protected saveMd5 = {};

    constructor(
        @inject("FileSystemSync") protected fileSystemSync: FileSystemSync,
        @injectAll("SaveLoadRouter") protected saveLoadRouters: SaveLoadRouter[],
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {}

    /**
     * Add callback to occur prior to saving profile changes
     * @param id Id for save callback
     * @param callback Callback to execute prior to running SaveServer.saveProfile()
     */
    public addBeforeSaveCallback(id: string, callback: (profile: Partial<ISptProfile>) => Partial<ISptProfile>): void {
        this.onBeforeSaveCallbacks[id] = callback;
    }

    /**
     * Remove a callback from being executed prior to saving profile in SaveServer.saveProfile()
     * @param id Id of callback to remove
     */
    public removeBeforeSaveCallback(id: string): void {
        this.onBeforeSaveCallbacks[id] = undefined;
    }

    /**
     * Load all profiles in /user/profiles folder into memory (this.profiles)
     */
    public load(): void {
        this.fileSystemSync.ensureDir(this.profileFilepath);

        // get files to load
        const files = this.fileSystemSync.getFiles(this.profileFilepath, false, ["json"]);

        // load profiles
        const timer = new Timer();
        for (const file of files) {
            this.loadProfile(FileSystemSync.getFileName(file));
        }
        this.logger.debug(
            `Loading ${files.length} profile${files.length > 1 ? "s" : ""} took ${timer.getTime("ms")}ms`,
        );
    }

    /**
     * Save changes for each profile from memory into user/profiles json
     */
    public save(): void {
        const timer = new Timer();
        for (const sessionID in this.profiles) {
            this.saveProfile(sessionID);
        }
        const profileCount = Object.keys(this.profiles).length;
        this.logger.debug(
            `Saving ${profileCount} profile${profileCount > 1 ? "s" : ""} took ${timer.getTime("ms")}ms`,
            false,
        );
    }

    /**
     * Get a player profile from memory
     * @param sessionId Session id
     * @returns ISptProfile
     */
    public getProfile(sessionId: string): ISptProfile {
        if (!sessionId) {
            throw new Error("session id provided was empty, did you restart the server while the game was running?");
        }

        if (!this.profiles) {
            throw new Error(`no profiles found in saveServer with id: ${sessionId}`);
        }

        if (!this.profiles[sessionId]) {
            throw new Error(`no profile found for sessionId: ${sessionId}`);
        }

        return this.profiles[sessionId];
    }

    public profileExists(id: string): boolean {
        return !!this.profiles[id];
    }

    /**
     * Get all profiles from memory
     * @returns Dictionary of ISptProfile
     */
    public getProfiles(): Record<string, ISptProfile> {
        return this.profiles;
    }

    /**
     * Delete a profile by id
     * @param sessionID Id of profile to remove
     * @returns true when deleted, false when profile not found
     */
    public deleteProfileById(sessionID: string): boolean {
        if (this.profiles[sessionID]) {
            delete this.profiles[sessionID];
            return true;
        }

        return false;
    }

    /**
     * Create a new profile in memory with empty pmc/scav objects
     * @param profileInfo Basic profile data
     */
    public createProfile(profileInfo: Info): void {
        if (this.profiles[profileInfo.id]) {
            throw new Error(`profile already exists for sessionId: ${profileInfo.id}`);
        }

        this.profiles[profileInfo.id] = { info: profileInfo, characters: { pmc: {}, scav: {} } };
    }

    /**
     * Add full profile in memory by key (info.id)
     * @param profileDetails Profile to save
     */
    public addProfile(profileDetails: ISptProfile): void {
        this.profiles[profileDetails.info.id] = profileDetails;
    }

    /**
     * Look up profile json in user/profiles by id and store in memory
     * Execute saveLoadRouters callbacks after being loaded into memory
     * @param sessionID Id of profile to store in memory
     */
    public loadProfile(sessionID: string): void {
        const filename = `${sessionID}.json`;
        const filePath = `${this.profileFilepath}${filename}`;
        if (this.fileSystemSync.exists(filePath)) {
            // File found, store in profiles[]
            this.profiles[sessionID] = this.fileSystemSync.readJson(filePath);
        }

        // Run callbacks
        for (const callback of this.saveLoadRouters) {
            this.profiles[sessionID] = callback.handleLoad(this.getProfile(sessionID));
        }
    }

    /**
     * Save changes from in-memory profile to user/profiles json
     * Execute onBeforeSaveCallbacks callbacks prior to being saved to json
     * @param sessionID profile id (user/profiles/id.json)
     * @returns void
     */
    public saveProfile(sessionID: string): void {
        const filePath = `${this.profileFilepath}${sessionID}.json`;

        // Run pre-save callbacks before we save into json
        for (const callback in this.onBeforeSaveCallbacks) {
            const previous = this.profiles[sessionID];
            try {
                this.profiles[sessionID] = this.onBeforeSaveCallbacks[callback](this.profiles[sessionID]);
            } catch (error) {
                this.logger.error(this.localisationService.getText("profile_save_callback_error", { callback, error }));
                this.profiles[sessionID] = previous;
            }
        }

        const jsonProfile = this.jsonUtil.serialize(
            this.profiles[sessionID],
            !this.configServer.getConfig<ICoreConfig>(ConfigTypes.CORE).features.compressProfile,
        );
        const fmd5 = this.hashUtil.generateMd5ForData(jsonProfile);
        if (typeof this.saveMd5[sessionID] !== "string" || this.saveMd5[sessionID] !== fmd5) {
            this.saveMd5[sessionID] = String(fmd5);
            // save profile to disk
            this.fileSystemSync.write(filePath, jsonProfile);
        }
    }

    /**
     * Remove a physical profile json from user/profiles
     * @param sessionID Profile id to remove
     * @returns true if file no longer exists
     */
    public removeProfile(sessionID: string): boolean {
        const file = `${this.profileFilepath}${sessionID}.json`;

        delete this.profiles[sessionID];

        this.fileSystemSync.remove(file);

        return !this.fileSystemSync.exists(file);
    }
}
