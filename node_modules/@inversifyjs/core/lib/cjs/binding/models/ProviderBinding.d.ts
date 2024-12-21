import { bindingScopeValues } from './BindingScope';
import { bindingTypeValues } from './BindingType';
import { Provider } from './Provider';
import { ScopedBinding } from './ScopedBinding';
export interface ProviderBinding<TActivated> extends ScopedBinding<typeof bindingTypeValues.Provider, typeof bindingScopeValues.Singleton, TActivated> {
    readonly provider: () => Provider<TActivated>;
}
//# sourceMappingURL=ProviderBinding.d.ts.map