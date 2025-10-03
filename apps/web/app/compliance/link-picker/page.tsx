'use client';

import React, { useState, useEffect } from 'react';
import { Search, Link, CheckCircle, AlertTriangle, BookOpen, Filter } from 'lucide-react';

interface RegulationItem {
  id: string;
  reference: string;
  title: string;
  category: 'OPERATIONAL' | 'SAFETY' | 'MAINTENANCE' | 'TRAINING' | 'EQUIPMENT' | 'DOCUMENTATION' | 'OTHER';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  regulationLibrary: {
    source: string;
    region: string;
    version: string;
    title: string;
  };
}

interface SuggestedLink {
  regulationItem: RegulationItem;
  matchReason: string;
  confidence: number;
  suggestedLinkType: 'DIRECT' | 'INDIRECT' | 'REQUIREMENT' | 'REFERENCE';
}

interface ComplianceLinkPickerProps {
  blockId: string;
  onLinkCreated: (linkData: any) => void;
  onClose: () => void;
}

export default function ComplianceLinkPicker({ blockId, onLinkCreated, onClose }: ComplianceLinkPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLibrary, setSelectedLibrary] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [selectedLinkType, setSelectedLinkType] = useState('REQUIREMENT');
  const [selectedRelationship, setSelectedRelationship] = useState('COMPLIES_WITH');
  const [confidence, setConfidence] = useState(80);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [regulations, setRegulations] = useState<RegulationItem[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedLink[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);

  // Mock regulation data
  useEffect(() => {
    const mockRegulations: RegulationItem[] = [
      {
        id: 'reg-1',
        reference: 'EASA Part-ML.1',
        title: 'Certification of Aircraft Maintenance Personnel',
        category: 'MAINTENANCE',
        priority: 'CRITICAL',
        regulationLibrary: {
          source: 'EASA',
          region: 'EU',
          version: '2024.1',
          title: 'EASA Part-ML',
        },
      },
      {
        id: 'reg-2',
        reference: 'FAR 121.445',
        title: 'Aircraft Maintenance Program',
        category: 'MAINTENANCE',
        priority: 'HIGH',
        regulationLibrary: {
          source: 'FAA',
          region: 'US',
          version: '2024.1',
          title: 'FAA Part 121',
        },
      },
      {
        id: 'reg-3',
        reference: 'AMC1 OP.MLR.100',
        title: 'Accepted Means of Compliance for Maintenance',
        category: 'SAFETY',
        priority: 'CRITICAL',
        regulationLibrary: {
          source: 'EASA',
          region: 'EU',
          version: '2024.1',
          title: 'EASA Part-ML AMC',
        },
      },
    ];
    setRegulations(mockRegulations);

    // Mock suggestions
    setTimeout(() => {
      setSuggestions([
        {
          regulationItem: mockRegulations[0],
          matchReason: 'Contains keywords: maintenance, aircraft',
          confidence: 85,
          suggestedLinkType: 'REQUIREMENT',
        },
        {
          regulationItem: mockRegulations[1],
          matchReason: 'Similar content structure',
          confidence: 72,
          suggestedLinkType: 'DIRECT',
        },
        {
          regulationItem: mockRegulations[2],
          matchReason: 'Safety-related content match',
          confidence: 68,
          suggestedLinkType: 'IMPLEMENTATION',
        },
      ]);
    }, 1000);

  }, [blockId]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);

    // Mock search - in production, this would call the API
    setTimeout(() => {
      const filteredRegulations = regulations.filter(regulation =>
        regulation.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        regulation.reference.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setRegulations(filteredRegulations);
      setLoading(false);
    }, 500);
  };

  const handleCreateLink = async (regulationItem: RegulationItem, suggestedType?: string, suggestedConfidence?: number) => {
    const linkData = {
      blockId,
      regulationItemId: regulationItem.id,
      linkType: suggestedType || selectedLinkType,
      relationship: selectedRelationship,
      confidence: suggestedConfidence || confidence,
      notes: notes.trim() || undefined,
    };

    setLoading(true);

    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      onLinkCreated(linkData);
      onClose();
    } catch (error) {
      console.error('Failed to create compliance link:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredRegulations = regulations.filter(regulation => {
    let matches = true;

    if (selectedLibrary && !regulation.regulationLibrary.source.toLowerCase().includes(selectedLibrary.toLowerCase())) {
      matches = false;
    }

    if (selectedCategory && regulation.category !== selectedCategory) {
      matches = false;
    }

    if (selectedPriority && regulation.priority !== selectedPriority) {
      matches = false;
    }

    return matches;
  });

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      MAINTENANCE: 'bg-blue-100 text-blue-800',
      SAFETY: 'bg-red-100 text-red-800',
      OPERATIONAL: 'bg-green-100 text-green-800',
      TRAINING: 'bg-purple-100 text-purple-800',
      EQUIPMENT: 'bg-yellow-100 text-yellow-800',
      DOCUMENTATION: 'bg-gray-100 text-gray-800',
      OTHER: 'bg-orange-100 text-orange-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      CRITICAL: 'bg-red-100 text-red-800',
      HIGH: 'bg-orange-100 text-orange-800',
      MEDIUM: 'bg-yellow-100 text-yellow-800',
      LOW: 'bg-green-100 text-green-800',
    };
    return colors[priority] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Create Compliance Link</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div>
            {showSuggestions && suggestions.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Suggestions</h3>
                <div className="space-y-3">
                  {suggestions.map((suggestion, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="font-medium text-gray-900">{suggestion.regulationItem.reference}</span>
                            <span className={`px-2 py-1 text-xs rounded ${getCategoryColor(suggestion.regulationItem.category)}`}>
                              {suggestion.regulationItem.category}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{suggestion.regulationItem.title}</p>
                          <p className="text-xs text-blue-600 mb-3">{suggestion.matchReason}</p>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500">Confidence:</span>
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${suggestion.confidence}%` }}
                              ></div>
                            </div>
                            <span className="text-xs text-gray-700">{suggestion.confidence}%</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCreateLink(
                          suggestion.regulationItem,
                          suggestion.suggestedLinkType,
                          suggestion.confidence
                        )}
                        disabled={loading}
                        className="w-full mt-3 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {loading ? 'Creating...' : 'Use Suggestion'}
                      </button>
                    </div>
                  ))}
                </div>
                
                <button
                  onClick={() => setShowSuggestions(false)}
                  className="w-full mt-4 px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50"
                >
                  Browse All Regulations Instead
                </button>
              </div>
            )}

            <h3 className="text-lg font-semibold text-gray-900 mb-4">Search Regulations</h3>
            
            {/* Search and Filters */}
            <div className="space-y-4 mb-6">
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Search regulations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <select
                  value={selectedLibrary}
                  onChange={(e) => setSelectedLibrary(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">All Sources</option>
                  <option value="easa">EASA</option>
                  <option value="faa">FAA</option>
                  <option value="icao">ICAO</option>
                </select>

                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">All Categories</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="SAFETY">Safety</option>
                  <option value="OPERATIONAL">Operational</option>
                  <option value="TRAINING">Training</option>
                  <option value="EQUIPMENT">Equipment</option>
                  <option value="DOCUMENTATION">Documentation</option>
                </select>

                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">All Priorities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>

            {/* Regulations List */}
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                filteredRegulations.map((regulation) => (
                  <div key={regulation.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="font-medium text-gray-900">{regulation.reference}</span>
                          <span className={`px-2 py-1 text-xs rounded ${getCategoryColor(regulation.category)}`}>
                            {regulation.category}
                          </span>
                          <span className={`px-2 py-1 text-xs rounded ${getPriorityColor(regulation.priority)}`}>
                            {regulation.priority}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{regulation.title}</p>
                        <p className="text-xs text-gray-500">
                          {regulation.regulationLibrary.source} • {regulation.regulationLibrary.region} • v{regulation.regulationLibrary.version}
                        </p>
                      </div>
                      <button
                        onClick={() => handleCreateLink(regulation)}
                        disabled={loading}
                        className="px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        Link
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Link Configuration</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Link Type</label>
                <select
                  value={selectedLinkType}
                  onChange={(e) => setSelectedLinkType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="DIRECT">Direct</option>
                  <option value="INDIRECT">Indirect</option>
                  <option value="REQUIREMENT">Requirement</option>
                  <option value="REFERENCE">Reference</option>
                  <option value="IMPLEMENTATION">Implementation</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Relationship</label>
                <select
                  value={selectedRelationship}
                  onChange={(e) => setSelectedRelationship(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="COMPLIES_WITH">Complies With</option>
                  <option value="IMPLEMENTS">Implements</option>
                  <option value="REFERENCES">References</option>
                  <option value="CONTRAVENES">Controvers</option>
                  <option value="RELATED_TO">Related To</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confidence Score: {confidence}%
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={confidence}
                  onChange={(e) => setConfidence(parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes (Optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Add any additional notes about this compliance link..."
                ></textarea>
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <CheckCircle className="h-4 w-4" />
                  <span>This link will be marked as DRAFT until reviewed</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
