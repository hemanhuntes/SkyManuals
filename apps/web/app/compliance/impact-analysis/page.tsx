'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, TrendingUp, Clock, CheckCircle, FileText, Users } from 'lucide-react';

interface ImpactAnalysisData {
  id: string;
  triggerType: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REQUIRES_REVIEW';
  regulationLibrary: {
    title: string;
    source: string;
    region: string;
    oldVersion: string | null;
    newVersion: string;
  };
  results: {
    affectedParagraphs: number;
    newRequirements: number;
    modifiedRequirements: number;
    obsoleteRequirements: number;
    conflictCount: number;
    riskAssessment: {
      highRisk: number;
      mediumRisk: number;
      lowRisk: number;
    };
    estimatedEffort: {
      hours: number;
      timeline: string;
    };
  };
  recommendations: Array<{
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    action: string;
    responsible: string;
    deadline: string;
    estimatedEffort: string | null;
  }>;
  createdAt: string;
}

export default function ImpactAnalysisPage() {
  const [analyses, setAnalyses] = useState<ImpactAnalysisData[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<ImpactAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);

  // Mock data fetch
  useEffect(() => {
    setTimeout(() => {
      const mockAnalyzes: ImpactAnalysisData[] = [
        {
          id: 'analysis-1',
          triggerType: 'REGULATION_UPDATE',
          status: 'COMPLETED',
          regulationLibrary: {
            title: 'EASA Part-ML',
            source: 'EASA',
            region: 'EU',
            oldVersion: '2023.12',
            newVersion: '2024.01',
          },
          results: {
            affectedParagraphs: 145,
            newRequirements: 8,
            modifiedRequirements: 12,
            obsoleteRequirements: 3,
            conflictCount: 5,
            riskAssessment: {
              highRisk: 3,
              mediumRisk: 2,
              lowRisk: 1,
            },
            estimatedEffort: {
              hours: 120,
              timeline: '3 weeks',
            },
          },
          recommendations: [
            {
              priority: 'CRITICAL',
              action: 'Immediate review of 3 high-risk compliance links',
              responsible: 'Safety Manager',
              deadline: '2024-03-15',
              estimatedEffort: '6 hours',
            },
            {
              priority: 'HIGH',
              action: 'Review and implement 8 new regulation requirements',
              responsible: 'Compliance Team Lead',
              deadline: '2024-03-30',
              estimatedEffort: '16 hours',
            },
            {
              priority: 'MEDIUM',
              action: 'Update 25 affected aircraft manuals',
              responsible: 'Technical Writing Team',
              deadline: '2024-04-30',
              estimatedEffort: '64 hours',
            },
          ],
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'analysis-2',
          triggerType: 'MANUAL_CHANGE',
          status: 'IN_PROGRESS',
          regulationLibrary: {
            title: 'FAA Part 121',
            source: 'FAA',
            region: 'US',
            oldVersion: '2023.11',
            newVersion: '2024.01',
          },
          results: {
            affectedParagraphs: 89,
            newRequirements: 5,
            modifiedRequirements: 8,
            obsoleteRequirements: 2,
            conflictCount: 3,
            riskAssessment: {
              highRisk: 2,
              mediumRisk: 1,
              lowRisk: 0,
            },
            estimatedEffort: {
              hours: 85,
              timeline: '2.5 weeks',
            },
          },
          recommendations: [
            {
              priority: 'CRITICAL',
              action: 'Resolve 3 compliance link conflicts',
              responsible: 'Regulatory Affairs Manager',
              deadline: '2024-03-10',
              estimatedEffort: '6 hours',
            },
            {
              priority: 'HIGH',
              action: 'Implement 5 new FAA requirements',
              responsible: 'Operations Manager',
              deadline: '2024-03-20',
              estimatedEffort: '10 hours',
            },
          ],
          createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        },
      ];

      setAnalyses(mockAnalyzes);
      setLoading(false);
    }, 1000);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'text-green-600 bg-green-100';
      case 'IN_PROGRESS': return 'text-blue-600 bg-blue-100';
      case 'REQUIRES_REVIEW': return 'text-yellow-600 bg-yellow-100';
      case 'PENDING': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return 'border-red-300 bg-red-50';
      case 'HIGH': return 'border-orange-300 bg-orange-50';
      case 'MEDIUM': return 'border-yellow-300 bg-yellow-50';
      case 'LOW': return 'border-green-300 bg-green-50';
      default: return 'border-gray-300 bg-gray-50';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'HIGH': return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case 'MEDIUM': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'LOW': return <CheckCircle className="h-4 w-4 text-green-600" />;
      default: return <CheckCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading impact analyses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Impact Analysis</h1>
            <p className="text-gray-600">Monitor regulatory updates and their impact on compliance</p>
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Run New Analysis
          </button>
        </div>
      </header>

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Analyses List */}
          <div className="lg:col-span-1">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Analyses</h2>
            <div className="space-y-4">
              {analyses.map((analysis) => (
                <div
                  key={analysis.id}
                  onClick={() => setSelectedAnalysis(analysis)}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedAnalysis?.id === analysis.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-900">{analysis.regulationLibrary.title}</h3>
                    <span className={`px-2 py-1 text-xs rounded ${getStatusColor(analysis.status)}`}>
                      {analysis.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {analysis.regulationLibrary.source} • v{analysis.oldVersion} → v{analysis.newVersion}
                  </p>
                  <p className="text-sm text-gray-500">
                    {analysis.results.affectedParagraphs} affected paragraphs
                    • {analysis.results.conflictCount} conflicts
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(analysis.createdAt).toLocaleDateString('sv-SE')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Analysis Details */}
          <div className="lg:col-span-2">
            {selectedAnalysis ? (
              <div className="space-y-6">
                {/* Analysis Header */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">
                      {selectedAnalysis.regulationLibrary.title} Impact Analysis
                    </h2>
                    <span className={`px-3 py-1 text-sm rounded ${getStatusColor(selectedAnalysis.status)}`}>
                      {selectedAnalysis.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <p><strong>Source:</strong> {selectedAnalysis.regulationLibrary.source} ({selectedAnalysis.regulationLibrary.region})</p>
                    <p><strong>Version Update:</strong> {selectedAnalysis.regulationLibrary.oldVersion} → {selectedAnalysis.regulationLibrary.newVersion}</p>
                    <p><strong>Analysis Date:</strong> {new Date(selectedAnalysis.createdAt).toLocaleDateString('sv-SE')}</p>
                  </div>
                </div>

                {/* Impact Summary */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Impact Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">{selectedAnalysis.results.affectedParagraphs}</div>
                      <div className="text-sm text-gray-600">Affected Paragraphs</div>
                    </div>
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{selectedAnalysis.results.newRequirements}</div>
                      <div className="text-sm text-gray-600">New Requirements</div>
                    </div>
                    <div className="text-center p-4 bg-yellow-50 rounded-lg">
                      <div className="text-2xl font-bold text-yellow-600">{selectedAnalysis.results.conflictCount}</div>
                      <div className="text-sm text-gray-600">Conflicts</div>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{selectedAnalysis.results.estimatedEffort.hours}</div>
                      <div className="text-sm text-gray-600">Hours</div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h4 className="font-medium text-gray-900 mb-3">Risk Assessment</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-3 bg-red-50 rounded-lg">
                        <div className="text-lg font-bold text-red-600">{selectedAnalysis.results.riskAssessment.highRisk}</div>
                        <div className="text-xs text-gray-600">High Risk</div>
                      </div>
                      <div className="text-center p-3 bg-yellow-50 rounded-lg">
                        <div className="text-lg font-bold text-yellow-600">{selectedAnalysis.results.riskAssessment.mediumRisk}</div>
                        <div className="text-xs text-gray-600">Medium Risk</div>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <div className="text-lg font-bold text-green-600">{selectedAnalysis.results.riskAssessment.lowRisk}</div>
                        <div className="text-xs text-gray-600">Low Risk</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recommendations */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Recommendations</h3>
                  <div className="space-y-4">
                    {selectedAnalysis.recommendations.map((recommendation, index) => (
                      <div
                        key={index}
                        className={`border-l-4 p-4 rounded ${getPriorityColor(recommendation.priority)}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3">
                            {getPriorityIcon(recommendation.priority)}
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900 mb-2">{recommendation.action}</h4>
                              <div className="text-sm text-gray-600 space-y-1">
                                <p><strong>Responsible:</strong> {recommendation.responsible}</p>
                                <p><strong>Deadline:</strong> {new Date(recommendation.deadline).toLocaleDateString('sv-SE')}</p>
                                {recommendation.estimatedEffort && (
                                  <p><strong>Effort:</strong> {recommendation.estimatedEffort}</p>
                                )}
                              </div>
                            </div>
                          </div>
                          <span className={`px-2 py-1 text-xs rounded ${getStatusColor(recommendation.assignedAt ? 'COMPLETED' : 'PENDING')}`}>
                            {recommendation.assignedAt ? 'Assigned' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-4">
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Export Report
                  </button>
                  <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    Create Tasks
                  </button>
                  <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                    Mark as Reviewed
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select an Analysis</h3>
                <p className="text-gray-500">Choose an impact analysis from the list to view detailed results.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}






