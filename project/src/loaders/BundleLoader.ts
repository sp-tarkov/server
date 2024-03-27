import path from "node:path";
import { inject, injectable } from "tsyringe";

import { HttpServerHelper } from "@spt-aki/helpers/HttpServerHelper";
import { BundleHashCacheService } from "@spt-aki/services/cache/BundleHashCacheService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { VFS } from "@spt-aki/utils/VFS";

export class BundleInfo
{
    modpath: string;
    filename: string;
    crc: number;
    dependencies: string[];

    constructor(modpath: string, bundle: BundleManifestEntry, bundleHash: number)
    {
        this.modpath = modpath;
        this.filename = bundle.key;
        this.crc = bundleHash;
        this.dependencies = bundle.dependencyKeys || [];
    }
}

@injectable()
export class BundleLoader
{
    protected bundles: Record<string, BundleInfo> = {};

    constructor(
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("VFS") protected vfs: VFS,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("BundleHashCacheService") protected bundleHashCacheService: BundleHashCacheService,
    )
    {}

    /**
     * Handle singleplayer/bundles
     */
    public getBundles(): BundleInfo[]
    {
        const result: BundleInfo[] = [];

        for (const bundle in this.bundles)
        {
            result.push(this.getBundle(bundle));
        }

        return result;
    }

    public getBundle(key: string): BundleInfo
    {
        return this.jsonUtil.clone(this.bundles[key]);
    }

    public addBundles(modpath: string): void
    {
        const bundleManifestArr =
            this.jsonUtil.deserialize<BundleManifest>(this.vfs.readFile(`${modpath}bundles.json`)).manifest;

        for (const bundleManifest of bundleManifestArr)
        {
            const absoluteModPath = path.join(process.cwd(), modpath).slice(0, -1).replace(/\\/g, "/");
            const bundleLocalPath = `${modpath}bundles/${bundleManifest.key}`.replace(/\\/g, "/");

            if (!this.bundleHashCacheService.calculateAndMatchHash(bundleLocalPath))
            {
                this.bundleHashCacheService.calculateAndStoreHash(bundleLocalPath);
            }

            const bundleHash = this.bundleHashCacheService.getStoredValue(bundleLocalPath);

            this.addBundle(bundleManifest.key, new BundleInfo(absoluteModPath, bundleManifest, bundleHash));
        }
    }

    public addBundle(key: string, b: BundleInfo): void
    {
        this.bundles[key] = b;
    }
}

export interface BundleManifest
{
    manifest: BundleManifestEntry[];
}

export interface BundleManifestEntry
{
    key: string;
    dependencyKeys: string[];
}
