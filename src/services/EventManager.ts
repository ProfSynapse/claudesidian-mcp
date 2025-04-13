/**
 * Event management service
 * Provides a simple event system for communication between components
 */
export class EventManager {
  private eventListeners: Map<string, Array<(data: any) => void>> = new Map();
  
  /**
   * Register an event listener
   * @param event Event name
   * @param callback Callback function to execute when event is emitted
   */
  on(event: string, callback: (data: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    
    this.eventListeners.get(event)?.push(callback);
  }
  
  /**
   * Remove an event listener
   * @param event Event name
   * @param callback Callback function to remove
   */
  off(event: string, callback: (data: any) => void): void {
    if (!this.eventListeners.has(event)) {
      return;
    }
    
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }
  
  /**
   * Emit an event
   * @param event Event name
   * @param data Data to pass to listeners
   */
  emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        listener(data);
      }
    }
  }
}