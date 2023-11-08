import { injectable } from "tsyringe";

@injectable()
export class UtilityHelper {
    public arrayIntersect<T>(a: T[], b: T[]): T[] {
        return a.filter((x) => b.includes(x));
    }
}
