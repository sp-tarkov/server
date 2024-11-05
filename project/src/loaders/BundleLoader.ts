import path from "node:path";
import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import { BundleHashCacheService } from "@spt/services/cache/BundleHashCacheService";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { VFS } from "@spt/utils/VFS";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

export class BundleInfo {
    modpath: string;
    filename: string;
    crc: number;
    dependencies: string[];

    constructor(modpath: string, bundle: IBundleManifestEntry, bundleHash: number) {
        this.modpath = modpath;
        this.filename = bundle.key;
        this.crc = bundleHash;
        this.dependencies = bundle.dependencyKeys || [];
    }
}

@injectable()
export class BundleLoader {
    protected bundles: Record<string, BundleInfo> = {};

    constructor(
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("VFS") protected vfs: VFS,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("BundleHashCacheService") protected bundleHashCacheService: BundleHashCacheService,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {}

    /**
     * Handle singleplayer/bundles
     */
    public getBundles(): BundleInfo[] {
        const result: BundleInfo[] = [];

        for (const bundle in this.bundles) {
            result.push(this.getBundle(bundle));
        }

        return result;
    }

    public getBundle(key: string): BundleInfo {
        return this.cloner.clone(this.bundles[key]);
    }

    public addBundles(modpath: string): void {
        const bundleManifestArr = this.jsonUtil.deserialize<IBundleManifest>(
            this.vfs.readFile(`${modpath}bundles.json`),
        ).manifest;

        for (const bundleManifest of bundleManifestArr) {
            const relativeModPath = modpath.slice(0, -1).replace(/\\/g, "/");
            const bundleLocalPath = `${modpath}bundles/${bundleManifest.key}`.replace(/\\/g, "/");

            if (!this.bundleHashCacheService.calculateAndMatchHash(bundleLocalPath)) {
                this.bundleHashCacheService.calculateAndStoreHash(bundleLocalPath);
            }

            const bundleHash = this.bundleHashCacheService.getStoredValue(bundleLocalPath);

            this.addBundle(bundleManifest.key, new BundleInfo(relativeModPath, bundleManifest, bundleHash));
        }
    }

    public addBundle(key: string, b: BundleInfo): void {
        this.bundles[key] = b;
    }
}

export interface IBundleManifest {
    manifest: IBundleManifestEntry[];
}

export interface IBundleManifestEntry {
    key: string;
    dependencyKeys: string[];
}
