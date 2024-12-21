"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stringifyBinding = stringifyBinding;
const common_1 = require("@inversifyjs/common");
const BindingType_1 = require("../models/BindingType");
function stringifyBinding(binding) {
    switch (binding.type) {
        case BindingType_1.bindingTypeValues.Instance:
            return `[ type: "${binding.type}", serviceIdentifier: "${(0, common_1.stringifyServiceIdentifier)(binding.serviceIdentifier)}", scope: "${binding.scope}", implementationType: "${binding.implementationType.name}" ]`;
        case BindingType_1.bindingTypeValues.ServiceRedirection:
            return `[ type: "${binding.type}", serviceIdentifier: "${(0, common_1.stringifyServiceIdentifier)(binding.serviceIdentifier)}", redirection: "${(0, common_1.stringifyServiceIdentifier)(binding.targetServiceIdentifier)}" ]`;
        default:
            return `[ type: "${binding.type}", serviceIdentifier: "${(0, common_1.stringifyServiceIdentifier)(binding.serviceIdentifier)}", scope: "${binding.scope}" ]`;
    }
}
//# sourceMappingURL=stringifyBinding.js.map