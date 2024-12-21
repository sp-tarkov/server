import type { OnUpdateMod } from "@spt/services/mod/onUpdate/OnUpdateMod";
import type { DependencyContainer } from "tsyringe";
import { injectable } from "tsyringe";

@injectable()
export class OnUpdateModService {
    constructor(protected container: DependencyContainer) {}

    public registerOnUpdate(
        name: string,
        onUpdate: (timeSinceLastRun: number) => boolean,
        getRoute: () => string,
    ): void {
        this.container.register(name, { useValue: new OnUpdateMod(onUpdate, getRoute) });
        this.container.registerType("OnUpdate", name);
    }
}
