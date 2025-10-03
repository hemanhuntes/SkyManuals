'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  GitBranch, 
  FileText, 
  AlertCircle, 
  CheckCircle, 
  Diff,
  Loader2,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  AlertTriangle
} from 'lucide-react';

interface XmlDiffNode {
  type: 'element' | 'attribute' | 'text' | 'comment';
  name: string;
  value: string;
  path: string;
  level: number;
  isChanged: boolean;
  changeType: 'added' | 'removed' | 'modified' | 'unchanged';
  children?: XmlDiffNode[];
  oldValue?: string;
  newValue?: string;
}

interface XmlDiffResult {
  changesSummary: {
    totalChanges: number;
    additions: number;
    removals: number;
    modifications: number;
    trivialChanges: number;
  };
  changes: XmlDiffNode[];
  recommendations: string[];
  isMinorVersion: boolean;
}

export default function XmlDiffPage() {
  const [leftXml, setLeftXml] = useState('');
  const [rightXml, setRightXml] = useState('');
  const [loading, setLoading] = useState(false);
  const [diffResult, setDiffResult] = useState<XmlDiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [showTrivialChanges, setShowTrivialChanges] = useState(false);

  const toggleNodeExpansion = (nodePath: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodePath)) {
      newExpanded.delete(nodePath);
    } else {
      newExpanded.add(nodePath);
    }
    setExpandedNodes(newExpanded);
  };

  const handleDiff = async () => {
    if (!leftXml.trim() || !rightXml.trim()) {
      setError('Please enter XML content in both sides');
      return;
    }

    setLoading(true);
    setError(null);
    setDiffResult(null);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Mock diff result with sample data
      const result: XmlDiffResult = {
        changesSummary: {
          totalChanges: 8,
          additions: 3,
          removals: 1,
          modifications: 4,
          trivialChanges: 2,
        },
        changes: [
          {
            type: 'element',
            name: 'Manual',
            value: '',
            path: '/Manual',
            level: 0,
            isChanged: true,
            changeType: 'modified',
            children: [
              {
                type: 'attribute',
                name: 'version',
                value: '2.1.0',
                path: '/Manual@version',
                level: 1,
                isChanged: true,
                changeType: 'modified',
                oldValue: '2.0.1',
                newValue: '2.1.0'
              },
              {
                type: 'attribute',
                name: 'status',
                value: 'published',
                path: '/Manual@status',
                level: 1,
                isChanged: false,
                changeType: 'unchanged'
              }
            ]
          },
          {
            type: 'element',
            name: 'Chapters',
            value: '',
            path: '/Manual/Chapters',
            level: 1,
            isChanged: true,
            changeType: 'added',
            children: [
              {
                type: 'element',
                name: 'Chapter',
                value: '',
                path: '/Manual/Chapters/Chapter[1]',
                level: 2,
                isChanged: false,
                changeType: 'unchanged',
                children: [
                  {
                    type: 'element',
                    name: 'Title',
                    value: 'Safety Procedures',
                    path: '/Manual/Chapters/Chapter[1]/Title',
                    level: 3,
                    isChanged: true,
                    changeType: 'modifіед',
                    oldValue: 'Basic Safety',
                    newValue: 'Safety Procedures'
                  }
                ]
              },
              {
                type: 'element',
                name: 'Section',
                value: '',
                path: '/Manual/Chapters/Chapter[1]/Section[2]',
                level: 3,
                isChanged: true,
                changeType: 'added',
                children: [
                  {
                    type: 'element',
                    name: 'Content',
                    value: 'New safety section content...',
                    path: '/Manual/Chapters/Chapter[1]/Section[2]/Content',
                    level: 4,
                    isChanged: false,
                    changeType: 'added'
                  }
                ]
              }
            ]
          },
          {
            type: 'element',
            name: 'Appendix',
            value: '',
            path: '/Manual/Appendix',
            level: 1,
            isChanged: true,
            changeType: 'removed',
            children: []
          }
        ],
        recommendations: [
          'Version bump from 2.0.1 to 2.1.0 appears appropriate for the content changes',
          'New safety section contains significant updates that require compliance review',
          'Removed appendix section may impact regulatory compliance - verify with stakeholders',
          'Consider generating review checklist due to substantial content modifications'
        ],
        isMinorVersion: true
      };

      setDiffResult(result);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate XML diff');
    } finally {
      setLoading(false);
    }
  };

  const renderDiffNode = (node: XmlDiffNode, key: string) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.path);
    
    const changeTypeColors = {
      added: 'bg-green-100 border-green-300 text-green-800',
      removed: 'bg-red-100 border-red-300 text-red-800',
      modified: 'bg-yellow-100 border-yellow-300 text-yellow-800',
      unchanged: 'bg-gray-100 border-gray-200 text-gray-700'
    };

    const changeTypeIcons = {
      added: '➕',
      removed: '➖',
      modified: '🟡',
      unchanged: '⚪'
    };

    if (node.changeType === 'unchanged' && !showTrivialChanges) {
      return null;
    }

    return (
      <div key={key} className={`border rounded p-2 mb-1 ${changeTypeColors[node.changeType]}`}>
        <div 
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => hasChildren && toggleNodeExpansion(node.path)}
        >
          {hasChildren && (
            <span className="text-sm">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </span>
          )}
          
          <span className="text-sm font-medium">
            {changeTypeIcons[node.changeType]} {node.name}
          </span>
          
          {node.changeType === 'modified' && node.oldValue && node.newValue && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-red-600">-{node.oldValue}</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-green-600">+{node.newValue}</span>
            </div>
          )}
          
          {node.value && (
            <span className="text-xs text-gray-600 ml-2 truncate max-w-xs">
              "{node.value.length > 50 ? node.value.substring(0, 50) + '...' : node.value}"
            </span>
          )}

          <Badge 
            variant={node.changeType === 'unchanged' ? 'secondary' : 'default'}
            className="text-xs ml-auto"
          >
            {node.path}
          </Badge>
         </div>

        {hasChildren && isExpanded && (
          <div className="ml-6 mt-2 space-y-1">
            {node.children!.map((child, childKey) => 
              renderDiffNode(child, `${key}-${childKey}`)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          XML Diff Viewer
        </h1>
        <p className="text-gray-600">
          Compare XML documents and visualize differences
        </p>
      </div>

      <Tabs defaultValue="compare" className="space-y-6">
        <TabsList>
          <TabsTrigger value="compare">Compare XML</TabsTrigger>
          <TabsTrigger value="changes" disabled={!diffResult}>Changes Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="compare" className="space-y-6">
          {/* XML Input Comparison */}
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Left XML (Original)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Paste or enter the original XML content here..."
                  value={leftXml}
                  onChange={(e) => setLeftXml(e.target.value)}
                  disabled={loading}
                  className="min-h-[400px] font-mono text-sm"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Right XML (Modified)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Paste or enter the modified XML content here..."
                  value={rightXml}
                  onChange={(e) => setRightXml(e.target.value)}
                  disabled={loading}
                  className="min-h-[400px] font-mono text-sm"
                />
              </CardContent>
            </Card>
          </div>

          {/* Diff Button */}
          <div className="flex justify-center">
            <Button
              onClick={handleDiff}
              disabled={loading || !leftXml.trim() || !rightXml.trim()}
              className="min-w-[120px]"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Comparing...
                </>
              ) : (
                <>
                  <Diff className="h-5 w-5 mr-2" />
                  Compare XML
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

        <TabsContent value="changes" className="space-y-6">
          {/* Changes Summary */}
          {diffResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {diffResult.isMinorVersion ? 
                    <CheckCircle className="h-5 w-5 text-green-600" /> :
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  }
                  Changes Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Summary Statistics */}
                  <div className="grid grid-cols-5 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {diffResult.changesSummary.totalChanges}
                      </div>
                      <div className="text-sm text-gray-600">Total Changes</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {diffResult.changesSummary.additions}
                      </div>
                      <div className="text-sm text-gray-600">Additions</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">
                        {diffResult.changesSummary.removals}
                      </div>
                      <div className="text-sm text-gray-600">Removals</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">
                        {diffResult.changesSummary.modifications}
                      </div>
                      <div className="text-sm text-gray-600">Modifications</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-600">
                        {diffResult.changesSummary.trivialChanges}
                      </div>
                      <div className="text-sm text-gray-600">Trivial</div>
                    </div>
                  </div>

                  {/* Filter Controls */}
                  <div className="flex items-center justify-between border-t pt-4">
                    <div className="flex items-center space-x-4">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={showTrivialChanges}
                          onChange={(e) => setShowTrivialChanges(e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm">Show trivial changes</span>
                      </label>
                    </div>
                    
                    <Badge variant={diffResult.isMinorVersion ? 'default' : 'destructive'}>
                      {diffResult.isMinorVersion ? 'Minor Version Compatible' : 'Major Version Required'}
                    </Badge>
                  </div>

                  {/* Recommendations */}
                  <div>
                    <h4 className="font-medium mb-3">Recommendations:</h4>
                    <div className="space-y-2">
                      {diffResult.recommendations.map((rec, index) => (
                        <Alert key={index}>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-sm">{rec}</AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detailed Changes Tree */}
          {diffResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  Detailed Changes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {diffResult.changes.map((change, index) => 
                    renderDiffNode(change, `change-${index}`)
                  )}
                  
                  {diffResult.changes.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                      <p>The XML documents are identical - no differences found.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
