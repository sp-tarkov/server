import path from "node:path";
import { ProgramStatics } from "@spt/ProgramStatics";
import { ModLoadOrder } from "@spt/loaders/ModLoadOrder";
import { ModTypeCheck } from "@spt/loaders/ModTypeCheck";
import { IModDetails } from "@spt/models/eft/profile/ISptProfile";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod";
import { IPreSptLoadModAsync } from "@spt/models/external/IPreSptLoadModAsync";
import { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import { IModLoader } from "@spt/models/spt/mod/IModLoader";
import { IPackageJsonData } from "@spt/models/spt/mod/IPackageJsonData";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { LocalisationService } from "@spt/services/LocalisationService";
import { ModCompilerService } from "@spt/services/ModCompilerService";
import { FileSystemSync } from "@spt/utils/FileSystemSync";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { maxSatisfying, satisfies, valid, validRange } from "semver";
import { DependencyContainer, inject, injectable } from "tsyringe";

@injectable()
export class PreSptModLoader implements IModLoader {
    protected container: DependencyContainer;

    protected readonly basepath = "user/mods/";
    protected readonly modOrderPath = "user/mods/order.json";
    protected order: Record<string, number> = {};
    protected imported: Record<string, IPackageJsonData> = {};
    protected sptConfig: ICoreConfig;
    protected serverDependencies: Record<string, string>;
    protected skippedMods: Set<string>;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("FileSystemSync") protected fileSystemSync: FileSystemSync,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("ModCompilerService") protected modCompilerService: ModCompilerService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ModLoadOrder") protected modLoadOrder: ModLoadOrder,
        @inject("ModTypeCheck") protected modTypeCheck: ModTypeCheck,
    ) {
        this.sptConfig = this.configServer.getConfig<ICoreConfig>(ConfigTypes.CORE);

        const packageJsonPath: string = path.join(__dirname, "../../package.json");
        this.serverDependencies = this.fileSystemSync.readJson(packageJsonPath)?.dependencies;
        this.skippedMods = new Set();
    }

    public async load(container: DependencyContainer): Promise<void> {
        if (ProgramStatics.MODS) {
            this.container = container;
            await this.importModsAsync();
            await this.executeModsAsync();
        }
    }

    /**
     * Returns a list of mods with preserved load order
     * @returns Array of mod names in load order
     */
    public getImportedModsNames(): string[] {
        return Object.keys(this.imported);
    }

    public getImportedModDetails(): Record<string, IPackageJsonData> {
        return this.imported;
    }

    public getProfileModsGroupedByModName(profileMods: IModDetails[]): IModDetails[] {
        // Group all mods used by profile by name
        const modsGroupedByName: Record<string, IModDetails[]> = {};
        for (const mod of profileMods) {
            if (!modsGroupedByName[mod.name]) {
                modsGroupedByName[mod.name] = [];
            }

            modsGroupedByName[mod.name].push(mod);
        }

        // Find the highest versioned mod and add to results array
        const result = [];
        for (const modName in modsGroupedByName) {
            const modDatas = modsGroupedByName[modName];
            const modVersions = modDatas.map((x) => x.version);
            const highestVersion = maxSatisfying(modVersions, "*");

            const chosenVersion = modDatas.find((x) => x.name === modName && x.version === highestVersion);
            if (!chosenVersion) {
                continue;
            }

            result.push(chosenVersion);
        }

        return result;
    }

    public getModPath(mod: string): string {
        return `${this.basepath}${mod}/`;
    }

    protected async importModsAsync(): Promise<void> {
        if (!this.fileSystemSync.exists(this.basepath)) {
            // no mods folder found
            this.logger.info(this.localisationService.getText("modloader-user_mod_folder_missing"));
            this.fileSystemSync.ensureDir(this.basepath);
            return;
        }

        /**
         * array of mod folder names
         */
        const mods: string[] = this.fileSystemSync.getDirectories(this.basepath);

        this.logger.info(this.localisationService.getText("modloader-loading_mods", mods.length));

        // Mod order
        if (!this.fileSystemSync.exists(this.modOrderPath)) {
            this.logger.info(this.localisationService.getText("modloader-mod_order_missing"));

            // Write file with empty order array to disk
            this.fileSystemSync.writeJson(this.modOrderPath, { order: [] });
        } else {
            const modOrder = this.fileSystemSync.read(this.modOrderPath);
            try {
                const modOrderArray = this.jsonUtil.deserialize<any>(modOrder, this.modOrderPath).order;
                for (const [index, mod] of modOrderArray.entries()) {
                    this.order[mod] = index;
                }
            } catch (error) {
                this.logger.error(this.localisationService.getText("modloader-mod_order_error"));
            }
        }

        // Validate and remove broken mods from mod list
        const validMods = this.getValidMods(mods);

        const modPackageData = this.getModsPackageData(validMods);
        this.checkForDuplicateMods(modPackageData);

        // Used to check all errors before stopping the load execution
        let errorsFound = false;

        for (const [modFolderName, modToValidate] of modPackageData) {
            if (this.shouldSkipMod(modToValidate)) {
                // skip error checking and dependency install for mods already marked as skipped.
                continue;
            }

            // Returns if any mod dependency is not satisfied
            if (!this.areModDependenciesFulfilled(modToValidate, modPackageData)) {
                errorsFound = true;
            }

            // Returns if at least two incompatible mods are found
            if (!this.isModCompatible(modToValidate, modPackageData)) {
                errorsFound = true;
            }

            // Returns if mod isnt compatible with this verison of spt
            if (!this.isModCombatibleWithSpt(modToValidate)) {
                errorsFound = true;
            }
        }

        if (errorsFound) {
            this.logger.error(this.localisationService.getText("modloader-no_mods_loaded"));
            return;
        }

        // sort mod order
        const missingFromOrderJSON = {};
        validMods.sort((prev, next) => this.sortMods(prev, next, missingFromOrderJSON));

        // log the missing mods from order.json
        for (const missingMod of Object.keys(missingFromOrderJSON)) {
            this.logger.debug(this.localisationService.getText("modloader-mod_order_missing_from_json", missingMod));
        }

        // add mods
        for (const mod of validMods) {
            const pkg = modPackageData.get(mod);

            if (this.shouldSkipMod(pkg)) {
                this.logger.warning(this.localisationService.getText("modloader-skipped_mod", { mod: mod }));
                continue;
            }

            await this.addModAsync(mod, pkg);
        }

        const sortedModLoadOrder = this.modLoadOrder.setModList(this.imported);

        for (const [, modConfig] of sortedModLoadOrder) {
            this.logger.info(
                this.localisationService.getText("modloader-loaded_mod", {
                    name: modConfig.name,
                    version: modConfig.version,
                    author: modConfig.author,
                }),
            );
        }
    }

    protected sortMods(prev: string, next: string, missingFromOrderJSON: Record<string, boolean>): number {
        const previndex = this.order[prev];
        const nextindex = this.order[next];

        // mod is not on the list, move the mod to last
        if (previndex === undefined) {
            missingFromOrderJSON[prev] = true;

            return 1;
        }

        if (nextindex === undefined) {
            missingFromOrderJSON[next] = true;

            return -1;
        }

        return previndex - nextindex;
    }

    /**
     * Check for duplicate mods loaded, show error if any
     * @param modPackageData map of mod package.json data
     */
    protected checkForDuplicateMods(modPackageData: Map<string, IPackageJsonData>): void {
        const grouppedMods: Map<string, IPackageJsonData[]> = new Map();

        for (const mod of modPackageData.values()) {
            const name = `${mod.author}-${mod.name}`;
            grouppedMods.set(name, [...(grouppedMods.get(name) ?? []), mod]);

            // if there's more than one entry for a given mod it means there's at least 2 mods with the same author and name trying to load.
            if (grouppedMods.get(name).length > 1 && !this.skippedMods.has(name)) {
                this.skippedMods.add(name);
            }
        }

        // at this point this.skippedMods only contains mods that are duplicated, so we can just go through every single entry and log it
        for (const modName of this.skippedMods) {
            this.logger.error(this.localisationService.getText("modloader-x_duplicates_found", modName));
        }
    }

    /**
     * Returns an array of valid mods.
     *
     * @param mods mods to validate
     * @returns array of mod folder names
     */
    protected getValidMods(mods: string[]): string[] {
        const validMods: string[] = [];

        for (const mod of mods) {
            if (this.validMod(mod)) {
                validMods.push(mod);
            }
        }

        return validMods;
    }

    /**
     * Get packageJson data for mods
     * @param mods mods to get packageJson for
     * @returns map <modFolderName - package.json>
     */
    protected getModsPackageData(mods: string[]): Map<string, IPackageJsonData> {
        const loadedMods = new Map<string, IPackageJsonData>();

        for (const mod of mods) {
            loadedMods.set(mod, this.fileSystemSync.readJson(`${this.getModPath(mod)}/package.json`));
        }

        return loadedMods;
    }

    /**
     * Is the passed in mod compatible with the running server version
     * @param mod Mod to check compatibiltiy with SPT
     * @returns True if compatible
     */
    protected isModCombatibleWithSpt(mod: IPackageJsonData): boolean {
        const sptVersion = ProgramStatics.SPT_VERSION || this.sptConfig.sptVersion;
        const modName = `${mod.author}-${mod.name}`;

        // Error and prevent loading If no sptVersion property exists
        if (!mod.sptVersion) {
            this.logger.error(this.localisationService.getText("modloader-missing_sptversion_field", modName));

            return false;
        }

        // Error and prevent loading if sptVersion property is not a valid semver string
        if (!(valid(mod.sptVersion) || validRange(mod.sptVersion))) {
            this.logger.error(this.localisationService.getText("modloader-invalid_sptversion_field", modName));

            return false;
        }

        // Warning and allow loading if semver is not satisfied
        if (!satisfies(sptVersion, mod.sptVersion)) {
            this.logger.error(
                this.localisationService.getText("modloader-outdated_sptversion_field", {
                    modName: modName,
                    modVersion: mod.version,
                    desiredSptVersion: mod.sptVersion,
                }),
            );

            return false;
        }

        return true;
    }

    /**
     * Execute each mod found in this.imported
     * @returns void promise
     */
    protected async executeModsAsync(): Promise<void> {
        // Sort mods load order
        const source = this.sortModsLoadOrder();

        // Import mod classes
        for (const mod of source) {
            if (!this.imported[mod].main) {
                this.logger.error(this.localisationService.getText("modloader-mod_has_no_main_property", mod));

                continue;
            }

            const filepath = `${this.getModPath(mod)}${this.imported[mod].main}`;
            // Import class
            const modFilePath = `${process.cwd()}/${filepath}`;

            const requiredMod = require(modFilePath);

            if (!this.modTypeCheck.isPostV3Compatible(requiredMod.mod)) {
                this.logger.error(this.localisationService.getText("modloader-mod_incompatible", mod));
                delete this.imported[mod];

                return;
            }

            // Perform async load of mod
            if (this.modTypeCheck.isPreSptLoadAsync(requiredMod.mod)) {
                try {
                    await (requiredMod.mod as IPreSptLoadModAsync).preSptLoadAsync(this.container);
                    globalThis[mod] = requiredMod;
                } catch (err) {
                    this.logger.error(
                        this.localisationService.getText(
                            "modloader-async_mod_error",
                            `${err?.message ?? ""}\n${err.stack ?? ""}`,
                        ),
                    );
                }

                continue;
            }

            // Perform sync load of mod
            if (this.modTypeCheck.isPreSptLoad(requiredMod.mod)) {
                (requiredMod.mod as IPreSptLoadMod).preSptLoad(this.container);
                globalThis[mod] = requiredMod;
            }
        }
    }

    /**
     * Read loadorder.json (create if doesnt exist) and return sorted list of mods
     * @returns string array of sorted mod names
     */
    public sortModsLoadOrder(): string[] {
        // if loadorder.json exists: load it, otherwise generate load order
        const loadOrderPath = `${this.basepath}loadorder.json`;
        if (this.fileSystemSync.exists(loadOrderPath)) {
            return this.fileSystemSync.readJson(loadOrderPath);
        }

        return this.modLoadOrder.getLoadOrder();
    }

    /**
     * Compile mod and add into class property "imported"
     * @param mod Name of mod to compile/add
     */
    protected async addModAsync(mod: string, pkg: IPackageJsonData): Promise<void> {
        const modPath = this.getModPath(mod);

        const typeScriptFiles = this.fileSystemSync.getFiles(`${modPath}src`, true, ["ts"], true);

        if (typeScriptFiles.length > 0) {
            if (ProgramStatics.COMPILED) {
                // compile ts into js if ts files exist and the program is compiled
                await this.modCompilerService.compileMod(mod, modPath, typeScriptFiles);
            } else {
                // rename the mod entry point to .ts if it's set to .js because G_MODS_TRANSPILE_TS is set to false
                pkg.main = pkg.main.replace(".js", ".ts");
            }
        }

        // Purge scripts data from package object
        pkg.scripts = {};

        // Add mod to imported list
        this.imported[mod] = { ...pkg, dependencies: pkg.modDependencies };
    }

    /**
     * Checks if a given mod should be loaded or skipped.
     *
     * @param pkg mod package.json data
     * @returns
     */
    protected shouldSkipMod(pkg: IPackageJsonData): boolean {
        return this.skippedMods.has(`${pkg.author}-${pkg.name}`);
    }

    protected areModDependenciesFulfilled(pkg: IPackageJsonData, loadedMods: Map<string, IPackageJsonData>): boolean {
        if (!pkg.modDependencies) {
            return true;
        }

        const modName = `${pkg.author}-${pkg.name}`;

        for (const [modDependency, requiredVersion] of Object.entries(pkg.modDependencies)) {
            // Raise dependency version incompatible if the dependency is not found in the mod list
            if (!loadedMods.has(modDependency)) {
                this.logger.error(
                    this.localisationService.getText("modloader-missing_dependency", {
                        mod: modName,
                        modDependency: modDependency,
                    }),
                );
                return false;
            }

            if (!satisfies(loadedMods.get(modDependency).version, requiredVersion)) {
                this.logger.error(
                    this.localisationService.getText("modloader-outdated_dependency", {
                        mod: modName,
                        modDependency: modDependency,
                        currentVersion: loadedMods.get(modDependency).version,
                        requiredVersion: requiredVersion,
                    }),
                );
                return false;
            }
        }

        return true;
    }

    protected isModCompatible(mod: IPackageJsonData, loadedMods: Map<string, IPackageJsonData>): boolean {
        const incompatbileModsList = mod.incompatibilities;
        if (!incompatbileModsList) {
            return true;
        }

        for (const incompatibleModName of incompatbileModsList) {
            // Raise dependency version incompatible if any incompatible mod is found
            if (loadedMods.has(incompatibleModName)) {
                this.logger.error(
                    this.localisationService.getText("modloader-incompatible_mod_found", {
                        author: mod.author,
                        name: mod.name,
                        incompatibleModName: incompatibleModName,
                    }),
                );
                return false;
            }
        }

        return true;
    }

    /**
     * Validate a mod passes a number of checks
     * @param modName name of mod in /mods/ to validate
     * @returns true if valid
     */
    protected validMod(modName: string): boolean {
        const modPath = this.getModPath(modName);

        const modIsCalledBepinEx = modName.toLowerCase() === "bepinex";
        const modIsCalledUser = modName.toLowerCase() === "user";
        const modIsCalledSrc = modName.toLowerCase() === "src";
        const modIsCalledDb = modName.toLowerCase() === "db";
        const hasBepinExFolderStructure = this.fileSystemSync.exists(`${modPath}/plugins`);
        const containsDll = this.fileSystemSync.getFiles(`${modPath}`, true, ["dll"]).length > 0;

        if (modIsCalledSrc || modIsCalledDb || modIsCalledUser) {
            this.logger.error(this.localisationService.getText("modloader-not_correct_mod_folder", modName));
            return false;
        }

        if (modIsCalledBepinEx || hasBepinExFolderStructure || containsDll) {
            this.logger.error(this.localisationService.getText("modloader-is_client_mod", modName));
            return false;
        }

        // Check if config exists
        const modPackagePath = `${modPath}/package.json`;
        if (!this.fileSystemSync.exists(modPackagePath)) {
            this.logger.error(this.localisationService.getText("modloader-missing_package_json", modName));
            return false;
        }

        // Validate mod
        const config = this.fileSystemSync.readJson(modPackagePath) as IPackageJsonData;
        const checks = ["name", "author", "version", "license"];
        let issue = false;

        for (const check of checks) {
            if (!(check in config)) {
                this.logger.error(
                    this.localisationService.getText("modloader-missing_package_json_property", {
                        modName: modName,
                        prop: check,
                    }),
                );
                issue = true;
            }
        }

        if (!valid(config.version)) {
            this.logger.error(this.localisationService.getText("modloader-invalid_version_property", modName));
            issue = true;
        }

        if ("main" in config) {
            if (config.main.split(".").pop() !== "js") {
                // expects js file as entry
                this.logger.error(this.localisationService.getText("modloader-main_property_not_js", modName));
                issue = true;
            }

            if (!this.fileSystemSync.exists(`${modPath}/${config.main}`)) {
                // If TS file exists with same name, dont perform check as we'll generate JS from TS file
                const tsFileName = config.main.replace(".js", ".ts");
                const tsFileExists = this.fileSystemSync.exists(`${modPath}/${tsFileName}`);

                if (!tsFileExists) {
                    this.logger.error(
                        this.localisationService.getText("modloader-main_property_points_to_nothing", modName),
                    );
                    issue = true;
                }
            }
        }

        if (config.incompatibilities && !Array.isArray(config.incompatibilities)) {
            this.logger.error(
                this.localisationService.getText("modloader-incompatibilities_not_string_array", modName),
            );
            issue = true;
        }

        return !issue;
    }

    public getContainer(): DependencyContainer {
        if (this.container) {
            return this.container;
        }

        throw new Error(this.localisationService.getText("modloader-dependency_container_not_initalized"));
    }
}
