'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button, Editor } from '@skymanuals/ui';

interface ManualData {
  id: string;
  title: string;
  chapters: Array<{
    id: string;
    title: string;
    sections: Array<{
      id: string;
      title: string;
      status: 'DRAFT' | 'RELEASED';
    }>;
  }>;
}

interface ChangeSet {
  id: string;
  title: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'MERGED';
  authorId: string;
  createdAt: string;
}

export default function ManualEditorPage() {
  const params = useParams();
  const manualId = params.id as string;
  
  const [manual, setManual] = useState<ManualData | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [sectionContent, setSectionContent] = useState<any>(null);
  const [etag, setEtag] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(false);

  useEffect(() => {
    if (manualId) {
      loadManual();
    }
  }, [manualId]);

  const loadManual = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/manuals/${manualId}`);
      const data = await response.json();
      
      if (response.ok) {
        setManual(data.manual);
        setEtag(data.etag);
      } else {
        console.error('Failed to load manual:', data.error);
      }
    } catch (error) {
      console.error('Error loading manual:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSectionContent = async (sectionId: string) => {
    try {
      setLoading(true);
      setSelectedSection(sectionId);
      
      // In a real implementation, this would fetch the block content
      const mockContent = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Section Content' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'This is where the section content would be loaded...',
              },
            ],
          },
        ],
      };
      
      setSectionContent(mockContent);
    } catch (error) {
      console.error('Error loading section content:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveContent = async () => {
    if (!selectedSection || !sectionContent) return;

    try {
      setSaving(true);
      
      const response = await fetch(`/api/manuals/blocks/${selectedSection}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': etag,
          'x-user-id': 'current-user-id', // This would come from auth
        },
        body: JSON.stringify({ content: sectionContent }),
      });

      if (response.ok) {
        const data = await response.json();
        setEtag(data.etag);
        setPendingChanges(false);
        
        // Show success message
        alert('Changes saved successfully!');
      } else if (response.status === 409) {
        alert('Conflict detected! Someone else modified this content. Please refresh and try again.');
      } else {
        const error = await response.json();
        console.error('Save failed:', error);
        alert('Failed to save changes. Please try again.');
      }
    } catch (error) {
      console.error('Error saving content:', error);
      alert('Error saving changes. Please check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const insertSmartBlock = async (smartBlockType: string) => {
    if (!selectedSection) return;

    try {
      const response = await fetch(`/api/manuals/sections/${selectedSection}/blocks/smart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'current-user-id',
        },
        body: JSON.stringify({
          smartBlockType,
          position: sectionContent?.content?.length || 0,
        }),
      });

      if (response.ok) {
        alert(`${smartBlockType} block inserted successfully!`);
        // Refresh content
        loadSectionContent(selectedSection);
      }
    } catch (error) {
      console.error('Error inserting smart block:', error);
    }
  };

  if (loading || !manual) {
    return (
      <div className="container mx-auto py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4 w-1/3"></div>
          <div className="grid grid-cols-4 gap-6">
            <div className="space-y-3">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded"></div>
            </div>
            <div className="col-span-3">
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">{manual.title} - Editor</h1>
        <div className="flex gap-2">
          <Button 
            onClick={saveContent}
            disabled={!pendingChanges || saving}
            className="bg-green-600 hover:bg-green-700"
          >
            {saving ? 'Sparar...' : 'Spara ändringar'}
          </Button>
          <Button 
            onClick={() => navigator.location.reload()}
            variant="outline"
          >
            Ladda om
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {/* Table of Contents Sidebar */}
        <div className="border rounded-lg p-4 bg-gray-50">
          <h3 className="font-semibold mb-3">Kapitel</h3>
          {manual.chapters.map((chapter) => (
            <div key={chapter.id} className="mb-4">
              <h4 className="font-medium text-blue-600 cursor-pointer hover:text-blue-800">
                {chapter.title}
              </h4>
              <div className="ml-4 mt-2 space-y-1">
                {chapter.sections.map((section) => (
                  <div
                    key={section.id}
                    className={`cursor-pointer text-sm py-1 px-2 rounded transition-colors ${
                      selectedSection === section.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'hover:bg-gray-100'
                    }`}
                    onClick={() => loadSectionContent(section.id)}
                  >
                    <span className="text-gray-500">{section.status}</span>
                    <br />
                    {section.title}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Editor Area */}
        <div className="col-span-3">
          {selectedSection ? (
            <div className="space-y-4">
              {/* Smart Block Insertion */}
              <div className="flex gap-2 flex-wrap">
                <span className="text-sm text-gray-500 align-center py-1">
                  Infoga smart block:
                </span>
                {['LEP', 'MEL', 'ChangeLog', 'RevisionBar', 'CrossRef'].map((type) => (
                  <Button
                    key={type}
                    variant="outline"
                    size="sm"
                    onClick={() => insertSmartBlock(type)}
                  >
                    {type}
                  </Button>
                ))}
              </div>

              {/* Editor */}
              <Editor
                content={sectionContent}
                onChange={(content) => {
                  setSectionContent(content);
                  setPendingChanges(true);
                }}
                placeholder="Skriv sektion innehåll här..."
                className="min-h-[400px]"
              />

              {/* Revision Bar Preview */}
              {sectionContent && (
                <div className="border rounded-lg p-4 bg-yellow-50">
                  <h4 className="font-medium text-gray-700 mb-2">Revision Bar (Preview)</h4>
                  <div className="text-sm text-gray-600">
                    <div className="flex gap-2">
                      <span className="bg-green-100 px-2 py-1 rounded">0.1.0</span>
                      <span className="text-gray-400">|</span>
                      <span>Initial version</span>
                      <span className="text-gray-400">→</span>
                      <span className="bg-blue-100 px-2 py-1 rounded">DRAFT</span>
                      <span>Current changes</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <h3 className="text-lg text-gray-500 mb-2">Välj en sektion att redigera</h3>
              <p className="text-gray-400">
                Klicka på en sektion i verktygsfältet för att börja redigera innehållet.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Changes Indicator */}
      {pendingChanges && (
        <div className="fixed bottom-4 right-4 bg-orange-100 border border-orange-300 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-orange-700">Osparade ändringar</span>
          </div>
        </div>
      )}
    </div>
  );
}
