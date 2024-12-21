"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stringifyDecoratorInfo = stringifyDecoratorInfo;
const DecoratorInfoKind_1 = require("../models/DecoratorInfoKind");
function stringifyDecoratorInfo(decoratorTargetInfo) {
    switch (decoratorTargetInfo.kind) {
        case DecoratorInfoKind_1.DecoratorInfoKind.parameter:
            return `[class: "${decoratorTargetInfo.targetClass.name}", index: "${decoratorTargetInfo.index.toString()}"]`;
        case DecoratorInfoKind_1.DecoratorInfoKind.property:
            return `[class: "${decoratorTargetInfo.targetClass.name}", property: "${decoratorTargetInfo.property.toString()}"]`;
    }
}
//# sourceMappingURL=stringifyDecoratorInfo.js.map