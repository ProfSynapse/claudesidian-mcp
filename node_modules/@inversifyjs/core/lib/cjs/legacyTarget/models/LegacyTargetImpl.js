"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyTargetImpl = void 0;
const common_1 = require("@inversifyjs/common");
const getLegacyMetadata_1 = require("../../metadata/calculations/getLegacyMetadata");
const ClassElementMetadataKind_1 = require("../../metadata/models/ClassElementMetadataKind");
const keys_1 = require("../../reflectMetadata/data/keys");
const LegacyQueryableStringImpl_1 = require("../../string/models/LegacyQueryableStringImpl");
const getDescription_1 = require("../../symbol/calculations/getDescription");
const getTargetId_1 = require("../calculations/getTargetId");
class LegacyTargetImpl {
    #metadata;
    #id;
    #identifier;
    #lazyLegacyMetadata;
    #name;
    #type;
    constructor(identifier, metadata, type) {
        this.#id = (0, getTargetId_1.getTargetId)();
        this.#identifier = identifier;
        this.#lazyLegacyMetadata = undefined;
        this.#metadata = metadata;
        this.#name = new LegacyQueryableStringImpl_1.LegacyQueryableStringImpl(typeof identifier === 'string' ? identifier : (0, getDescription_1.getDescription)(identifier));
        this.#type = type;
    }
    get id() {
        return this.#id;
    }
    /**
     * If this is a class property target, this is the name of the property to be injected
     */
    get identifier() {
        return this.#identifier;
    }
    get metadata() {
        if (this.#lazyLegacyMetadata === undefined) {
            this.#lazyLegacyMetadata = (0, getLegacyMetadata_1.getLegacyMetadata)(this.#metadata);
        }
        return this.#lazyLegacyMetadata;
    }
    get name() {
        return this.#name;
    }
    get type() {
        return this.#type;
    }
    get serviceIdentifier() {
        if (common_1.LazyServiceIdentifier.is(this.#metadata.value)) {
            return this.#metadata.value.unwrap();
        }
        else {
            return this.#metadata.value;
        }
    }
    getCustomTags() {
        return [...this.#metadata.tags.entries()].map(([key, value]) => ({
            key,
            value,
        }));
    }
    getNamedTag() {
        return this.#metadata.name === undefined
            ? null
            : {
                key: keys_1.NAMED_TAG,
                value: this.#metadata.name,
            };
    }
    hasTag(key) {
        return this.metadata.some((metadata) => metadata.key === key);
    }
    isArray() {
        return this.#metadata.kind === ClassElementMetadataKind_1.ClassElementMetadataKind.multipleInjection;
    }
    isNamed() {
        return this.#metadata.name !== undefined;
    }
    isOptional() {
        return this.#metadata.optional;
    }
    isTagged() {
        return this.#metadata.tags.size > 0;
    }
    matchesArray(name) {
        return this.isArray() && this.#metadata.value === name;
    }
    matchesNamedTag(name) {
        return this.#metadata.name === name;
    }
    matchesTag(key) {
        return (value) => this.metadata.some((metadata) => metadata.key === key && metadata.value === value);
    }
}
exports.LegacyTargetImpl = LegacyTargetImpl;
//# sourceMappingURL=LegacyTargetImpl.js.map