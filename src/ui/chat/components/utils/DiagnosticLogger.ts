/**
 * DiagnosticLogger - State-aware diagnostic logging utility
 * Location: /src/ui/chat/components/utils/DiagnosticLogger.ts
 *
 * Provides logging that only fires when state changes, reducing spam during streaming.
 * Uses emoji prefixes for easy filtering in console.
 */

export interface NavigatorState {
  shouldShow: boolean;
  hasNavigator: boolean;
}

export interface RenderState {
  isStreaming: boolean;
  contentEmpty: boolean;
}

export class DiagnosticLogger {
  private lastNavigatorState: NavigatorState | null = null;
  private lastRenderState: RenderState | null = null;

  /**
   * Log navigator state only when it changes
   * @param current Current navigator state
   * @param messageId Message ID for context
   * @param additionalData Additional data to log
   * @returns true if state changed and was logged
   */
  logNavigatorStateChange(
    current: NavigatorState,
    messageId: string,
    additionalData?: Record<string, any>
  ): boolean {
    const stateChanged = !this.lastNavigatorState ||
      this.lastNavigatorState.shouldShow !== current.shouldShow ||
      this.lastNavigatorState.hasNavigator !== current.hasNavigator;

    if (stateChanged) {
      const action = current.shouldShow && !current.hasNavigator ? 'CREATE' :
        !current.shouldShow && current.hasNavigator ? 'DESTROY' :
          current.shouldShow && current.hasNavigator ? 'UPDATE' : 'NONE';

      console.log('🧭 [NAVIGATOR-DIAGNOSTIC] syncNavigator - STATE CHANGE', {
        messageId,
        shouldShow: current.shouldShow,
        hasNavigator: current.hasNavigator,
        action,
        ...additionalData
      });

      this.lastNavigatorState = current;
      return true;
    }

    return false;
  }

  /**
   * Log render state only when it changes
   * @param current Current render state
   * @param messageId Message ID for context
   * @param contentLength Content length for context
   * @returns true if state changed and was logged
   */
  logRenderStateChange(
    current: RenderState,
    messageId: string,
    contentLength: number,
    additionalData?: Record<string, any>
  ): boolean {
    const stateChanged = !this.lastRenderState ||
      this.lastRenderState.isStreaming !== current.isStreaming ||
      this.lastRenderState.contentEmpty !== current.contentEmpty;

    if (stateChanged) {
      console.log('🎨 [RENDER-DIAGNOSTIC]', {
        messageId,
        contentLength,
        isStreaming: current.isStreaming,
        contentEmpty: current.contentEmpty,
        ...additionalData
      });

      this.lastRenderState = current;
      return true;
    }

    return false;
  }

  /**
   * Force log navigator state (for important events)
   */
  logNavigatorEvent(message: string, data: Record<string, any>): void {
    console.log(`🧭 [NAVIGATOR-DIAGNOSTIC] ${message}`, data);
  }

  /**
   * Force log render event (for important events)
   */
  logRenderEvent(message: string, data: Record<string, any>): void {
    console.log(`🎨 [RENDER-DIAGNOSTIC] ${message}`, data);
  }

  /**
   * Reset state tracking (useful for component reset)
   */
  reset(): void {
    this.lastNavigatorState = null;
    this.lastRenderState = null;
  }
}
