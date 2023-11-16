import { DependencyContainer, injectable } from "tsyringe";

import { OnLoadMod } from "@spt-aki/services/mod/onLoad/OnLoadMod";

@injectable()
export class OnLoadModService
{
    constructor(protected container: DependencyContainer)
    {}

    public registerOnLoad(name: string, onLoad: () => void, getRoute: () => string): void
    {
        this.container.register(name, { useValue: new OnLoadMod(onLoad, getRoute) });
        this.container.registerType("OnLoad", name);
    }
}
