import { SaveLoadRouter } from "@spt/di/Router";
import { ISptProfile, Info } from "@spt/models/eft/profile/ISptProfile";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { LocalisationService } from "@spt/services/LocalisationService";
import { FileSystem } from "@spt/utils/FileSystem";
import { HashUtil } from "@spt/utils/HashUtil";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { Timer } from "@spt/utils/Timer";
import { inject, injectAll, injectable } from "tsyringe";

@injectable()
export class SaveServer {
    protected profileFilepath = "user/profiles/";
    protected profiles: Map<string, ISptProfile> = new Map();
    protected onBeforeSaveCallbacks: Map<string, (profile: ISptProfile) => Promise<ISptProfile>> = new Map();
    protected saveSHA1: { [key: string]: string } = {};

    constructor(
        @inject("FileSystem") protected fileSystem: FileSystem,
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
    public addBeforeSaveCallback(id: string, callback: (profile: ISptProfile) => Promise<ISptProfile>): void {
        this.onBeforeSaveCallbacks.set(id, callback);
    }

    /**
     * Remove a callback from being executed prior to saving profile in SaveServer.saveProfile()
     * @param id Id of callback to remove
     */
    public removeBeforeSaveCallback(id: string): void {
        this.onBeforeSaveCallbacks.delete(id);
    }

    /**
     * Load all profiles in /user/profiles folder into memory (this.profiles)
     * @returns A promise that resolves when loading all profiles is completed.
     */
    public async load(): Promise<void> {
        await this.fileSystem.ensureDir(this.profileFilepath);

        // get files to load
        const files = await this.fileSystem.getFiles(this.profileFilepath, false, ["json"]);

        // load profiles
        const timer = new Timer();
        for (const file of files) {
            await this.loadProfile(FileSystem.getFileName(file));
        }
        this.logger.debug(
            `Loading ${files.length} profile${files.length > 1 ? "s" : ""} took ${timer.getTime("ms")}ms`,
        );
    }

    /**
     * Save changes for each profile from memory into user/profiles json
     * @returns A promise that resolves when saving all profiles is completed.
     */
    public async save(): Promise<void> {
        const timer = new Timer();
        for (const sessionID in this.profiles) {
            await this.saveProfile(sessionID);
        }
        const profileCount = this.profiles.size;
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

        const profile = this.profiles.get(sessionId);

        if (!profile) {
            throw new Error(`no profile found for sessionId: ${sessionId}`);
        }

        return profile;
    }

    public profileExists(id: string): boolean {
        return !!this.profiles.get(id);
    }

    /**
     * Gets all profiles from memory
     * @returns Dictionary of ISptProfile
     */
    public getProfiles(): Record<string, ISptProfile> {
        return Object.fromEntries(this.profiles);
    }

    /**
     * Delete a profile by id (Does not remove the profile file!)
     * @param sessionID Id of profile to remove
     * @returns true when deleted, false when profile not found
     */
    public deleteProfileById(sessionID: string): boolean {
        if (this.profiles.get(sessionID)) {
            this.profiles.delete(sessionID);
            return true;
        }

        return false;
    }

    /**
     * Create a new profile in memory with empty pmc/scav objects
     * @param profileInfo Basic profile data
     */
    public createProfile(profileInfo: Info): void {
        if (this.profiles.get(profileInfo.id)) {
            throw new Error(`profile already exists for sessionId: ${profileInfo.id}`);
        }

        this.profiles.set(profileInfo.id, {
            info: profileInfo,
            characters: { pmc: {}, scav: {} },
        } as ISptProfile); // Cast to ISptProfile so the errors of having empty pmc and scav data disappear
    }

    /**
     * Add full profile in memory by key (info.id)
     * @param profileDetails Profile to save
     */
    public addProfile(profileDetails: ISptProfile): void {
        this.profiles.set(profileDetails.info.id, profileDetails);
    }

    /**
     * Look up profile json in user/profiles by id and store in memory
     * Execute saveLoadRouters callbacks after being loaded into memory
     * @param sessionID Id of profile to store in memory
     * @returns A promise that resolves when loading is completed.
     */
    public async loadProfile(sessionID: string): Promise<void> {
        const filename = `${sessionID}.json`;
        const filePath = `${this.profileFilepath}${filename}`;
        if (await this.fileSystem.exists(filePath)) {
            // File found, store in profiles[]
            this.profiles.set(sessionID, await this.fileSystem.readJson(filePath));
        }

        // Run callbacks
        for (const callback of this.saveLoadRouters) {
            this.profiles.set(sessionID, await callback.handleLoad(this.getProfile(sessionID)));
        }
    }

    /**
     * Save changes from in-memory profile to user/profiles json
     * Execute onBeforeSaveCallbacks callbacks prior to being saved to json
     * @param sessionID profile id (user/profiles/id.json)
     * @returns A promise that resolves when saving is completed.
     */
    public async saveProfile(sessionID: string): Promise<void> {
        if (!this.profiles.get(sessionID)) {
            throw new Error(`Profile ${sessionID} does not exist! Unable to save this profile!`);
        }

        const filePath = `${this.profileFilepath}${sessionID}.json`;

        // Run pre-save callbacks before we save into json
        for (const [id, callback] of this.onBeforeSaveCallbacks) {
            const previous = this.profiles.get(sessionID) as ISptProfile; // Cast as ISptProfile here since there should be no reason we're getting an undefined profile
            try {
                this.profiles.set(sessionID, await callback(this.profiles.get(sessionID) as ISptProfile)); // Cast as ISptProfile here since there should be no reason we're getting an undefined profile
            } catch (error) {
                this.logger.error(this.localisationService.getText("profile_save_callback_error", { callback, error }));
                this.profiles.set(sessionID, previous);
            }
        }

        const jsonProfile = this.jsonUtil.serialize(
            this.profiles.get(sessionID),
            !this.configServer.getConfig<ICoreConfig>(ConfigTypes.CORE).features.compressProfile,
        );
        const sha1 = await this.hashUtil.generateSha1ForDataAsync(jsonProfile);
        if (typeof this.saveSHA1[sessionID] !== "string" || this.saveSHA1[sessionID] !== sha1) {
            this.saveSHA1[sessionID] = sha1;
            // save profile to disk
            await this.fileSystem.write(filePath, jsonProfile);
        }
    }

    /**
     * Remove a physical profile json from user/profiles
     * @param sessionID Profile id to remove
     * @returns A promise that is true if the file no longer exists
     */
    public async removeProfile(sessionID: string): Promise<boolean> {
        const file = `${this.profileFilepath}${sessionID}.json`;

        this.profiles.delete(sessionID);

        await this.fileSystem.remove(file);

        return !this.fileSystem.exists(file);
    }
}
