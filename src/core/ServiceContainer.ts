/**
 * ServiceContainer - Simple dependency injection container
 * Location: src/core/ServiceContainer.ts
 * 
 * This service replaces the complex service registries and initialization coordination
 * with a simple, predictable dependency injection pattern. It provides clean service
 * lifecycle management and proper dependency resolution.
 * 
 * Key features:
 * - Simple factory-based service registration
 * - Singleton and transient service support
 * - Dependency injection with type safety
 * - Circular dependency detection
 * - Clean cleanup and lifecycle management
 * 
 * Used by:
 * - Enhanced Plugin main class for service coordination
 * - Service initialization and dependency resolution
 * - Clean service lifecycle management
 * - Service cleanup during plugin unload
 */

export type ServiceFactory<T> = (dependencies: Record<string, any>) => T | Promise<T>;

export interface ServiceRegistration<T> {
  factory: ServiceFactory<T>;
  singleton: boolean;
  dependencies?: string[];
}

export interface ServiceMetadata {
  name: string;
  singleton: boolean;
  initialized: boolean;
  dependencies: string[];
  dependents: string[];
}

/**
 * Simple dependency injection container
 * Replaces complex service registries
 */
export class ServiceContainer {
  private services = new Map<string, any>();
  private factories = new Map<string, ServiceRegistration<any>>();
  private initializationStack: string[] = [];
  private dependencyGraph = new Map<string, Set<string>>();

  /**
   * Register service factory with optional dependencies
   */
  register<T>(
    name: string, 
    factory: ServiceFactory<T>, 
    options: {
      singleton?: boolean;
      dependencies?: string[];
    } = {}
  ): void {
    const singleton = options.singleton !== false; // Default to singleton
    const dependencies = options.dependencies || [];

    this.factories.set(name, {
      factory,
      singleton,
      dependencies
    });

    // Build dependency graph
    this.dependencyGraph.set(name, new Set(dependencies));

    console.log(`[ServiceContainer] Registered service '${name}' (${singleton ? 'singleton' : 'transient'})`);
  }

  /**
   * Get service instance with dependency resolution
   */
  async get<T>(name: string): Promise<T> {
    // Check if already instantiated (for singletons)
    if (this.services.has(name)) {
      return this.services.get(name);
    }

    const registration = this.factories.get(name);
    if (!registration) {
      throw new Error(`Service '${name}' not found. Available services: ${Array.from(this.factories.keys()).join(', ')}`);
    }

    // Check for circular dependencies
    if (this.initializationStack.includes(name)) {
      const cycle = [...this.initializationStack, name].join(' -> ');
      throw new Error(`Circular dependency detected: ${cycle}`);
    }

    // Add to initialization stack
    this.initializationStack.push(name);

    try {
      // Resolve dependencies first
      const resolvedDependencies: Record<string, any> = {};
      const dependencies = registration.dependencies || [];
      for (const depName of dependencies) {
        const dependency = await this.get(depName);
        resolvedDependencies[depName] = dependency;
      }

      // Create service instance
      console.log(`[ServiceContainer] Creating service '${name}'${dependencies.length > 0 ? ` with dependencies: ${dependencies.join(', ')}` : ''}`);
      
      const instance = await registration.factory(resolvedDependencies || {});

      // Store if singleton
      if (registration.singleton) {
        this.services.set(name, instance);
      }

      console.log(`[ServiceContainer] ✅ Service '${name}' created successfully`);
      return instance;

    } catch (error) {
      console.error(`[ServiceContainer] ❌ Failed to create service '${name}':`, error);
      throw error;
    } finally {
      // Remove from initialization stack
      this.initializationStack.pop();
    }
  }

  /**
   * Get service if already instantiated (non-blocking)
   */
  getIfReady<T>(name: string): T | null {
    return this.services.get(name) || null;
  }

  /**
   * Check if service is registered
   */
  has(name: string): boolean {
    return this.factories.has(name);
  }

  /**
   * Check if service is instantiated
   */
  isReady(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Get all registered service names
   */
  getRegisteredServices(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Get all instantiated service names
   */
  getReadyServices(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Get service metadata
   */
  getServiceMetadata(name: string): ServiceMetadata | null {
    const registration = this.factories.get(name);
    if (!registration) {
      return null;
    }

    // Find dependents (services that depend on this one)
    const dependents: string[] = [];
    for (const [serviceName, deps] of this.dependencyGraph.entries()) {
      if (deps.has(name)) {
        dependents.push(serviceName);
      }
    }

    return {
      name,
      singleton: registration.singleton,
      initialized: this.services.has(name),
      dependencies: registration.dependencies || [],
      dependents
    };
  }

  /**
   * Get all service metadata
   */
  getAllServiceMetadata(): Record<string, ServiceMetadata> {
    const metadata: Record<string, ServiceMetadata> = {};
    
    for (const serviceName of this.factories.keys()) {
      const meta = this.getServiceMetadata(serviceName);
      if (meta) {
        metadata[serviceName] = meta;
      }
    }

    return metadata;
  }

  /**
   * Pre-initialize a service without waiting
   */
  async preInitialize(name: string): Promise<void> {
    try {
      await this.get(name);
      console.log(`[ServiceContainer] Service '${name}' pre-initialized`);
    } catch (error) {
      console.warn(`[ServiceContainer] Failed to pre-initialize service '${name}':`, error);
    }
  }

  /**
   * Pre-initialize multiple services in parallel
   */
  async preInitializeMany(names: string[]): Promise<void> {
    const promises = names.map(name => this.preInitialize(name));
    await Promise.allSettled(promises);
  }

  /**
   * Initialize services in dependency order
   */
  async initializeInOrder(names: string[]): Promise<void> {
    const sorted = this.topologicalSort(names);
    
    for (const name of sorted) {
      await this.get(name);
    }
  }

  /**
   * Validate dependency graph for cycles
   */
  validateDependencies(): { valid: boolean; cycles: string[] } {
    const cycles: string[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectCycle = (node: string, path: string[]): boolean => {
      if (recursionStack.has(node)) {
        const cycleStart = path.indexOf(node);
        const cycle = path.slice(cycleStart).join(' -> ') + ' -> ' + node;
        cycles.push(cycle);
        return true;
      }

      if (visited.has(node)) {
        return false;
      }

      visited.add(node);
      recursionStack.add(node);

      const dependencies = this.dependencyGraph.get(node) || new Set();
      for (const dep of dependencies) {
        if (detectCycle(dep, [...path, node])) {
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const service of this.factories.keys()) {
      if (!visited.has(service)) {
        detectCycle(service, []);
      }
    }

    return {
      valid: cycles.length === 0,
      cycles
    };
  }

  /**
   * Topological sort for dependency order
   */
  private topologicalSort(services: string[]): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (node: string) => {
      if (visited.has(node)) return;
      visited.add(node);

      const dependencies = this.dependencyGraph.get(node) || new Set();
      for (const dep of dependencies) {
        if (services.includes(dep)) {
          visit(dep);
        }
      }

      result.push(node);
    };

    for (const service of services) {
      visit(service);
    }

    return result;
  }

  /**
   * Replace a service instance (for testing or hot-swapping)
   */
  replace<T>(name: string, instance: T): void {
    if (!this.factories.has(name)) {
      throw new Error(`Cannot replace unregistered service '${name}'`);
    }

    this.services.set(name, instance);
    console.log(`[ServiceContainer] Service '${name}' replaced`);
  }

  /**
   * Remove a service (cleanup)
   */
  remove(name: string): void {
    const instance = this.services.get(name);
    
    // Call cleanup if available
    if (instance && typeof instance.cleanup === 'function') {
      try {
        instance.cleanup();
        console.log(`[ServiceContainer] Service '${name}' cleanup completed`);
      } catch (error) {
        console.error(`[ServiceContainer] Service '${name}' cleanup failed:`, error);
      }
    }

    this.services.delete(name);
    this.factories.delete(name);
    this.dependencyGraph.delete(name);

    console.log(`[ServiceContainer] Service '${name}' removed`);
  }

  /**
   * Clear all services with proper cleanup
   */
  clear(): void {
    console.log('[ServiceContainer] Starting cleanup of all services...');

    // Get services in reverse dependency order for cleanup
    const allServices = Array.from(this.services.keys());
    const cleanupOrder = this.topologicalSort(allServices).reverse();

    // Cleanup services in dependency order
    for (const serviceName of cleanupOrder) {
      const service = this.services.get(serviceName);
      
      if (service && typeof service.cleanup === 'function') {
        try {
          service.cleanup();
          console.log(`[ServiceContainer] ✅ Cleaned up service '${serviceName}'`);
        } catch (error) {
          console.error(`[ServiceContainer] ❌ Cleanup failed for service '${serviceName}':`, error);
        }
      }
    }
    
    // Clear all maps
    this.services.clear();
    this.factories.clear();
    this.dependencyGraph.clear();
    this.initializationStack = [];

    console.log('[ServiceContainer] All services cleared');
  }

  /**
   * Get container statistics
   */
  getStats(): {
    registered: number;
    instantiated: number;
    singletons: number;
    transients: number;
    totalDependencies: number;
  } {
    let singletons = 0;
    let transients = 0;
    let totalDependencies = 0;

    for (const registration of this.factories.values()) {
      if (registration.singleton) {
        singletons++;
      } else {
        transients++;
      }
      totalDependencies += (registration.dependencies || []).length;
    }

    return {
      registered: this.factories.size,
      instantiated: this.services.size,
      singletons,
      transients,
      totalDependencies
    };
  }

  /**
   * Export dependency graph for visualization
   */
  exportDependencyGraph(): { nodes: string[]; edges: Array<{ from: string; to: string }> } {
    const nodes = Array.from(this.factories.keys());
    const edges: Array<{ from: string; to: string }> = [];

    for (const [service, dependencies] of this.dependencyGraph.entries()) {
      for (const dep of dependencies) {
        edges.push({ from: service, to: dep });
      }
    }

    return { nodes, edges };
  }
}