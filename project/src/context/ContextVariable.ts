import { ContextVariableType } from "@spt/context/ContextVariableType";

export class ContextVariable {
    private value: any;
    private timestamp: Date;
    private type: ContextVariableType;

    constructor(value: any, type: ContextVariableType) {
        this.value = value;
        this.timestamp = new Date();
        this.type = type;
    }

    public getValue<T>(): T {
        return this.value;
    }

    public getTimestamp(): Date {
        return this.timestamp;
    }

    public getType(): ContextVariableType {
        return this.type;
    }
}
