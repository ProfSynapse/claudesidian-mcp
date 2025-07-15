/**
 * Service factory interface following Abstract Factory Pattern
 */
export interface IServiceFactory<T> {
    create(dependencies: Map<string, any>): Promise<T>;
    getRequiredDependencies(): string[];
}

/**
 * Factory registry for different service types
 */
export interface IServiceFactoryRegistry {
    register<T>(serviceName: string, factory: IServiceFactory<T>): void;
    getFactory<T>(serviceName: string): IServiceFactory<T> | null;
    hasFactory(serviceName: string): boolean;
}

/**
 * Abstract base factory for common service creation patterns
 */
export abstract class BaseServiceFactory<T> implements IServiceFactory<T> {
    protected requiredDependencies: string[] = [];

    abstract create(dependencies: Map<string, any>): Promise<T>;
    
    getRequiredDependencies(): string[] {
        return [...this.requiredDependencies];
    }

    protected getDependency<D>(dependencies: Map<string, any>, name: string): D {
        const dependency = dependencies.get(name);
        if (!dependency) {
            throw new Error(`Required dependency '${name}' not found`);
        }
        return dependency;
    }
}