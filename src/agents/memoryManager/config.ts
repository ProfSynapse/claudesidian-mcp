import { JSONSchema7 } from 'json-schema';

// Schema for memory-related operations
export const schema = {
    // Schema for memory search params
    searchParams: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The text query to search for semantically similar content'
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results to return',
                default: 10
            },
            threshold: {
                type: 'number',
                description: 'Minimum similarity score (0-1) for results',
                default: 0.7
            },
            filters: {
                type: 'object',
                description: 'Optional filters to apply to search results',
                properties: {
                    tags: {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        description: 'Only return results with these tags'
                    },
                    paths: {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        description: 'Only return results from files matching these paths (supports globs)'
                    },
                    properties: {
                        type: 'object',
                        description: 'Only return results with frontmatter matching these properties'
                    },
                    dateRange: {
                        type: 'object',
                        properties: {
                            start: {
                                type: 'string',
                                description: 'Start date in ISO format (e.g. 2023-01-01)'
                            },
                            end: {
                                type: 'string',
                                description: 'End date in ISO format (e.g. 2023-12-31)'
                            }
                        }
                    }
                }
            },
            graphOptions: {
                type: 'object',
                description: 'Options for graph-based result boosting',
                properties: {
                    useGraphBoost: {
                        type: 'boolean',
                        description: 'Whether to boost results based on graph connections',
                        default: false
                    },
                    boostFactor: {
                        type: 'number',
                        description: 'Amount to boost results based on connections (0-1)',
                        default: 0.3
                    },
                    includeNeighbors: {
                        type: 'boolean',
                        description: 'Include neighboring notes in results',
                        default: false
                    },
                    maxDistance: {
                        type: 'number',
                        description: 'Maximum graph distance to consider',
                        default: 1
                    },
                    seedNotes: {
                        type: 'array',
                        items: {
                            type: 'string'
                        },
                        description: 'Starting points in the graph'
                    }
                }
            }
        },
        required: ['query']
    } as JSONSchema7,
    
    // Schema for memory query results
    searchResults: {
        type: 'object',
        properties: {
            matches: {
                type: 'array',
                description: 'Matches sorted by relevance',
                items: {
                    type: 'object',
                    properties: {
                        similarity: {
                            type: 'number',
                            description: 'Similarity score (0-1)'
                        },
                        content: {
                            type: 'string',
                            description: 'The matching text content'
                        },
                        filePath: {
                            type: 'string',
                            description: 'Path to the source file'
                        },
                        lineStart: {
                            type: 'number',
                            description: 'Starting line number in source file'
                        },
                        lineEnd: {
                            type: 'number',
                            description: 'Ending line number in source file'
                        },
                        metadata: {
                            type: 'object',
                            properties: {
                                frontmatter: {
                                    type: 'object',
                                    description: 'Frontmatter properties from the source file'
                                },
                                tags: {
                                    type: 'array',
                                    items: {
                                        type: 'string'
                                    },
                                    description: 'Tags associated with the content'
                                },
                                links: {
                                    type: 'object',
                                    properties: {
                                        outgoing: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    displayText: {
                                                        type: 'string',
                                                        description: 'The link text'
                                                    },
                                                    targetPath: {
                                                        type: 'string',
                                                        description: 'The target file path'
                                                    }
                                                }
                                            }
                                        },
                                        incoming: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    sourcePath: {
                                                        type: 'string',
                                                        description: 'The source file path'
                                                    },
                                                    displayText: {
                                                        type: 'string',
                                                        description: 'The link text'
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    } as JSONSchema7,
    
    // Schema for index file params
    indexParams: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'Path to the file to index'
            },
            force: {
                type: 'boolean',
                description: 'Force re-indexing even if the file is already indexed',
                default: false
            }
        },
        required: ['filePath']
    } as JSONSchema7,
    
    // Schema for index file results
    indexResults: {
        type: 'object',
        properties: {
            success: {
                type: 'boolean',
                description: 'Whether the indexing was successful'
            },
            chunks: {
                type: 'number',
                description: 'Number of chunks created from the file'
            },
            filePath: {
                type: 'string',
                description: 'Path to the indexed file'
            },
            error: {
                type: 'string',
                description: 'Error message if indexing failed'
            }
        },
        required: ['success']
    } as JSONSchema7,
    
    // Schema for batch index params
    batchIndexParams: {
        type: 'object',
        properties: {
            filePaths: {
                type: 'array',
                items: {
                    type: 'string'
                },
                description: 'Paths to the files to index'
            },
            force: {
                type: 'boolean',
                description: 'Force re-indexing even if files are already indexed',
                default: false
            }
        },
        required: ['filePaths']
    } as JSONSchema7,
    
    // Schema for batch index results
    batchIndexResults: {
        type: 'object',
        properties: {
            success: {
                type: 'boolean',
                description: 'Whether the batch indexing was completely successful'
            },
            totalProcessed: {
                type: 'number',
                description: 'Total number of files processed'
            },
            successCount: {
                type: 'number',
                description: 'Number of files successfully indexed'
            },
            failedCount: {
                type: 'number',
                description: 'Number of files that failed to index'
            },
            error: {
                type: 'string',
                description: 'Error message if the overall operation failed'
            },
            results: {
                type: 'array',
                description: 'Results for each file in the batch',
                items: {
                    type: 'object',
                    properties: {
                        filePath: {
                            type: 'string',
                            description: 'Path to the indexed file'
                        },
                        success: {
                            type: 'boolean',
                            description: 'Whether indexing was successful for this file'
                        },
                        chunks: {
                            type: 'number',
                            description: 'Number of chunks created from the file'
                        },
                        error: {
                            type: 'string',
                            description: 'Error message if indexing failed for this file'
                        }
                    },
                    required: ['filePath', 'success']
                }
            }
        },
        required: ['success', 'totalProcessed', 'successCount', 'failedCount', 'results']
    } as JSONSchema7,
    
    // Schema for batch query params
    batchQueryParams: {
        type: 'object',
        properties: {
            queries: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'The text query to search for semantically similar content'
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum number of results to return',
                            default: 10
                        },
                        threshold: {
                            type: 'number',
                            description: 'Minimum similarity score (0-1) for results',
                            default: 0.7
                        },
                        filters: {
                            type: 'object',
                            description: 'Optional filters to apply to search results'
                        },
                        graphOptions: {
                            type: 'object',
                            description: 'Options for graph-based result boosting'
                        }
                    },
                    required: ['query']
                },
                description: 'List of queries to execute in batch'
            }
        },
        required: ['queries']
    } as JSONSchema7,
    
    // Schema for batch query results
    batchQueryResults: {
        type: 'object',
        properties: {
            success: {
                type: 'boolean',
                description: 'Whether the batch querying was completely successful'
            },
            totalProcessed: {
                type: 'number',
                description: 'Total number of queries processed'
            },
            successCount: {
                type: 'number',
                description: 'Number of queries successfully executed'
            },
            failedCount: {
                type: 'number',
                description: 'Number of queries that failed'
            },
            error: {
                type: 'string',
                description: 'Error message if the overall operation failed'
            },
            results: {
                type: 'array',
                description: 'Results for each query in the batch',
                items: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'The query text'
                        },
                        success: {
                            type: 'boolean',
                            description: 'Whether the query was successful'
                        },
                        matches: {
                            type: 'array',
                            description: 'Matches for this query'
                        },
                        error: {
                            type: 'string',
                            description: 'Error message if the query failed'
                        }
                    },
                    required: ['query', 'success']
                }
            }
        },
        required: ['success', 'totalProcessed', 'successCount', 'failedCount', 'results']
    } as JSONSchema7,
    
    // Schema for status params
    statusParams: {
        type: 'object',
        properties: {}
    } as JSONSchema7,
    
    // Schema for status results
    statusResults: {
        type: 'object',
        properties: {
            enabled: {
                type: 'boolean',
                description: 'Whether the memory manager is enabled'
            },
            provider: {
                type: 'string',
                description: 'The embedding provider being used'
            },
            model: {
                type: 'string',
                description: 'The embedding model being used'
            },
            dimensions: {
                type: 'number',
                description: 'Number of dimensions in the embeddings'
            },
            totalEmbeddings: {
                type: 'number',
                description: 'Total number of embeddings in the database'
            },
            tokenUsage: {
                type: 'object',
                properties: {
                    tokensThisMonth: {
                        type: 'number',
                        description: 'Number of tokens used this month'
                    },
                    maxTokensPerMonth: {
                        type: 'number',
                        description: 'Maximum tokens allowed per month'
                    },
                    percentUsed: {
                        type: 'number',
                        description: 'Percentage of monthly tokens used'
                    }
                }
            },
            dbSizeMB: {
                type: 'number',
                description: 'Database size in megabytes'
            },
            lastIndexed: {
                type: 'string',
                description: 'Date/time of last indexing operation'
            },
            indexingInProgress: {
                type: 'boolean',
                description: 'Whether an indexing operation is currently in progress'
            }
        }
    } as JSONSchema7
};