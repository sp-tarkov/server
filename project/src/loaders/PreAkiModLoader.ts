import semver from "semver";
import { DependencyContainer, inject, injectable } from "tsyringe";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { IPreAkiLoadMod } from "../models/external/IPreAkiLoadMod";
import { IPreAkiLoadModAsync } from "../models/external/IPreAkiLoadModAsync";
import { ICoreConfig } from "../models/spt/config/ICoreConfig";
import { IModLoader } from "../models/spt/mod/IModLoader";
import { IPackageJsonData } from "../models/spt/mod/IPackageJsonData";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { LocalisationService } from "../services/LocalisationService";
import { ModCompilerService } from "../services/ModCompilerService";
import { JsonUtil } from "../utils/JsonUtil";
import { VFS } from "../utils/VFS";
import { BundleLoader } from "./BundleLoader";
import { ModTypeCheck } from "./ModTypeCheck";

@injectable()
export class PreAkiModLoader implements IModLoader
{
    protected static container: DependencyContainer;

    protected readonly basepath = "user/mods/";
    protected readonly modOrderPath = "user/mods/order.json";
    protected order: Record<string, number> = {};
    protected imported: Record<string, IPackageJsonData> = {};
    protected akiConfig: ICoreConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("VFS") protected vfs: VFS,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("ModCompilerService") protected modCompilerService: ModCompilerService,
        @inject("BundleLoader") protected bundleLoader: BundleLoader,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ModTypeCheck") protected modTypeCheck: ModTypeCheck
    )
    {
        this.akiConfig = this.configServer.getConfig<ICoreConfig>(ConfigTypes.CORE);
    }

    public async load(container: DependencyContainer): Promise<void>
    {
        if (globalThis.G_MODS_ENABLED)
        {
            PreAkiModLoader.container = container;
            await this.importMods();
            await this.executeMods(container);
        }
    }

    /**
     * Returns a list of mods with preserved load order
     * @returns Array of mod names in load order
     */
    public getImportedModsNames(): string[]
    {
        return Object.keys(this.imported);
    }

    public getImportedModDetails(): Record<string, IPackageJsonData>
    {
        return this.imported;
    }

    public getModPath(mod: string): string
    {
        return `${this.basepath}${mod}/`;
    }

    protected async importMods(): Promise<void>
    {
        if (!this.vfs.exists(this.basepath))
        {
            // no mods folder found
            this.logger.info(this.localisationService.getText("modloader-user_mod_folder_missing"));
            this.vfs.createDir(this.basepath);
            return;
        }

        let mods: string[] = this.vfs.getDirs(this.basepath);
        
        this.logger.info(this.localisationService.getText("modloader-loading_mods", mods.length));

        // Mod order
        if (!this.vfs.exists(this.modOrderPath)) 
        {
            this.logger.info(this.localisationService.getText("modloader-mod_order_missing"));

            // Write file with empty order array to disk
            this.vfs.writeFile(this.modOrderPath, this.jsonUtil.serializeAdvanced({order: []}, null, 4));
        }
        else 
        {
            const modOrder = this.vfs.readFile(this.modOrderPath, { encoding: "utf8" });
            try 
            {
                this.jsonUtil.deserialize<any>(modOrder).order.forEach((mod: string, index: number) => 
                {
                    this.order[mod] = index;
                });
            }
            catch (error) 
            {
                this.logger.error(this.localisationService.getText("modloader-mod_order_error"));
            }
        }

        // Used to check all errors before stopping the load execution
        let errorsFound = false;

        // Validate and remove broken mods from mod list
        const brokenMods: string[] = this.getBrokenMods(mods);
        mods = mods.filter( ( mod ) => !brokenMods.includes( mod ) );

        const modPackageData = this.getModsPackageData(mods);
        this.checkForDuplicateMods(modPackageData);
        for (const modFolderName in modPackageData)
        {
            const modToValidate = modPackageData[modFolderName];

            // Returns if any mod dependency is not satisfied
            if (!this.areModDependenciesFulfilled(modToValidate, modPackageData))
            {
                errorsFound = true;
            }

            // Returns if at least two incompatible mods are found
            if (!this.isModCompatible(modToValidate, modPackageData))
            {
                errorsFound = true;
            }

            // Returns if mod isnt compatible with this verison of aki
            if (!this.isModCombatibleWithAki(modToValidate))
            {
                errorsFound = true;
            }
        }

        if (errorsFound)
        {
            this.logger.error(this.localisationService.getText("modloader-no_mods_loaded"));
            return;
        }

        // sort mod order
        const missingFromOrderJSON = {};
        const sortedMods = mods.sort((prev, next) => this.sortMods(prev, next, missingFromOrderJSON));

        // log the missing mods from order.json
        Object.keys(missingFromOrderJSON).forEach((missingMod) => (this.logger.debug(this.localisationService.getText("modloader-mod_order_missing_from_json", missingMod))));

        // add mods
        for (const mod of sortedMods)
        {
            await this.addMod(mod);
        }
    }

    protected sortMods(prev: string, next: string, missingFromOrderJSON: Record<string, boolean>): number
    {
        const previndex = this.order[prev];
        const nextindex = this.order[next];
        
        // mod is not on the list, move the mod to last
        if (previndex === undefined) 
        {
            missingFromOrderJSON[prev] = true;

            return 1;
        }
        else if (nextindex === undefined) 
        {
            missingFromOrderJSON[next] = true;

            return -1;
        }

        return previndex - nextindex;
    }

    /**
     * Check for duplicate mods loaded, show error if any
     * @param modPackageData Dictionary of mod package.json data
     */
    protected checkForDuplicateMods(modPackageData: Record<string, IPackageJsonData>): void
    {
        const modNames = [];
        for (const modKey in modPackageData)
        {
            const mod = modPackageData[modKey];
            modNames.push(`${mod.author}-${mod.name}`);
        }
        const dupes = this.getDuplicates(modNames);
        if (dupes?.length > 0)
        {
            this.logger.error(this.localisationService.getText("modloader-x_duplicates_found", dupes.join(",")));
        }
    }

    /**
     * Check for and return duplicate strings inside an array
     * @param stringArray Array to check for duplicates
     * @returns string array of duplicates, empty if none found
     */
    protected getDuplicates(stringArray: string[]): string[]
    {
        return stringArray.filter((s => v => s.has(v) || !s.add(v))(new Set));
    }

    /**
     * Get an array of mods with errors that prevent them from working with SPT
     * @param mods mods to validate
     * @returns Mod names as array
     */
    protected getBrokenMods(mods: string[]): string[]
    {
        const brokenMods: string[] = [];
        for (const mod of mods)
        {
            if (!this.validMod(mod))
            {
                brokenMods.push(mod);
            }
        }

        return brokenMods;
    }

    /**
     * Get packageJson data for mods
     * @param mods mods to get packageJson for
     * @returns dictionary <modName - package.json>
     */
    protected getModsPackageData(mods: string[]): Record<string, IPackageJsonData>
    {
        const loadedMods: Record<string, IPackageJsonData> = {};
        for (const mod of mods)
        {
            loadedMods[mod] = this.jsonUtil.deserialize(this.vfs.readFile(`${this.getModPath(mod)}/package.json`));
        }

        return loadedMods;
    }


    protected isModCombatibleWithAki(mod: IPackageJsonData): boolean
    {
        const akiVersion = this.akiConfig.akiVersion;
        const modName = `${mod.author}-${mod.name}`;

        // Error and prevent loading If no akiVersion property exists
        if (!mod.akiVersion)
        {
            this.logger.error(this.localisationService.getText("modloader-missing_akiversion_field", modName));
            return false;
        }

        // Error and prevent loading if akiVersion property is not a valid semver string
        if (!(semver.valid(mod.akiVersion) || semver.validRange(mod.akiVersion)))
        {
            this.logger.error(this.localisationService.getText("modloader-invalid_akiversion_field", modName));
            return false;
        }

        // Warn and allow loading if semver is not satisfied
        if (!semver.satisfies(akiVersion, mod.akiVersion))
        {
            this.logger.warning(this.localisationService.getText("modloader-outdated_akiversion_field", modName));
            return true;
        }

        return true;
    }

    protected async executeMods(container: DependencyContainer): Promise<void>
    {
        // sort mods load order
        const source = this.sortModsLoadOrder();

        const promiseLoad = new Array<Promise<void>>();
        // import mod classes
        for (const mod of source)
        {

            if ("main" in this.imported[mod])
            {
                const filepath = `${this.getModPath(mod)}${this.imported[mod].main}`;
                // import class
                const modFilePath = `${process.cwd()}/${filepath}`;

                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const requiredMod = require(modFilePath);

                if (!this.modTypeCheck.isPostV3Compatible(requiredMod.mod))
                {
                    this.logger.error(this.localisationService.getText("modloader-mod_incompatible", mod));
                    delete this.imported[mod];
                    return;
                }

                if (this.modTypeCheck.isPreAkiLoad(requiredMod.mod))
                {
                    (requiredMod.mod as IPreAkiLoadMod).preAkiLoad(container);
                    globalThis[mod] = requiredMod;
                }
                if (this.modTypeCheck.isPreAkiLoadAsync(requiredMod.mod))
                {
                    promiseLoad.push(
                        (requiredMod.mod as IPreAkiLoadModAsync).preAkiLoadAsync(container)
                            .then(() => globalThis[mod] = requiredMod)
                            .catch((err) => this.logger.error(this.localisationService.getText("modloader-async_mod_error", `${err?.message ?? ""}\n${err.stack ?? ""}`)))
                    );
                }
            }
        }
        await Promise.all(promiseLoad);
    }

    public sortModsLoadOrder(): string[]
    {
        // if loadorder.json exists: load it, otherwise generate load order
        if (this.vfs.exists(`${this.basepath}loadorder.json`))
        {
            return this.jsonUtil.deserialize(this.vfs.readFile(`${this.basepath}loadorder.json`));
        }
        else
        {
            return Object.keys(this.getLoadOrder(this.imported));
        }
    }

    protected async addMod(mod: string): Promise<void>
    {
        const modPath = this.getModPath(mod);
        const packageData = this.jsonUtil.deserialize<IPackageJsonData>(this.vfs.readFile(`${modPath}/package.json`));

        const isBundleMod = packageData.isBundleMod ?? false;

        if (isBundleMod)
        {
            this.bundleLoader.addBundles(modPath);
        }

        const typeScriptFiles = this.vfs.getFilesOfType(`${modPath}src`, ".ts");

        if (typeScriptFiles.length > 0)
        {
            if (globalThis.G_MODS_TRANSPILE_TS)
            {
                // compile ts into js if ts files exist and globalThis.G_MODS_TRANSPILE_TS is set to true
                await this.modCompilerService.compileMod(mod, modPath, typeScriptFiles);
            }
            else
            {
                // rename the mod entry point to .ts if it's set to .js because G_MODS_TRANSPILE_TS is set to false
                packageData.main = (packageData.main as string).replace(".js", ".ts");
            }
        }

        // add mod to imported list
        this.imported[mod] = {...packageData, dependencies: packageData.modDependencies};
        this.logger.info(this.localisationService.getText("modloader-loaded_mod", {name: packageData.name, version: packageData.version, author: packageData.author}));
    }

    protected areModDependenciesFulfilled(pkg: IPackageJsonData, loadedMods: Record<string, IPackageJsonData>): boolean
    {
        if (!pkg.modDependencies)
        {
            return true;
        }

        const modName = `${pkg.author}-${pkg.name}`;

        for (const [modDependency, requiredVersion ] of Object.entries(pkg.modDependencies))
        {
            // Raise dependency version incompatible if the dependency is not found in the mod list
            if (!(modDependency in loadedMods))
            {
                this.logger.error(this.localisationService.getText("modloader-missing_dependency", {mod: modName, modDependency: modDependency}));
                return false;
            }

            if (!semver.satisfies(loadedMods[modDependency].version, requiredVersion))
            {
                this.logger.error(this.localisationService.getText("modloader-outdated_dependency", {mod: modName, modDependency: modDependency, currentVersion: loadedMods[modDependency].version, requiredVersion: requiredVersion}));
                return false;
            }
        }

        return true;
    }

    protected isModCompatible(mod: IPackageJsonData, loadedMods: Record<string, IPackageJsonData>): boolean
    {
        const incompatbileModsList = mod.incompatibilities;
        if (!incompatbileModsList)
        {
            return true;
        }

        for (const incompatibleModName of incompatbileModsList)
        {
            // Raise dependency version incompatible if any incompatible mod is found
            if (incompatibleModName in loadedMods)
            {
                this.logger.error(this.localisationService.getText("modloader-incompatible_mod_found", {author: mod.author, modName: mod.name, incompatibleModName: incompatibleModName}));
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
    protected validMod(modName: string): boolean
    {
        const modPath = this.getModPath(modName);

        const modIsCalledBepinEx = modName.toLowerCase() === "bepinex";
        const hasBepinExFolderStructure = this.vfs.exists(`${modPath}/plugins`);
        const containsDll = this.vfs.getFiles(`${modPath}`).find(x => x.includes(".dll"));
        if (modIsCalledBepinEx || hasBepinExFolderStructure || containsDll)
        {
            this.logger.error(this.localisationService.getText("modloader-is_client_mod", modName));
            return false;
        }

        // check if config exists
        if (!this.vfs.exists(`${modPath}/package.json`))
        {
            this.logger.error(this.localisationService.getText("modloader-missing_package_json", modName));
            return false;
        }

        // validate mod
        const config = this.jsonUtil.deserialize<IPackageJsonData>(this.vfs.readFile(`${modPath}/package.json`));
        const checks = ["name", "author", "version", "license"];
        let issue = false;

        for (const check of checks)
        {
            if (!(check in config))
            {
                this.logger.error(this.localisationService.getText("modloader-missing_package_json_property", {modName: modName, prop: check}));
                issue = true;
            }
        }

        if (!semver.valid(config.version))
        {
            this.logger.error(this.localisationService.getText("modloader-invalid_version_property", modName));
            issue = true;
        }

        if ("main" in config)
        {
            if (config.main.split(".").pop() !== "js") // expects js file as entry
            {
                this.logger.error(this.localisationService.getText("modloader-main_property_not_js", modName));
                issue = true;
            }


            if (!this.vfs.exists(`${modPath}/${config.main}`))
            {

                // If TS file exists with same name, dont perform check as we'll generate JS from TS file
                const tsFileName = config.main.replace(".js", ".ts");
                const tsFileExists = this.vfs.exists(`${modPath}/${tsFileName}`);

                if (!tsFileExists)
                {
                    this.logger.error(this.localisationService.getText("modloader-main_property_points_to_nothing", modName));
                    issue = true;
                }
            }
        }

        if (config.incompatibilities && !Array.isArray(config.incompatibilities))
        {
            this.logger.error(this.localisationService.getText("modloader-incompatibilities_not_string_array", modName));
            issue = true;
        }

        return !issue;
    }

    protected getLoadOrderRecursive(mod: string, result: Record<string, string>, visited: Record<string, string>): void
    {
        // validate package
        if (mod in result)
        {
            return;
        }

        if (mod in visited)
        {
            // front: white, back: red
            this.logger.error(this.localisationService.getText("modloader-cyclic_dependency"));

            // additional info
            this.logger.debug(this.localisationService.getText("modloader-checking_mod", mod));
            this.logger.debug(`${this.localisationService.getText("modloader-checked")}:`);
            this.logger.debug(result);
            this.logger.debug(`${this.localisationService.getText("modloader-visited")}:`);
            this.logger.debug(visited);

            // wait for input
            process.exit(1);
        }

        // check dependencies
        const config = this.imported[mod];

        if (typeof config === "undefined")
        {
            this.logger.error(this.localisationService.getText("modloader-missing_dependency"));
            throw new Error(this.localisationService.getText("modloader-error_parsing_mod_load_order"));
        }

        const dependencies: Record<string, string> = config.dependencies || {};

        visited[mod] = config.version;

        for (const dependency in dependencies)
        {
            this.getLoadOrderRecursive(dependency, result, visited);
        }

        delete visited[mod];

        // fully checked package
        result[mod] = config.version;
    }

    protected getLoadOrder(mods: Record<string, IPackageJsonData>): Record<string, string>
    {
        const result: Record<string, string> = {};
        const visited: Record<string, string> = {};

        for (const mod in mods)
        {
            if (mods[mod][0] in result)
            {
                continue;
            }

            this.getLoadOrderRecursive(mod, result, visited);
        }

        return result;
    }

    public getContainer(): DependencyContainer
    {
        if (PreAkiModLoader.container)
        {
            return PreAkiModLoader.container;
        }
        else
        {
            throw new Error(this.localisationService.getText("modloader-dependency_container_not_initalized"));
        }
    }
}