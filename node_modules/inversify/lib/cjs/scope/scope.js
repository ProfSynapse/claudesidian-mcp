"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveToScope = exports.tryGetFromScope = void 0;
const literal_types_1 = require("../constants/literal_types");
const async_1 = require("../utils/async");
const tryGetFromScope = (requestScope, binding) => {
    if (binding.scope === literal_types_1.BindingScopeEnum.Singleton && binding.activated) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return binding.cache;
    }
    if (binding.scope === literal_types_1.BindingScopeEnum.Request &&
        requestScope.has(binding.id)) {
        return requestScope.get(binding.id);
    }
    return null;
};
exports.tryGetFromScope = tryGetFromScope;
const saveToScope = (requestScope, binding, result) => {
    if (binding.scope === literal_types_1.BindingScopeEnum.Singleton) {
        _saveToSingletonScope(binding, result);
    }
    if (binding.scope === literal_types_1.BindingScopeEnum.Request) {
        _saveToRequestScope(requestScope, binding, result);
    }
};
exports.saveToScope = saveToScope;
// eslint-disable-next-line @typescript-eslint/naming-convention
const _saveToRequestScope = (requestScope, binding, result) => {
    if (!requestScope.has(binding.id)) {
        requestScope.set(binding.id, result);
    }
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _saveToSingletonScope = (binding, result) => {
    // store in cache if scope is singleton
    binding.cache = result;
    binding.activated = true;
    if ((0, async_1.isPromise)(result)) {
        void _saveAsyncResultToSingletonScope(binding, result);
    }
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _saveAsyncResultToSingletonScope = async (binding, asyncResult) => {
    try {
        const result = await asyncResult;
        binding.cache = result;
    }
    catch (ex) {
        // allow binding to retry in future
        binding.cache = null;
        binding.activated = false;
        throw ex;
    }
};
//# sourceMappingURL=scope.js.map