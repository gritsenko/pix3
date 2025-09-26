// Service lifetime types
export const ServiceLifetime = {
    Singleton: 'singleton',
    Transient: 'transient'
} as const;
export type ServiceLifetimeOption = (typeof ServiceLifetime)[keyof typeof ServiceLifetime];

// Service descriptor interface
interface ServiceDescriptor {
    token: symbol;
    implementation: new () => any;
    lifetime: ServiceLifetimeOption;
}

// Main container class
export class ServiceContainer {
    private static instance: ServiceContainer;
    private services = new Map<symbol, ServiceDescriptor>();
    private singletonInstances = new Map<symbol, any>();
    private tokenRegistry = new Map<string, symbol>();  // New token registry

    static getInstance(): ServiceContainer {
        if (!ServiceContainer.instance) {
            ServiceContainer.instance = new ServiceContainer();
        }
        return ServiceContainer.instance;
    }

    // Register a service
    addService(token: symbol, implementation: new () => any, lifetime: ServiceLifetimeOption) {
        this.services.set(token, { token, implementation, lifetime });
    }

    // Retrieve an existing token or create a new one
    getOrCreateToken(service: any): symbol {
        if (typeof service === 'symbol') {
            return service;
        }

        const serviceName = typeof service === 'string' ? service : service?.name;
        if (!serviceName) {
            throw new Error('Cannot derive service name for DI token. Provide a class, string, or symbol.');
        }

        if (!this.tokenRegistry.has(serviceName)) {
            this.tokenRegistry.set(serviceName, Symbol(serviceName));
        }
        return this.tokenRegistry.get(serviceName)!;
    }

    // Get service instance
    getService(token: symbol): any {
        const descriptor = this.services.get(token);

        if (!descriptor) {
            throw new Error(`Service not registered for token: ${token.toString()}`);
        }

        if (descriptor.lifetime === ServiceLifetime.Singleton) {
            return this.getSingletonInstance(descriptor);
        }

        if (descriptor.lifetime === ServiceLifetime.Transient) {
            return new descriptor.implementation();
        }

        throw new Error(`Unsupported lifetime: ${descriptor.lifetime}`);
    }

    private getSingletonInstance(descriptor: ServiceDescriptor): any {
        if (!this.singletonInstances.has(descriptor.token)) {
            this.singletonInstances.set(descriptor.token, new descriptor.implementation());
        }
        return this.singletonInstances.get(descriptor.token);
    }
}

// Service decorator (similar to @Injectable in Blazor)
export function injectable(lifetime: ServiceLifetimeOption = ServiceLifetime.Singleton) {
    return function (target: any) {
        const container = ServiceContainer.getInstance();
        const token = container.getOrCreateToken(target);
        container.addService(token, target, lifetime);
        return target;
    };
}

// Inject decorator (auto-detects type if not provided)
import "reflect-metadata";

export function inject(serviceType?: any) {
    return function (target: any, propertyKey: string) {
        // If no explicit type, use reflect-metadata to get the property type
    const type = serviceType || (Reflect as any).getMetadata("design:type", target, propertyKey);
        if (!type) {
            throw new Error(`Cannot resolve type for property '${propertyKey}'. Make sure emitDecoratorMetadata is enabled.`);
        }
        const container = ServiceContainer.getInstance();
        const token = container.getOrCreateToken(type);
        const descriptor = {
            get: function (this: any) {
                return container.getService(token);
            },
            enumerable: true,
            configurable: true
        };
        Object.defineProperty(target, propertyKey, descriptor);
    };
}