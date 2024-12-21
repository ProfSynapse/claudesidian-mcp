"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContainerSnapshot = void 0;
class ContainerSnapshot {
    bindings;
    activations;
    deactivations;
    middleware;
    moduleActivationStore;
    static of(bindings, middleware, activations, deactivations, moduleActivationStore) {
        const snapshot = new ContainerSnapshot();
        snapshot.bindings = bindings;
        snapshot.middleware = middleware;
        snapshot.deactivations = deactivations;
        snapshot.activations = activations;
        snapshot.moduleActivationStore = moduleActivationStore;
        return snapshot;
    }
}
exports.ContainerSnapshot = ContainerSnapshot;
//# sourceMappingURL=container_snapshot.js.map