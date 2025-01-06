import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class InMemoryCacheService {
    protected cacheData: Record<string, any> = {};

    constructor(@inject("PrimaryCloner") protected cloner: ICloner) {}

    /**
     * Store data into an in-memory object
     * @param key key to store data against
     * @param dataToCache - Data to store in cache
     */
    public storeByKey(key: string, dataToCache: any): void {
        this.cacheData[key] = this.cloner.clone(dataToCache);
    }

    /**
     * Retreve data stored by a key
     * @param key key
     * @returns Stored data
     */
    public getDataByKey<T>(key: string): any | undefined {
        if (this.cacheData[key]) {
            return <T>this.cacheData[key];
        }

        return undefined;
    }

    /**
     * Does data exists against the provided key
     * @param key Key to check for data against
     * @returns true if exists
     */
    public hasStoredDataByKey(key: string): boolean {
        if (this.cacheData[key]) {
            return true;
        }

        return false;
    }

    /**
     * Remove data stored against key
     * @param key Key to remove data against
     */
    public clearDataStoredByKey(key: string): void {
        delete this.cacheData[key];
    }
}
