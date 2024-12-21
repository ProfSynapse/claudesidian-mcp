"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsyncContainerModule = exports.ContainerModule = void 0;
const id_1 = require("../utils/id");
class ContainerModule {
    id;
    registry;
    constructor(registry) {
        this.id = (0, id_1.id)();
        this.registry = registry;
    }
}
exports.ContainerModule = ContainerModule;
class AsyncContainerModule {
    id;
    registry;
    constructor(registry) {
        this.id = (0, id_1.id)();
        this.registry = registry;
    }
}
exports.AsyncContainerModule = AsyncContainerModule;
//# sourceMappingURL=container_module.js.map