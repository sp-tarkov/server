import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class ProbabilityHelper {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
    ) {}

    /**
     * Chance to roll a number out of 100
     * @param chance Percentage chance roll should success
     * @param scale scale of chance to allow support of numbers > 1-100
     * @returns true if success
     */
    public rollChance(chance: number, scale = 1): boolean {
        return this.randomUtil.getInt(1, 100 * scale) / (1 * scale) <= chance;
    }
}
