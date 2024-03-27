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

    constructor(modpath: string, bundle: any, crc: number)
    {
        this.modpath = modpath;
        this.filename = bundle.key;
        this.crc = crc;                 // client-side cache validation
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
        const bundle = structuredClone(this.bundles[key]);
        return bundle;
    }

    public addBundles(modpath: string): void
    {
        const manifest =
            this.jsonUtil.deserialize<BundleManifest>(this.vfs.readFile(`${modpath}bundles.json`)).manifest;

        for (const bundle of manifest)
        {
            const filepath = `${modpath}bundles/${bundle.key}`.replace(/\\/g, "/");

            if (!this.bundleHashCacheService.calculateAndMatchHash(filepath))
            {
                this.bundleHashCacheService.calculateAndStoreHash(filepath);
            }

            const hash = this.bundleHashCacheService.getStoredValue(filepath);

            this.addBundle(bundle.key, new BundleInfo(modpath, bundle, hash));
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
    path: string;
}
