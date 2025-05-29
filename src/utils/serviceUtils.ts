/**
 * Utility functions for service management and initialization
 */

/**
 * Safely initialize a service with error handling
 * @param service Service instance with initialize method
 * @param serviceName Name of the service for logging
 * @returns Promise that resolves to true if successful, false otherwise
 */
export async function safeInitialize(
  service: { initialize(): Promise<void> },
  serviceName: string
): Promise<boolean> {
  try {
    await service.initialize();
    console.log(`${serviceName} initialized successfully`);
    return true;
  } catch (error) {
    console.warn(`Failed to initialize ${serviceName}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Initialize multiple services concurrently with error handling
 * @param services Array of service initialization configs
 * @returns Promise that resolves to results for each service
 */
export async function initializeServices(
  services: Array<{
    service: { initialize(): Promise<void> };
    name: string;
  }>
): Promise<Array<{ name: string; success: boolean }>> {
  const results = await Promise.allSettled(
    services.map(({ service, name }) => safeInitialize(service, name))
  );
  
  return services.map(({ name }, index) => ({
    name,
    success: results[index].status === 'fulfilled' && results[index].value === true
  }));
}
