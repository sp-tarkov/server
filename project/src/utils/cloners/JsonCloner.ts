import type { ICloner } from "@spt/utils/cloners/ICloner";
import { injectable } from "tsyringe";

@injectable()
export class JsonCloner implements ICloner {
    public clone<T>(obj: T): T {
        return JSON.parse(JSON.stringify(obj));
    }
}
