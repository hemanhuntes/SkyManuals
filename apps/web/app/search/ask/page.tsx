'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, BookOpen, ArrowRight } from 'lucide-react';
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

export default function AskPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleAsk = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch('/api/search/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.trim(),
          limit: 5,
        }),
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
    // Navigate to the specific paragraph in the reader
    router.push(`/manuals/${citation.manualId}@latest#${citation.anchorId}`);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Ask AI Assistant
        </h1>
        <p className="text-gray-600">
          Get intelligent answers about your manuals using AI-powered semantic search
        </p>
      </div>

      {/* Ask Input */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Ask a Question
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="question" className="sr-only">
                Question
              </Label>
              <Textarea
                id="question"
                placeholder="e.g., What are the safety procedures for engine start?"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="min-h-[60px] resize-none"
                disabled={loading}
              />
            </div>
            <Button 
              onClick={handleAsk} 
              disabled={loading || !query.trim()}
              className="h-fit"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Asking...
                </>
              ) : (
                <>
                  Ask <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Response */}
      {response && (
        <div className="space-y-6">
          {/* Answer */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Answer</CardTitle>
                <div className="flex gap-2">
                  {response.searchTechniques.map((technique) => (
                    <Badge key={technique} variant="secondary">
                      {technique}
                    </Badge>
                  ))}
                  <Badge variant="outline">
                    {response.searchTimeMs}ms
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                {response.answer}
              </p>
            </CardContent>
          </Card>

          {/* Citations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Sources ({response.citations.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {response.citations.map((citation, index) => (
                  <div 
                    key={citation.paragraphId}
                    className="border rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => handleCitationClick(citation)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline">
                            {citation.chapterNumber}.{citation.sectionNumber}
                          </Badge>
                          <span className="text-sm text-gray-500">
                            Paragraph {citation.paragraphIndex}
                          </span>
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            Score: {Math.round(citation.score * 100)}%
                          </div>
                        </div>
                        <p className="text-gray-700 text-sm line-clamp-3">
                          {citation.content}
                          {!citation.content.endsWith('.') && '...'}
                        </p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="shrink-0"
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {response.hasMoreResults && (
                <div className="mt-4 text-center text-sm text-gray-500">
                  {response.totalResults} total results found
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sample Questions */}
      {!response && !loading && !error && (
        <Card>
          <CardHeader>
            <CardTitle>Sample Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {[
                "What are the safety procedures for engine start?",
                "How do I perform a pre-flight inspection?",
                "What maintenance checks are required weekly?",
                "What is the emergency landing procedure?",
                "How do I handle turbulence during flight?"
              ].map((sampleQuery) => (
                <Button
                  key={sampleQuery}
                  variant="ghost"
                  className="justify-start text-left h-auto p-3"
                  onClick={() => setQuery(sampleQuery)}
                >
                  <span className="text-sm">{sampleQuery}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}






