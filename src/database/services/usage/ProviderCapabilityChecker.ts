import { ITokenTrackingProvider } from '../../interfaces/IEmbeddingProvider';
import { IProviderCapabilityChecker } from './interfaces';

export class ProviderCapabilityChecker implements IProviderCapabilityChecker {
    isTokenTrackingProvider(provider: any): provider is ITokenTrackingProvider {
        return (
            provider &&
            typeof provider.getTotalCost === 'function' &&
            typeof provider.getModelUsage === 'function' &&
            typeof provider.getTokensThisMonth === 'function' &&
            typeof provider.updateUsageStats === 'function' &&
            typeof provider.resetUsageStats === 'function'
        );
    }

    hasMethod(provider: any, methodName: string): boolean {
        return provider && typeof provider[methodName] === 'function';
    }
}