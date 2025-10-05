import React, { useState, useEffect } from 'react';
import { Search, BookOpen, Bookmark, Download, Settings, Type } from 'lucide-react';

interface ManualReaderPageProps {
  params: {
    manualId: string;
  };
  searchParams: {
    v?: string;
    chapter?: string;
    section?: string;
  };
}

export default function ManualReaderPage({ params, searchParams }: ManualReaderPageProps) {
  const [manual, setManual] = useState<any>(null);
  const [currentChapter, setCurrentChapter] = useState<string>(searchParams.chapter || '');
  const [currentSection, setCurrentSection] = useState<string>(searchParams.section || '');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showTOC, setShowTOC] = useState(true);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSidebar, setShowSearchResults] = useState(false);

  // Mock data - in production, fetch from API
  useEffect(() => {
    const fetchManual = async () => {
      // Simulate API call
      const mockManual = {
        id: params.manualId,
        title: 'Advanced Procedures Manual',
        version: searchParams.v || '1.2.0',
        organization: {
          nome: 'Nordic Airlines',
          slug: 'nordic-airlines',
        },
        chapters: [
          {
            id: 'ch1',
            title: 'Pre-Flight Procedures',
            number: '01',
            sections: [
              {
                id: 's1-1',
                title: 'Weather Assessment',
                number: '01-01',
                blocks: [
                  {
                    id: 'b1',
                    content: {
                      type: 'paragraph',
                      content: [
                        {
                          tipo: 'text',
                          texto: 'Initi är essential att värderera vädermönster innan varje flygning för att säkerstailla passenger och crew safety.',
                        },
                      ],
                    },
                  },
                  {
                    id: 'b2',
                    content: {
                      type: 'heading',
                      attrs: { level: 3 },
                      content: [
                        {
                          type: 'text',
                          text: 'Minimum Requirements',
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
        userPermissions: {
          canRead: true,
          canAnnotate: true,
          canSuggestEdit: true,
          canDownloadOffline: true,
        },
      };
      
      setManual(mockManual);
    };

    fetchManual();
  }, [params.manualId, searchParams.v]);

  const handleSearch = async (query: string) => {
    if (!query.trim()) return;
    
    // Mock search results
    const mockResults = [
      {
        chapterId: 'ch1',
        sectionId: 's1-1',
        blockId: 'b1',
        title: 'Weather Assessment',
        excerpt: 'Initi är essential att värderera vädermönster...',
        highlight: 'in<marc>iti</marc> är essential att värderera vädermönster',
        relevanceScore: 95,
        position: 0,
      },
    ];
    
    setSearchResults(mockResults);
    setShowSearchResults(true);
  };

  const handleAnnotate = (blockId: string, type: 'highlight' | 'note' | 'comment', content?: string) => {
    if (!manual.userPermissions.canAnnotate) return;
    
    const newAnnotation = {
      id: `ann-${Date.now()}`,
      blockId,
      type,
      content: content || 'New annotation',
      createdAt: new Date().toISOString(),
    };
    
    setAnnotations(prev => [...prev, newAnnotation]);
  };

  const handleSuggestEdit = (blockId: string, selection: string) => {
    if (!manual.userPermissions.canSuggestEdit) return;
    
    const suggestion = {
      blockId,
      currentText: selection,
      suggestedText: prompt('Föreslå ny text:', selection),
      reason: prompt('Ange anledning till ändring:'),
      priority: 'MEDIUM',
    };
    
    if (suggestion.reason && suggestion.suggestedText) {
      // API call to create suggestion would go here
      console.log('Suggesting edit:', suggestion);
    }
  };

  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };

  const toggleTOC = () => {
    setShowTOC(!showTOC);
  };

  if (!manual) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading manual...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={toggleSidebar}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Settings className="h-5 w-5" />
            </button>
            <h1 className="text-xl font-semibold text-gray-900">{manual.title}</h1>
            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
              v{manual.version}
            </span>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Sök i manual..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.trim()) {
                    handleSearch(e.target.value);
                  }
                }}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {manual.userPermissions.canDownloadOffline && (
              <button
                onClick={() => console.log('Download for offline')}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>Offline</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        {showSidebar && (
          <aside className="w-80 bg-gray-50 border-r border-gray-200 min-h-screen">
            <div className="p-6">
              {showTOC ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-gray-900">Table of Contents</h2>
                    <button
                      onClick={toggleTOC}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      <BookOpen className="h-4 w-4" />
                    </button>
                  </div>
                  
                  <nav>
                    {manual.chapters.map((chapter: any) => (
                      <div key={chapter.id} className="mb-4">
                        <button
                          onClick={() => setCurrentChapter(chapter.id)}
                          className={`block w-full text-left p-2 rounded-lg transition-colors ${
                            currentChapter === chapter.id
                              ? 'bg-blue-100 text-blue-900'
                              : 'hover:bg-gray-100'
                          }`}
                        >
                          <div className="font-medium">
                            {chapter.number} {chapter.title}
                          </div>
                        </button>
                        
                        {currentChapter === chapter.id && (
                          <div className="ml-4 mt-2 space-y-1">
                            {chapter.sections.map((section: any) => (
                              <button
                                key={section.id}
                                onClick={() => setCurrentSection(section.id)}
                                className={`block w-full text-left p-2 rounded transition-colors ${
                                  currentSection === section.id
                                    ? 'bg-blue-50 text-blue-800'
                                    : 'hover:bg-gray-100'
                                }`}
                              >
                                {section.number} {section.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </nav>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-gray-900">Annotations</h2>
                    <button
                      onClick={toggleTOC}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      <Type className="h-4 w-4" />
                    </button>
                  </div>
                  
                  {annotations.length > 0 ? (
                    <div className="space-y-3">
                      {annotations.map((annotation) => (
                        <div
                          key={annotation.id}
                          className="p-3 bg-white rounded-lg border border-gray-200"
                        >
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                              {annotation.type}
                            </span>
                            <span className="text-xs text-gray-500">
                              {new Date(annotation.createdAt).toLocaleDateString('sv-SE')}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700">{annotation.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No annotations yet.</p>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Main Content */}
        <main className="flex-1 p-8">
          {/* Search Results */}
          {showSearchResults && searchResults.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-gray-900">
                  Search Results ({searchResults.length})
                </h3>
                <button
                  onClick={() => setShowSearchResults(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-3">
                {searchResults.map((result, index) => (
                  <div
                    key={index}
                    className="p-4 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-100"
                    onClick={() => {
                      setCurrentChapter(result.chapterId);
                      setCurrentSection(result.sectionId);
                      setShowSearchResults(false);
                    }}
                  >
                    <div className="font-medium text-blue-900">{result.title}</div>
                    <div
                      className="text-sm text-blue-800 mt-1"
                      dangerouslySetInnerHTML={{ __html: result.highlight }}
                    />
                    <div className="text-xs text-blue-600 mt-2">Relevance: {result.relevanceScore}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chapter/Section Content */}
          {currentChapter && (
            <div>
              {manual.chapters
                .find((ch: any) => ch.id === currentChapter)
                ?.sections.find((s: any) => s.id === currentSection)
                ?.blocks.map((block: any) => (
                  <div
                    key={block.id}
                    className="mb-6 p-6 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow"
                  >
                    {/* Block Types */}
                    {block.content.type === 'paragraph' && (
                      <p className="text-gray-800 leading-relaxed">
                        {block.content.content.map((item: any, itemIndex: number) => (
                          <span key={itemIndex}>
                            {item.text}
                            {/* Revision Bar */}
                            <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded ml-2">
                              NEW
                            </span>
                          </span>
                        ))}
                      </p>
                    )}
                    
                    {block.content.type === 'heading' && (
                      <h2 className={`font-semibold text-gray-900 mb-4 ${
                        block.content.attrs.level === 3 ? 'text-lg' : 'text-xl'
                      }`}>
                        {block.content.content[0].text}
                      </h2>
                    )}

                    {/* Annotation tools */}
                    {manual.userPermissions.canAnnotate && (
                      <div className="flex items-center space-x-2 mt-4">
                        <button
                          onClick={() => handleAnnotate(block.id, 'highlight')}
                          className="flex items-center space-x-1 px-3 py-1 bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200 transition-colors"
                        >
                          <Type className="h-3 w-3" />
                          <span className="text-xs">Highlight</span>
                        </button>
                        
                        <button
                          onClick={() => {
                            const note = prompt('Add note:');
                            if (note) handleAnnotate(block.id, 'note', note);
                          }}
                          className="flex items-center space-x-1 px-3 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors"
                        >
                          <Type className="h-3 w-3" />
                          <span className="text-xs">Note</span>
                        </button>
                        
                        {manual.userPermissions.canSuggestEdit && (
                          <button
                            onClick={() => {
                              const selection = window.getSelection()?.toString();
                              if (selection) {
                                handleSuggestEdit(block.id, selection);
                              }
                            }}
                            className="flex items-center space-x-1 px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200 transition-colors"
                          >
                            <Type className="h-3 w-3" />
                            <span className="text-xs">Suggest Edit</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Empty State */}
          {!currentChapter && (
            <div className="text-center py-12">
              <BookOpen className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Select a Chapter to Begin
              </h3>
              <p className="text-gray-500">
                Choose a chapter from the sidebar to start reading the manual.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}






