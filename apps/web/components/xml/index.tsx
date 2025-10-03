'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  FileCode, 
  AlertCircle, 
  CheckCircle, 
  AlertTriangle,
  Info,
  ArrowRight
} from 'lucide-react';

// XML Document Status Component
interface XmlDocumentStatusProps {
  status: 'PARSING' | 'VALIDATION_SUCCESS' | 'VALIDATION_FAILED' | 'MAPPING_SUCCESS' | 'MAPPING_FAILED' | 'PROCESSING_ERROR';
  fileName?: string;
  errors?: string[];
  warnings?: string[];
}

export function XmlDocumentStatus({ status, fileName, errors, warnings }: XmlDocumentStatusProps) {
  const statusConfig = {
    PARSING: {
      icon: <FileCode className="h-4 w-4" />,
      color: 'bg-blue-100 text-blue-800',
      badge: 'secondary' as const,
      label: 'Parsing'
    },
    VALIDATION_SUCCESS: {
      icon: <CheckCircle className="h-4 w-4" />,
      color: 'bg-green-100 text-green-800',
      badge: 'default' as const,
      label: 'Validated'
    },
    VALIDATION_FAILED: {
      icon: <AlertCircle className="h-4 w-4" />,
      color: 'bg-red-100 text-red-800',
      badge: 'destructive' as const,
      label: 'Validation Failed'
    },
    MAPPING_SUCCESS: {
      icon: <CheckCircle className="h-4 w-4" />,
      color: 'bg-green-100 text-green-800',
      badge: 'default' as const,
      label: 'Mapped'
    },
    MAPPING_FAILED: {
      icon: <AlertTriangle className="h-4 w-4" />,
      color: 'bg-orange-100 text-orange-800',
      badge: 'secondary' as const,
      label: 'Mapping Failed'
    },
    PROCESSING_ERROR: {
      icon: <AlertCircle className="h-4 w-4" />,
      color: 'bg-red-100 text-red-800',
      badge: 'destructive' as const,
      label: 'Error'
    }
  };

  const config = statusConfig[status];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${config.color}`}>
          {config.icon}
          <span className="text-sm font-medium">{config.label}</span>
        </div>
        
        <Badge variant={config.badge}>
          {status}
        </Badge>
        
        {fileName && (
          <span className="text-sm text-gray-600">
            {fileName}
          </span>
        )}
      </div>

      {errors && errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              {errors.map((error, index) => (
                <div key={index} className="text-sm">• {error}</div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {warnings && warnings.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              {warnings.map((warning, index) => (
                <div key={index} className="text-sm">• {warning}</div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// XML Mapping Progress Component
interface XmlMappingProgressProps {
  mappings: {
    sourceElement: string;
    targetElement: string;
    status: 'pending' | 'success' | 'failed' | 'skipped';
    confidence?: number;
  }[];
  totalElements?: number;
}

export function XmlMappingProgress({ mappings, totalElements }: XmlMappingProgressProps) {
  const successCount = mappings.filter(m => m.status === 'success').length;
  const failedCount = mappings.filter(m => m.status === 'failed').length;
  const pendingCount = mappings.filter(m => m.status === 'pending').length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">XML Mapping Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-600">{mappings.length}</div>
            <div className="text-xs text-gray-600">Total Mappings</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">{successCount}</div>
            <div className="text-xs text-gray-600">Successful</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600">{failedCount}</div>
            <div className="text-xs text-gray-600">Failed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
            <div className="text-xs text-gray-600">Pending</div>
          </div>
        </div>

        {/* Mapping List */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {mappings.map((mapping, index) => (
            <div key={index} className="flex items-center justify-between p-2 border rounded">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono">{mapping.sourceElement}</span>
                <ArrowRight className="h-3 w-3 text-gray-400" />
                <span className="text-sm font-mono">{mapping.targetElement}</span>
              </div>
              
              <div className="flex items-center gap-2">
                {mapping.confidence !== undefined && (
                  <Badge variant="secondary" className="text-xs">
                    {(mapping.confidence * 100).toFixed(0)}%
                  </Badge>
                )}
                <Badge 
                  variant={
                    mapping.status === 'success' ? 'default' :
                    mapping.status === 'failed' ? 'destructive' :
                    mapping.status === 'pending' ? 'secondary' : 'outline'
                  }
                  className="text-xs"
                >
                  {mapping.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// XML Structure Viewer Component
interface XmlStructureViewerProps {
  xmlData: any;
  maxDepth?: number;
  showAttributes?: boolean;
}

export function XmlStructureViewer({ xmlData, maxDepth = 3, showAttributes = true }: XmlStructureViewerProps) {
  const renderXmlNode = (node: any, level = 0): React.ReactElement => {
    if (level >= maxDepth) {
      return <span className="text-xs text-gray-500">...</span>;
    }

    if (typeof node === 'string') {
      return <span className="text-xs text-gray-700">"{node.length > 30 ? node.substring(0, 30) + '...' : node}"</span>;
    }

    if (typeof node === 'number') {
      return <span className="text-xs text-blue-600">{node}</span>;
    }

    if (Array.isArray(node)) {
      return (
        <div className="ml-4">
          <span className="text-xs text-gray-500">Array ({node.length} items)</span>
          {node.slice(0, 3).map((item, index) => (
            <div key={index} className="ml-2">
              {renderXmlNode(item, level + 1)}
            </div>
          ))}
          {node.length > 3 && (
            <span className="text-xs text-gray-500 ml-2">... and {node.length - 3} more</span>
          )}
        </div>
      );
    }

    if (typeof node === 'object' && node !== null) {
      const keys = Object.keys(node);
      return (
        <div className="ml-4 space-y-1">
          {keys.slice(0, 5).map((key, index) => (
            <div key={index}>
              <span className="text-xs font-semibold text-purple-600">{key}</span>
              <span className="text-xs text-gray-500">:</span>
              {renderXmlNode(node[key], level + 1)}
            </div>
          ))}
          {keys.length > 5 && (
            <span className="text-xs text-gray-500 ml-2">... and {keys.length - 5} more properties</span>
          )}
        </div>
      );
    }

    return <span className="text-xs text-red-500">Unknown</span>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCode className="h-4 w-4" />
          XML Structure Preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-xs bg-gray-50 p-4 rounded overflow-x-auto">
          {renderXmlNode(xmlData)}
        </div>
        
        {maxDepth < 5 && (
          <p className="text-xs text-gray-500 mt-2">
            Structure truncated at depth {maxDepth}. Increase maxDepth to see more details.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// XML Validation Results Component
interface XmlValidationResultProps {
  isValid: boolean;
  errors: Array<{
    line: number;
    column: number;
    message: string;
    code?: string;
  }>;
  warnings: Array<{
    line: number;
    column: number;
    message: string;
  }>;
  schema?: string;
}

export function XmlValidationResult({ isValid, errors, warnings, schema }: XmlValidationResultProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isValid ? 
            <CheckCircle className="h-4 w-4 text-green-600" /> :
            <AlertCircle className="h-4 w-4 text-red-600" />
          }
          XML Validation Results
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="flex items-center gap-2">
          <Badge variant={isValid ? 'default' : 'destructive'}>
            {isValid ? 'VALID' : 'INVALID'}
          </Badge>
          {schema && (
            <span className="text-sm text-gray-600">
              Schema: {schema}
            </span>
          )}
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div>
            <h4 className="font-medium text-red-700 mb-2">Validation Errors ({errors.length})</h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {errors.map((error, index) => (
                <div key={index} className="p-2 bg-red-50 border border-red-200 rounded text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-xs">
                      Line {error.line}:{error.column}
                    </Badge>
                  </div>
                  <p className="text-red-800 mt-1">{error.message}</p>
                  {error.code && (
                    <p className="text-red-600 text-xs">Code: {error.code}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div>
            <h4 className="font-medium text-yellow-700 mb-2">Validation Warnings ({warnings.length})</h4>
            <div className="space-y-2 max-h-24 overflow-y-auto">
              {warnings.map((warning, index) => (
                <div key={index} className="p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      Line {warning.line}:{warning.column} 
                    </Badge>
                  </div>
                  <p className="text-yellow-800 mt-1">{warning.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {isValid && errors.length === 0 && warnings.length === 0 && (
          <div className="text-center py-4">
            <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="text-green-600 font-medium">XML is valid!</p>
            <p className="text-sm text-gray-600">No validation errors or warnings found.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

        // Collection of all XML-related components
export default {
  XmlDocumentStatus,
  XmlMappingProgress,
  XmlStructureViewer,
  XmlValidationResult,
};
