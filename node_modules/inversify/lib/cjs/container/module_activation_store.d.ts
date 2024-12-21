import { interfaces } from '../interfaces/interfaces';
export declare class ModuleActivationStore implements interfaces.ModuleActivationStore {
    private readonly _map;
    remove(moduleId: number): interfaces.ModuleActivationHandlers;
    addDeactivation<T>(moduleId: number, serviceIdentifier: interfaces.ServiceIdentifier<T>, onDeactivation: interfaces.BindingDeactivation<T>): void;
    addActivation<T>(moduleId: number, serviceIdentifier: interfaces.ServiceIdentifier<T>, onActivation: interfaces.BindingActivation<T>): void;
    clone(): interfaces.ModuleActivationStore;
    private _getModuleActivationHandlers;
    private _getEmptyHandlersStore;
}
//# sourceMappingURL=module_activation_store.d.ts.map