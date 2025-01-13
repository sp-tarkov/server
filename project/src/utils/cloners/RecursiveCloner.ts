import type { ICloner } from "@spt/utils/cloners/ICloner";
import { injectable } from "tsyringe";

@injectable()
export class RecursiveCloner implements ICloner {
    private static primitives = new Set<string>([
        "string",
        "number",
        "boolean",
        "bigint",
        "symbol",
        "undefined",
        "null",
    ]);

    public clone<T>(obj: T): T {
        // if null or undefined return it as is
        if (obj === null || obj === undefined) return obj;
        const typeOfObj = typeof obj;
        // no need to clone these types, they are primitives
        if (RecursiveCloner.primitives.has(typeOfObj)) {
            return obj;
        }
        // clone the object types
        if (typeOfObj === "object") {
            if (Array.isArray(obj)) {
                const objArr = obj as Array<any>;
                return objArr.map((v) => this.clone(v)) as T;
            }

            const newObj = {};
            for (const propOf1 in obj) {
                // If the value of the original property is null, ensure the cloned value is also null
                // This fixes an issue where null arrays were incorrectly being converted to empty objects
                if (obj[propOf1] === null || obj[propOf1] === undefined) {
                    newObj[propOf1.toString()] = obj[propOf1];
                    continue;
                }

                newObj[propOf1.toString()] = this.clone(obj[propOf1]);
            }
            return newObj as T;
        }

        throw new Error(`Cant clone ${JSON.stringify(obj)}`);
    }

    public async cloneAsync<T>(obj: T): Promise<T> {
        // if null or undefined return it as is
        if (obj === null || obj === undefined) return obj;

        const typeOfObj = typeof obj;

        // no need to clone these types, they are primitives
        if (RecursiveCloner.primitives.has(typeOfObj)) {
            return obj;
        }

        // clone the object types
        if (typeOfObj === "object") {
            if (Array.isArray(obj)) {
                const objArr = obj as Array<T>;
                const clonedArray = await Promise.all(objArr.map((v) => this.cloneAsync(v)));
                return clonedArray as T;
            }

            const newObj: Record<string, T> = {};
            const clonePromises = Object.keys(obj).map((key) => {
                const value = (obj as Record<string, T>)[key];
                // Assign values to `newObj` with this.clone, assigning values to `newObj` causes locks with the debugger attached if cloneAsync is used.
                newObj[key] = this.clone(value);
            });

            await Promise.all(clonePromises);
            return newObj as T;
        }

        // Handle unsupported types
        throw new Error(`Cannot clone ${JSON.stringify(obj)}`);
    }
}
