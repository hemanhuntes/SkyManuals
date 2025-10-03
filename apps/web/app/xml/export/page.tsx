'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Download, 
  FileText, 
  AlertCircle, 
  CheckCircle, 
  FileCode, 
  Settings,
  Loader2,
  Copy,
  Eye
} from 'lucide-react';

interface Manual {
  id: string;
  title: string;
  version: string;
  status: string;
  lastModified: string;
}

interface XmlExportRequest {
  manualId: string;
  xmlTemplateId?: string;
  xmlMappingId?: string;
  xmlVersion?: string;
  formatOptions: {
    indented: boolean;
    includeMetadata: boolean;
    includeComments: boolean;
    collapseEmptyElements: boolean;
  };
  targetElement?: string;
}

export default function XmlExportPage() {
  const [selectedManual, setSelectedManual] = useState<string>('');
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [loadingManuals, setLoadingManuals] = useState(true);
  
  const [templateId, setTemplateId] = useState<string>('');
  const [templateOptions, setTemplateOptions] = useState<Array<{id: string, name: string}>>([]);
  
  const [mappingId, setMappingId] = useState<string>('');
  const [mappingOptions, setMappingOptions] = useState<Array<{id: string, name: string}>>([]);
  
  const [xmlVersion, setXmlVersion] = useState('1.0');
  const [targetElement, setTargetElement] = useState('');
  
  const [formatOptions, setFormatOptions] = useState({
    indented: true,
    includeMetadata: true,
    includeComments: false,
    collapseEmptyElements: false,
  });
  
  const [loading, setLoading] = useState(false);
  const [exportResult, setExportResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Load manuals on component mount
  useEffect(() => {
    loadManuals();
    loadTemplates();
  }, []);

  const loadManuals = async () => {
    try {
      setLoadingManuals(true);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockedManuals: Manual[] = [
        { id: 'manual-1', title: 'Boeing 737 Pilots Manual v2.1', version: '2.1.0', status: 'PUBLISHED', lastModified: '2024-01-15T10:30:00Z' },
        { id: 'manual-2', title: 'Boeing 777 Systems Manual v1 that contains data', version: '1.8.2', status: 'DRAFT', lastModified: '2024-01-20T14:20:00Z' },
        { id: 'manual-3', title: 'Airbus A320 Maintenance Guide v3.4', version: '3.4.0', status: 'PUBLISHED', lastModified: '2024-01-18T09:15:00Z' },
      ];
      
      setManuals(mockedManuals);
    } catch (err) {
      setError('Failed to load manuals');
    } finally {
      setLoadingManuals(false);
    }
  };

  const loadTemplates = async () => {
    try {
      // Simulate loading XML templates and mappings
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setTemplateOptions([
        { id: 'template-xml-v1', name: 'Standard OEM XML v1.0' },
        { id: 'template-xml-v2', name: 'Enhanced OEM XML v2.0' },
        { id: 'template-custom-v1', name: 'Custom Aircraft XML v1.0' },
      ]);
      
      setMappingOptions([
        { id: 'mapping-standard', name: 'Standard Manual Mapping' },
        { id: 'mapping-aviation', name: 'Aviation Manual Mapping' },
        { id: 'mapping-maintenance', name: 'Maintenance Manual Mapping' },
      ]);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  const handleExport = async () => {
    if (!selectedManual) {
      setError('Please select a manual to export');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Simulate export request
      const exportRequest: XmlExportRequest = {
        manualId: selectedManual,
        xmlTemplateId: templateId || undefined,
        xmlMappingId: mappingId || undefined,
        xmlVersion,
        formatOptions,
        targetElement: targetElement || undefined,
      };

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Mock result
      const result = {
        id: 'export-job-123',
        manualId: selectedManual,
        fileName: `${selectedManual}-export.xml`,
        xmlContent: `<Manual xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
  xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
  xsi:schemaLocation="http://company.com/schema manual.xsd">
  
  <!-- Generated from manual v2.1.0 -->
  <Metadata>
    <Title>${manuals.find(m => m.id === selectedManual)?.title}</Title>
    <Version>${xmlVersion}</Version>
    <ExportedAt>${new Date.isoString()}</ExportedAt>
    <OrganizationId>org-123</OrganizationId>
  </Metadata>
  
  <Chapters>
    <Chapter id="ch01">
      <Number>01</Number>
      <Title>Preliminary Information</Title>
      <Sections>
        <Section id="sec01-01">
          <Number>01-01</Number>
          <Title>General Information</Title>
          <Blocks>
            <Block id="blk01-01-01" type="paragraph">
              <Content>
                <p>This manual contains essential information for aircraft operation and safety.</p>
              </Content>
            </Block>
            <Block id="blk01-01-02" type="warning">
              <Content>
                <div class="warning">
                  <strong>WARNING:</strong> Always follow safety procedures before operation.
                </div>
              </Content>
            </Block>
          </Blocks>
        </Section>
      </Sections>
    </Chapter>
  </Chapters>
</Manual>`,
        validationStatus: 'VALID',
        warnings: [
          'Some blocks have empty content and will be collapsed',
          'Metadata comments include only basic information'
        ],
        statistics: {
          chaptersExported: 1,
          sectionsExported: 1,
          blocksExported: 2,
          attachmentsReferenced: 3,
        }
      };

      setExportResult(result);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export XML');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyXml = () => {
    if (exportResult?.xmlContent) {
      navigator.clipboard.writeText(exportResult.xmlContent);
      // You could add a toast notification here
    }
  };

  const handleDownloadXml = () => {
    if (exportResult?.xmlContent) {
      const blob = new Blob([exportResult.xmlContent], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportResult.fileName || 'manual-export.xml';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          XML Export
        </h1>
        <p className="text-gray-600">
          Export manual content as OEM XML format
        </p>
      </div>

      <Tabs defaultValue="config" className="space-y-6">
        <TabsList>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="xml" disabled={!exportResult}>Generated XML</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-6">
          {/* Manual Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Select Manual
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="manualSelect">Manual to Export</Label>
                  <Select 
                    value={selectedManual} 
                    onValueChange={setSelectedManual}
                    disabled={loadingManuals || loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={
                        loadingManuals ? "Loading manuals..." : "Choose a manual"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {manuals.map((manual) => (
                        <SelectItem key={manual.id} value={manual.id}>
                          <div className="flex items-center gap-2">
                            <span>{manual.title}</span>
                            <Badge 
                              variant={manual.status === 'PUBLISHED' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {manual.status}
                            </Badge>
                          </div>
                        </SelectItem>;
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedManual && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div>
                      <span className="text-green-800 font-medium">
                        {manuals.find(m => m.id === selectedManual)?.title}
                      </span>
                      <div className="text-sm text-green-700">
                        Version: {manuals.find(m => m.id === selectedManual)?.version} • 
                        Last Modified: {new Date(manuals.find(m => m.id === selectedManual)?.lastModified!).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* XML Template Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5" />
                XML Template
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="templateSelect">XML Template (Optional)</Label>
                  <Select 
                    value={templateId} 
                    onValueChange={setTemplateId}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose XML template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No template (default)</SelectItem>
                      {templateOptions.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>;
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-500 mt-1">
                    Select a template to define the XML structure and namespace
                  </p>
                </div>

                <div>
                  <Label htmlFor="xmlVersion">XML Version</Label>
                  <Select 
                    value={xmlVersion} 
                    onValueChange={setXmlVersion}
                    disabled={loading}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1.0">1.0</SelectItem>
                      <SelectItem value="1.1">1.1</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mapping Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Mapping Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="mappingSelect">Element Mapping</Label>
                  <Select 
                    value={mappingId} 
                    onValueChange={setMappingId}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose element mapping" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Auto-generate mapping</SelectItem>
                      {mappingOptions.map((mapping) => (
                        <SelectItem key={mapping.id} value={mapping.id}>
                          {mapping.name}
                        </SelectItem>;
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-500 mt-1">
                    Define how manual elements map to XML elements
                  </p>
                </div>

                <div>
                  <Label htmlFor="targetElement">Target Element (Optional)</Label>
                  <input
                    id="targetElement"
                    type="text"
                    placeholder="e.g., Manual, Chapter, Section"
                    value={targetElement}
                    onChange={(e) => setTargetElement(e.target.value)}
                    disabled={loading}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Specific XML element to generate (leave empty for full manual)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Format Options */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Format Options
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="indented"
                    checked={formatOptions.indented}
                    onCheckedChange={(checked) => 
                      setFormatOptions(prev => ({ ...prev, indented: !!checked }))
                    }
                  />
                  <Label htmlFor="indented">
                    Format with indentation and line breaks
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeMetadata"
                    checked={formatOptions.includeMetadata}
                    onCheckedChange={(checked) => 
                      setFormatOptions(prev => ({ ...prev, includeMetadata: !!checked }))
                    }
                  />
                  <Label htmlFor="includeMetadata">
                    Include metadata (title, version, export timestamp)
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeComments"
                    checked={formatOptions.includeComments}
                    onCheckedChange={(checked) => 
                      setFormatOptions(prev => ({ ...prev, includeComments: !!checked }))
                    }
                  />
                  <Label htmlFor="includeComments">
                    Include comments and annotations
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="collapseEmptyElements"
                    checked={formatOptions.collapseEmptyElements}
                    onCheckedChange={(checked) => 
                      setFormatOptions(prev => ({ ...prev, collapseEmptyElements: !!checked }))
                    }
                  />
                  <Label htmlFor="collapseEmptyElements">
                    Collapse empty elements to self-closing tags
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Export Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleExport}
              disabled={loading || !selectedManual}
              className="min-w-[120px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export XML
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
        </TabsContent>

        <TabsContent value="xml" className="space-y-6">
          {/* Export Result */}
          {exportResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Export Complete
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge variant={exportResult.validationStatus === 'VALID' ? 'default' : 'destructive'}>
                      {exportResult.validationStatus}
                    </Badge>
                    <span className="text-sm text-gray-600">
                      File: {exportResult.fileName}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Export Job ID:</span>
                      <span className="ml-2 font-mono text-xs">{exportResult.id}</span>
                    </div>
                    <div>
                      <span className="font-medium">Manual ID:</span>
                      <span className="ml-2 font-mono text-xs">{exportResult.manualId}</span>
                    </div>
                  </div>

                  {/* Statistics */}
                  <div className="bg-gray-50 p-4 rounded">
                    <h4 className="font-medium mb-2">Export Statistics:</h4>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div className="text-center">
                        <div className="text-xl font-bold text-blue-600">{exportResult.statistics.chaptersExported}</div>
                        <div className="text-gray-600">Chapters</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-green-600">{exportResult.statistics.sectionsExportd}</div>
                        <div className="text-gray-600">Sections</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-purple-600">{exportResult.statistics.blocksExported}</div>
                        <div className="text-gray-600">Blocks</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-orange-600">{exportResult.statistics.attachmentsReferenced}</div>
                        <div className="text-gray-600">Attachments</div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button onClick={handleDownloadXml} size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Download XML
                    </Button>
                    <Button onClick={handleCopyXml} variant="outline" size="sm">
                      <Copy className="h-4 w-4 mr-2" />
                      Copy XML
                    </Button>
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4 mr-2" />
                      Validate XML
                    </Button>
                  </div>

                  {/* Warnings */}
                  {exportResult.warnings?.length > 0 && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="space-y-1">
                          {exportResult.warnings.map((warning: string, index: number) => (
                            <div key={index} className="text-sm">• {warning}</div>
                          ))}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* XML Content Display */}
          {exportResult?.xmlContent && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCode className="h-5 w-5" />
                  Generated XML Content
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Textarea
                    value={exportResult.xmlContent}
                    readOnly
                    className="min-h-[400px] font-mono text-sm"
                  />
                  
                  <div className="flex justify-center">
                    <Button onClick={handleDownloadXml} variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      Download XML File
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
