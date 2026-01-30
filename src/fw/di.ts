// Service lifetime types
export const ServiceLifetime = {
  Singleton: 'singleton',
  Transient: 'transient',
} as const;
export type ServiceLifetimeOption = (typeof ServiceLifetime)[keyof typeof ServiceLifetime];

// Base service interface
export interface IService {
  dispose?(): void;
}

// Service descriptor interface
interface ServiceDescriptor<T = unknown> {
  token: symbol;
  implementation: new () => T;
  lifetime: ServiceLifetimeOption;
}

// Main container class
export class ServiceContainer {
  private static instance: ServiceContainer;
  private services = new Map<symbol, ServiceDescriptor>();
  private singletonInstances = new Map<symbol, unknown>();
  private tokenRegistry = new Map<string, symbol>(); // New token registry

  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  // Register a service
  addService<T>(token: symbol, implementation: new (...args: any[]) => T, lifetime: ServiceLifetimeOption) {
    // If a service is re-registered, remove any existing cached singleton instance so
    // tests and runtime can replace implementations without stale instances.
    if (this.singletonInstances.has(token)) {
      const existing = this.singletonInstances.get(token) as IService | undefined;
      try {
        existing?.dispose?.();
      } catch {
        // swallow disposal errors during re-registration
      }
      this.singletonInstances.delete(token);
    }

    this.services.set(token, { token, implementation, lifetime });
  }

  // Retrieve an existing token or create a new one
  getOrCreateToken(service: symbol | string | (new (...args: any[]) => any)): symbol {
    if (typeof service === 'symbol') {
      return service;
    }

    const serviceName = typeof service === 'string' ? service : service?.name;
    if (!serviceName) {
      throw new Error(
        'Cannot derive service name for DI token. Provide a class, string, or symbol.'
      );
    }

    if (!this.tokenRegistry.has(serviceName)) {
      this.tokenRegistry.set(serviceName, Symbol(serviceName));
    }
    return this.tokenRegistry.get(serviceName)!;
  }

  // Get service instance
  getService<T = unknown>(token: symbol): T {
    const descriptor = this.services.get(token) as ServiceDescriptor<T> | undefined;

    if (!descriptor) {
      throw new Error(`Service not registered for token: ${token.toString()}`);
    }

    if (descriptor.lifetime === ServiceLifetime.Singleton) {
      return this.getSingletonInstance(descriptor) as T;
    }

    if (descriptor.lifetime === ServiceLifetime.Transient) {
      return new descriptor.implementation() as T;
    }

    throw new Error(`Unsupported lifetime: ${descriptor.lifetime}`);
  }

  private getSingletonInstance<T>(descriptor: ServiceDescriptor<T>): T {
    if (!this.singletonInstances.has(descriptor.token)) {
      this.singletonInstances.set(descriptor.token, new descriptor.implementation());
    }
    return this.singletonInstances.get(descriptor.token) as T;
  }
}

// Service decorator (similar to @Injectable in Blazor)
export function injectable<T>(lifetime: ServiceLifetimeOption = ServiceLifetime.Singleton) {
  return function (target: new () => T) {
    const container = ServiceContainer.getInstance();
    const token = container.getOrCreateToken(target);
    container.addService(token, target, lifetime);
    return target;
  };
}

// Inject decorator (auto-detects type if not provided)
import 'reflect-metadata';

export function inject<T>(serviceType?: new (...args: any[]) => T) {
  return function (target: object, propertyKey: string | symbol) {
    // If no explicit type, use reflect-metadata to get the property type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const type = serviceType || (Reflect as any).getMetadata('design:type', target, propertyKey);
    if (!type) {
      throw new Error(
        `Cannot resolve type for property '${String(propertyKey)}'. Make sure emitDecoratorMetadata is enabled.`
      );
    }
    const container = ServiceContainer.getInstance();
    const token = container.getOrCreateToken(type);
    const descriptor = {
      get: function (this: object) {
        return container.getService<T>(token);
      },
      enumerable: true,
      configurable: true,
    };
    Object.defineProperty(target, propertyKey, descriptor);
  };
}
