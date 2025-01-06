import { OnLoadMod } from "@spt/services/mod/onLoad/OnLoadMod";
import { type DependencyContainer, injectable } from "tsyringe";

@injectable()
export class OnLoadModService {
    constructor(protected container: DependencyContainer) {}

    public registerOnLoad(name: string, onLoad: () => void, getRoute: () => string): void {
        this.container.register(name, { useValue: new OnLoadMod(onLoad, getRoute) });
        this.container.registerType("OnLoad", name);
    }
}
