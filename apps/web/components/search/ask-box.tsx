'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Loader2, BookOpen, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Citation {
  paragraphId: string;
  manualId: string;
  chapterNumber: string;
  sectionNumber: string;
  paragraphIndex: number;
  content: string;
  score: number;
  highlightStart: number;
  highlightEnd: number;
  anchorId: string;
}

interface AskResponse {
  answer: string;
  citations: Citation[];
  query: string;
  searchTimeMs: number;
  totalResults: number;
  hasMoreResults: boolean;
  searchTechniques: string[];
}

interface AskBoxProps {
  manualId?: string;
  className?: string;
}

export function AskBox({ manualId, className = '' }: AskBoxProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleAsk = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const searchQuery = {
        query: query.trim(),
        limit: 3,
        filters: manualId ? { manualId } : undefined,
      };

      const res = await fetch('/api/search/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchQuery),
      });

      if (!res.ok) {
        throw new Error('Failed to get answer');
      }

      const data: AskResponse = await res.json();
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCitationClick = (citation: Citation) => {
    // Navigate to the specific paragraph
    router.push(`/manuals/${citation.manualId}@latest#${citation.anchorId}`);
    setOpen(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button 
          className={`bg-blue-600 hover:bg-blue-700 text-white ${className}`}
          size="sm"
        >
          <Search className="h-4 w-4 mr-2" />
          Ask AI
        </Button>
      </SheetTrigger>
      
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Ask AI Assistant
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Query Input */}
          <div className="space-y-4">
            <Input
              placeholder="Ask about this manual..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
              className="w-full"
            />
            <Button 
              onClick={handleAsk} 
              disabled={loading || !query.trim()}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Searching...
                </>
              ) : (
                <>
                  Search Manuals
                  <Search className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>

          {/* Error */}
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4">
                <p className="text-red-700 text-sm">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Response */}
          {response && (
            <div className="space-y-4">
              {/* Search Performance */}
              <div className="flex gap-2 flex-wrap">
                <Badge variant="secondary">
                  {response.searchTimeMs}ms
                </Badge>
                {response.searchTechniques.map((technique) => (
                  <Badge key={technique} variant="outline" className="text-xs">
                    {technique}
                  </Badge>
                ))}
              </div>

              {/* Answer */}
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {response.answer}
                  </p>
                </CardContent>
              </Card>

              {/* Citations */}
              <div className="space-y-3">
                <div className="text-sm font-medium text-gray-900">
                  Sources ({response.citations.length})
                </div>
                
                {response.citations.map((citation, index) => (
                  <Card 
                    key={citation.paragraphId}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => handleCitationClick(citation)}
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-xs">
                              {citation.chapterNumber}.{citation.sectionNumber}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              #{index + 1}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-600 line-clamp-2">
                            {citation.content}
                            {!citation.content.endsWith('.') && '...'}
                          </p>
                        </div>
                        <ExternalLink className="h-3 w-3 text-gray-400 shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {response.hasMoreResults && (
                  <div className="text-xs text-gray-500 text-center">
                    {response.totalResults} total results
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!response && !loading && !error && (
            <div className="text-center py-8">
              <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-sm text-gray-500 mb-2">
                Ask questions about the manual content
              </p>
              <p className="text-xs text-gray-400">
                AI will search through all released versions
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
