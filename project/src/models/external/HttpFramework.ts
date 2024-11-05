import { IncomingMessage, ServerResponse } from "node:http";
import { HttpMethods } from "@spt/servers/http/HttpMethods";
import { injectable } from "tsyringe";

export type HandleFn = (_: string, req: IncomingMessage, resp: ServerResponse) => void;

/**
 *  Associates handlers, HTTP methods and a base url to a listener using a proxy
 *  @param basePath The base path
 *  @returns The decorator that create the listener proxy
 */
export const Listen = (basePath: string) => {
    return <T extends { new (...args: any[]): any }>(Base: T): T => {
        // Used for the base class to be able to use DI
        injectable()(Base);
        return class extends Base {
            // Record of each handler per HTTP method and path
            handlers: Partial<Record<HttpMethods, Record<string, HandleFn>>>;

            constructor(...args: any[]) {
                super(...args);
                this.handlers = {};

                // Retrieve all handlers
                const handlersArray = Base.prototype.handlers;
                if (!handlersArray) {
                    return;
                }

                // Add each flagged handler to the Record
                for (const { handlerName, path, httpMethod } of handlersArray) {
                    if (!this.handlers[httpMethod]) {
                        this.handlers[httpMethod] = {};
                    }

                    if (this[handlerName] !== undefined && typeof this[handlerName] === "function") {
                        if (!path || path === "") {
                            this.handlers[httpMethod][`/${basePath}`] = this[handlerName];
                        }
                        this.handlers[httpMethod][`/${basePath}/${path}`] = this[handlerName];
                    }
                }

                // Cleanup the handlers list
                Base.prototype.handlers = [];
            }

            // The canHandle method is used to check if the Listener handles a request
            // Based on both the HTTP method and the route
            canHandle = (_: string, req: IncomingMessage): boolean => {
                const routesHandles = this.handlers[req.method];

                return (
                    Object.keys(this.handlers).some((meth) => meth === req.method) &&
                    Object.keys(routesHandles).some((route) => new RegExp(route).test(req.url))
                );
            };

            // The actual handle method dispatches the request to the registered handlers
            handle = (sessionID: string, req: IncomingMessage, resp: ServerResponse): void => {
                if (Object.keys(this.handlers).length === 0) {
                    return;
                }

                // Get all routes for the HTTP method and sort them so that
                // The more precise is selected (eg. "/test/A" is selected over "/test")
                const routesHandles = this.handlers[req.method];
                const route = req.url;
                const routes = Object.keys(routesHandles);
                routes.sort((routeA, routeB) => routeB.length - routeA.length);

                // Filter to select valid routes but only use the first element since it's the most precise
                const validRoutes = routes.filter((handlerKey) => new RegExp(handlerKey).test(route));
                if (validRoutes.length > 0) {
                    routesHandles[validRoutes[0]](sessionID, req, resp);
                }
            };
        };
    };
};

/**
 *  Internally used to create HTTP decorators.
 *  @param httpMethod The HTTP method to create the decorator for
 *  @returns The decorator
 */
const createHttpDecorator = (httpMethod: HttpMethods) => {
    // The handler path (ignoring the base path)
    return (path = "") => {
        return (target: any, propertyKey: string) => {
            // If the handlers array has not been initialized yet
            if (!target.handlers) {
                target.handlers = [];
            }

            // Flag the method as a HTTP handler
            target.handlers.push({ handlerName: propertyKey, path, httpMethod });
        };
    };
};

/**
 *  HTTP DELETE decorator
 */
export const Delete = createHttpDecorator(HttpMethods.DELETE);

/**
 *  HTTP GET decorator
 */
export const Get = createHttpDecorator(HttpMethods.GET);

/**
 *  HTTP OPTIONS decorator
 */
export const Options = createHttpDecorator(HttpMethods.OPTIONS);

/**
 *  HTTP PATCH decorator
 */
export const Patch = createHttpDecorator(HttpMethods.PATCH);

/**
 *  HTTP POST decorator
 */
export const Post = createHttpDecorator(HttpMethods.POST);

/**
 *  HTTP PUT decorator
 */
export const Put = createHttpDecorator(HttpMethods.PUT);
