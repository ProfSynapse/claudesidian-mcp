declare function getReflectMetadata<TMetadata>(target: object, metadataKey: unknown): TMetadata | undefined;

declare function updateReflectMetadata<TMetadata>(target: object, metadataKey: unknown, defaultValue: TMetadata, callback: (metadata: TMetadata) => TMetadata): void;

export { getReflectMetadata, updateReflectMetadata };
