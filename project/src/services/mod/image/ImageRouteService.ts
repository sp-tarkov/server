export class ImageRouteService {
    protected routes: Record<string, string> = {};

    public addRoute(urlKey: string, route: string): void {
        this.routes[urlKey] = route;
    }

    public getByKey(urlKey: string): string {
        return this.routes[urlKey];
    }

    public existsByKey(urlKey: string): boolean {
        return this.routes[urlKey] !== undefined;
    }
}
