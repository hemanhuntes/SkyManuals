'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle, 
  FileCode, 
  Settings,
  Loader2 
} from 'lucide-react';

interface XmlImportRequest {
  fileName: string;
  xmlContent: string;
  xsdSchemaContent?: string;
  mappingConfigurationId?: string;
  organizationId: string;
  importOptions: {
    createNewManual: boolean;
    overwriteExistingBlocks: boolean;
    validateAgainstXsd: boolean;
    generateDefaultMappings: boolean;
  };
}

export default function XmlImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [xmlContent, setXmlContent] = useState('');
  const [xsdContent, setXsdContent] = useState('');
  const [importOptions, setImportOptions] = useState({
    createNewManual: false,
    overwriteExistingBlocks: false,
    validateAgainstXsd: true,
    generateDefaultMappings: true,
  });
  
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<any[]>([]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setXmlContent('');
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        // Simulate parsing - would be done on backend
        console.log('XML file content:', content.substring(0, 200) + '...');
      };
      reader.readAsText(selectedFile);
    }
  };

  const handleXmlContentChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setXmlContent(event.target.value);
    setFile(null);
  };

  const handleImport = async () => {
    if (!file && !xmlContent.trim()) {
      setError('Please select a file or enter XML content');
      return;
    }

    setLoading(true);
    setError(null);
    setValidationErrors([]);

    try {
      // Simulate file upload and import
      const formData = new FormData();
      
      if (file) {
        formData.append('file', file);
      } else {
        // Create a blob from XML content
        const xmlBlob = new Blob([xmlContent], { type: 'application/xml' });
        formData.append('file', xmlBlob, 'imported.xml');
      }
      
      formData.append('xsdSchemaContent', xsdContent);
      formData.append('organizationId', 'org-123'); // In real app, get from context
      formData.append('createNewManual', importOptions.createNewManual.toString());
      formData.append('overwriteExistingBlocks', importOptions.overwriteExistingBlocks.toString());
      formData.append('validateAgainstXsd', importOptions.validateAgainstXsd.toString());
      formData.append('generateDefaultMappings', importOptions.generateDefaultMappings.toString());

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Mock result
      const result = {
        id: 'xml-doc-123',
        fileName: file?.name || 'imported.xml',
        status: 'VALIDATION_SUCCuCCESS',
        parsedXml: {
          Manual: {
            title: 'Sample Manual',
            version: '1.0.0',
            chapters: [
              {
                number: '01',
                title: 'Chapter 1',
                sections: [
                  {
                    number: '01-01',
                    title: 'Section 1.1',
                    blocks: [
                      {
                        type: 'paragraph',
                        content: 'Sample paragraph content',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
        validationErrors: [],
        mappingsGenerated: 5,
      };

      setImportResult(result);
      
      // Check for validation errors
      if (result.validationErrors?.length > 0) {
        setValidationErrors(result.validationErrors);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import XML');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          XML Import
        </h1>
        <p className="text-gray-600">
          Import OEM XML documents and map them to manual structures
        </p>
      </div>

      <Tabs defaultValue="upload" className="space-y-6">
        <TabsList>
          <TabsTrigger value="upload">Upload File</TabsTrigger>
          <TabsTrigger value="content">Direct Input</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload XML File
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="xmlFile">XML Document</Label>
                <Input
                  id="xmlFile"
                  type="file"
                  accept=".xml,.xsd"
                  onChange={handleFileChange}
                  disabled={loading}
                />
                <p className="text-sm text-gray-500 mt-1">
                  Upload XML document file (.xml) or XSD schema (.xsd)
                </p>
              </div>

              {file && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-green-800">
                    Selected: {file.name} ({Math.round(file.size / 1024)} KB)
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content" className="space-y-6">
          < Card >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                XML Content Input
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="xmlContent">XML Content</Label>
                  <Textarea
                    id="xmlContent"
                    placeholder="Paste XML content here..."
                    value={xmlContent}
                    onChange={handleXmlContentChange}
                    disabled={loading}
                    className="min-h-[300px] font-mono text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* XSD Schema */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              XSD Schema (Optional)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="xsdContent">XSD Schema Content</Label>
              <Textarea
                id="xsdContent"
                placeholder="Paste XSD schema here for validation..."
                value={xsdContent}
                onChange={(e) => setXsdContent(e.target.value)}
                disabled={loading}
                className="min-h-[200px] font-mono text-sm"
              />
              <p className="text-sm text-gray-500 mt-1">
                Optional XSD schema for XML validation
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Import Options */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Import Options
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="createNewManual"
                  checked={importOptions.createNewManual}
                  OnCheckedChange={(checked) => 
                    setImportOptions(prev => ({ ...prev, createNewManual: !!checked }))
                  }
                />
                <Label htmlFor="createNewManual">
                  Create new manual from XML
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="overwriteExistingBlocks"
                  checked={importOptions.overwriteExistingBlocks}
                  onCheckedChange={(checked) => 
                    setImportOptions(prev => ({ ...prev, overwriteExistingBlocks: !!checked }))
                  }
                />
                <Label htmlFor="overwriteExistingBlocks">
                  Overwrite existing blocks with same IDs
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="validateAgainstXsd"
                  checked={importOptions.validateAgainstXsd}
                  onCheckedChange={(checked) => 
                    setImportOptions(prev => ({ ...prev, validateAgainstXsd: !!checked }))
                  }
                />
                <Label htmlFor="validateAgainstXsd">
                  Validate XML against XSD schema
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="generateDefaultMappings"
                  checked={importOptions.generateDefaultMappings}
                  onCheckedChange={(checked) => 
                    setImportOptions(prev => ({ ...prev, generateDefaultMappings: !!checked }))
                  }
                />
                <Label htmlFor="generateDefaultMappings">
                  Generate default element mappings
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Import Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleImport}
            disabled={loading}
            className="min-w-[120px]"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import XML
              </>
            )}
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Import Result */}
        {importResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Result.status === 'VALIDATION_SUCCESS' ? 
                  <CheckCircle className="h-5 w-5 text-green-600" /> :
                  <AlertCircle className="h-5 w-5 text-red-600" />
                }
                Import Result
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant={importResult.status === 'VALIDATION_SUCCESS' ? 'default' : 'destructive'}>
                    {importResult.status}
                  </Badge>
                  <span className="text-sm text-gray-600">
                    File: {importResult.fileName}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Document ID:</span>
                    <span className="ml-2 font-mono">{importResult.id}</span>
                  </div>
                  <div>
                    <span className="font-medium">Mappings Generated:</span>
                    <span className="ml-2">{importResult.mappingsGenerated}</span>
                  </div>
                </div>

                {importResult.parsedXml && (
                  <div>
                    <h4 className="font-medium mb-2">Parsed Structure:</h4>
                    <div className="bg-gray-50 p-3 rounded text-sm font-мono overflow-x-auto">
                      <pre>{JSON.stringify(importResult.parsedXml, null, 2)}</pre>
                    </div>
                  </div>
                )}

                {importResult.status === 'VALIDATION_SUCCESS' && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      View Mappings
                    </Button>
                    <Button variant="outline" size="sm">
                      Create Manual
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                Validation Errors ({validationErrors.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {validationErrors.map((error, index) => (
                  <div key={index} className="p-3 border border-red-200 bg-red-50 rounded">
                    <div className="flex items-center gap-2">
                      <Badge variant={error.severity === 'ERROR' ? 'destructive' : 'secondary'}>
                        {error.severity}
                      </Badge>
                      <span className="text-sm font-medium">
                        Line {error.line}, Column {error.column}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{error.message}</p>
                    {error.code && (
                      <p className="text-xs text-gray-500">Code: {error.code}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </Tabs>
    </div>
  );
}






