import { RandomUtil } from "@spt/utils/RandomUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";

export class ExhaustableArray<T> implements IExhaustableArray<T> {
    private pool: T[];

    constructor(
        private itemPool: T[],
        private randomUtil: RandomUtil,
        private cloner: ICloner,
    ) {
        this.pool = this.cloner.clone(itemPool);
    }

    public getRandomValue(): T | undefined {
        if (!this.pool?.length) {
            return undefined;
        }

        const index = this.randomUtil.getInt(0, this.pool.length - 1);
        const toReturn = this.cloner.clone(this.pool[index]);
        this.pool.splice(index, 1);
        return toReturn;
    }

    public getFirstValue(): T | undefined {
        if (!this.pool?.length) {
            return undefined;
        }

        const toReturn = this.cloner.clone(this.pool[0]);
        this.pool.splice(0, 1);
        return toReturn;
    }

    public hasValues(): boolean {
        if (this.pool?.length) {
            return true;
        }

        return false;
    }
}

export interface IExhaustableArray<T> {
    getRandomValue(): T | undefined;
    getFirstValue(): T | undefined;
    hasValues(): boolean;
}
