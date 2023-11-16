import { injectable } from "tsyringe";

import { ContextVariable } from "@spt-aki/context/ContextVariable";
import { ContextVariableType } from "@spt-aki/context/ContextVariableType";
import { LinkedList } from "@spt-aki/utils/collections/lists/LinkedList";

@injectable()
export class ApplicationContext
{
    private variables = new Map<ContextVariableType, LinkedList<ContextVariable>>();
    private static holderMaxSize = 10;

    /**
     * Called like:
     *
     * const registerPlayerInfo = this.applicationContext.getLatestValue(ContextVariableType.REGISTER_PLAYER_REQUEST).getValue<IRegisterPlayerRequestData>();
     *
     * const activePlayerSessionId = this.applicationContext.getLatestValue(ContextVariableType.SESSION_ID).getValue<string>();
     *
     * const matchInfo = this.applicationContext.getLatestValue(ContextVariableType.MATCH_INFO).getValue<IStartOfflineRaidRequestData>();
     * @param type
     * @returns
     */
    public getLatestValue(type: ContextVariableType): ContextVariable
    {
        if (this.variables.has(type))
        {
            return this.variables.get(type)?.getTail()?.getValue();
        }

        return undefined;
    }

    public getValues(type: ContextVariableType): ContextVariable[]
    {
        if (this.variables.has(type))
        {
            return this.variables.get(type).toList();
        }

        return undefined;
    }

    public addValue(type: ContextVariableType, value: any): void
    {
        let list: LinkedList<ContextVariable>;
        if (this.variables.has(type))
        {
            list = this.variables.get(type);
        }
        else
        {
            list = new LinkedList<ContextVariable>();
        }

        if (list.getSize() >= ApplicationContext.holderMaxSize)
        {
            list.removeFirst();
        }

        list.add(new ContextVariable(value, type));
        this.variables.set(type, list);
    }
}
