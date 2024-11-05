import type { ICloner } from "@spt/utils/cloners/ICloner";
import { injectable } from "tsyringe";

@injectable()
export class StructuredCloner implements ICloner {
    public clone<T>(obj: T): T {
        return structuredClone(obj);
    }
}
