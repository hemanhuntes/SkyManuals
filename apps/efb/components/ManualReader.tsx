import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { CacheManagerService } from '../services/cache-manager.service';
import { AuthService } from '../services/auth.service';

interface ManualReaderProps {
  manualId: string;
}

interface Chapter {
  id: string;
  number: string;
  title: string;
  sections: Section[];
}

interface Section {
  id: string;
  number: string;
  title: string;
  blocks: Block[];
}

interface Block {
  id: string;
  type: 'paragraph' | 'heading' | 'list' | 'warning' | 'procedure' | 'table';
  content: any;
  title?: string;
}

const highlightColors = ['#fff176', '#ffab91', '#c5e1a5', '#a5d6f0', '#d1c4e9'];

export const ManualReader: React.FC<ManualReaderProps> = ({ manualId }) => {
  const [manualData, setManualData] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [highlights, setHighlights] = useState<Map<string, any>>(new Map());
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const cacheManager = CacheManagerService.getInstance();
  const authService = AuthService.getInstance();

  useEffect(() => {
    loadManualData();
    loadHighlights();
    checkNetworkStatus();
  }, [manualId]);

  const loadManualData = async () => {
    try {
      setLoading(true);
      
      // Try to load from cache first
      const cachedData = await loadFromCache();
      if (cachedData) {
        setManualData(cachedData);
        setOfflineMode(true);
        setLoading(false);
        return;
      }

      // Load from server
      const onlineData = await loadFromServer();
      setManualData(onlineData);
      setOfflineMode(false);
      
      // Log manual access
      await authService.logAnalytics('MANUAL_OPEN', manualId, {
        online: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to load manual data:', error);
      Alert.alert(
        'Error',
        'Failed to load manual. Please check your internet connection and try again.',
        [{ text: 'OK', onPress: () => loadFromCache() }],
      );
    } finally {
      setLoading(false);
    }
  };

  const loadFromCache = async (): Promise<Chapter[] | null> => {
    try {
      const chunkContent = await cacheManager.getChunkContent(manualId, 0);
      if (chunkContent) {
        // Parse cached manual data
        const data = JSON.parse(chunkContent);
        console.log(`Loaded manual ${manualId} from cache`);
        return data.chapters || [];
      }
      return null;
    } catch (error) {
      console.error('Failed to load from cache:', error);
      return null;
    }
  };

  const loadFromServer = async (): Promise<Chapter[]> => {
    try {
      const response = await fetch(`https://api.skymanuals.com/reader/${manualId}`, {
        headers: authService.getAuthenticatedHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Cache the manual chunks
      await cacheManualData(data);
      
      console.log(`Loaded manual ${manualId} from server`);
      return data.chapters || [];
    } catch (error) {
      console.error('Failed to load from server:', error);
      throw error;
    }
  };

  const cacheManualData = async (data: any): Promise<void> => {
    try {
      // Split manual into chunks for caching
      const chunks = splitIntoChunks(JSON.stringify(data), 500 * 1024); // 500KB chunks
      
      for (let i = 0; i < chunks.length; i++) {
        const chunkPath = `${cacheManager['cacheDir']}chunks/${manualId}/${i}`;
        await FileSystem.writeAsStringAsync(chunkPath, chunks[i]);
      }

      // Update manifest
      const chunkMetadata = chunks.map((chunk, index) => ({
        chunkIndex: index,
        chunkChecksum: await calculateChecksum(chunk),
        chunkSizeBytes: Buffer.byteLength(chunk, 'utf8'),
      }));

      await cacheManager.updateCacheManifest(
        manualId,
        data.version || '1.0.0',
        chunkMetadata,
      );
    } catch (error) {
      console.error('Failed to cache manual data:', error);
    }
  };

  const splitIntoChunks = (content: string, chunkSize: number): string[] => {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < content.length) {
      chunks.push(content.slice(start, start + chunkSize));
      start += chunkSize;
    }
    
    return chunks;
  };

  const calculateChecksum = async (content: string): Promise<string> => {
    // Simplified checksum calculation
    return btoa(content).slice(0, 64);
  };

  const checkNetworkStatus = async () => {
    const networkInfo = await NetInfo.fetch();
    setOfflineMode(!networkInfo.isInternetReachable);
  };

  const loadHighlights = async () => {
    try {
      const highlightsData = await AsyncStorage.getItem(`highlights_${manualId}`);
      if (highlightsData) {
        const parsed: [string, any][] = JSON.parse(highlightsData);
        setHighlights(new Map(parsed));
      }
    } catch (error) {
      console.error('Failed to load highlights:', error);
    }
  };

  const saveHighlights = async () => {
    try {
      const highlightsArray: [string, any][] = Array.from(highlights.entries());
      await AsyncStorage.setItem(
        `highlights_${manualId}`,
        JSON.stringify(highlightsArray),
      );
    } catch (error) {
      console.error('Failed to save highlights:', error);
    }
  };

  const addHighlight = (blockId: string, color: string, note?: string) => {
    const newHighlights = new Map(highlights);
    newHighlights.set(blockId, {
      color,
      note,
      timestamp: new Date().toISOString(),
    });
    setHighlights(newHighlights);
    
    // Save immediately
    setHighlights(new Map(newHighlights));
    saveHighlights();
    
    // Log analytics
    authService.logAnalytics('HIGHLIGHT_ADDED', blockId, {
      color,
      hasNote: !!note,
      offlineMode,
    });
  };

  const removeHighlight = (blockId: string) => {
    const newHighlights = new Map(highlights);
    newHighlights.delete(blockId);
    setHighlights(newHighlights);
    saveHighlights();
  };

  const searchInContent = (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const results: any[] = [];
    const searchTerm = query.toLowerCase();

    manualData.forEach((chapter) => {
      chapter.sections.forEach((section) => {
        section.blocks.forEach((block) => {
          if (block.content && block.content.toLowerCase().includes(searchTerm)) {
            results.push({
              blockId: block.id,
              chapterTitle: chapter.title,
              sectionTitle: section.title,
              blockTitle: block.title,
              match: block.content,
              blockType: block.type,
            });
          }
        });
      });
    });

    setSearchResults(results);
    
    // Log search analytics
    authService.logAnalytics('SEARCH_PERFORMED', manualId, {
      query,
      resultCount: results.length,
      offlineMode,
    });
  };

  const renderBlock = (block: Block, chapterTitle: string, sectionTitle: string) => {
    const isHighlighted = highlights.has(block.id);
    const highlightColor = highlights.get(block.id)?.color;
    const highlightNote = highlights.get(block.id)?.note;

    return (
      <TouchableOpacity
        key={block.id}
        style={[
          styles.block,
          isHighlighted && {
            backgroundColor: highlightColor,
            borderColor: highlightColor,
            borderWidth: 2,
          },
        ]}
        onLongPress={() => showHighlightOptions(block.id)}
        onPress={() => setSelectedBlockId(block.id)}
      >
        <Text style={styles.blockContent}>
          {block.content}
        </Text>
        
        {block.title && (
          <Text style={styles.blockTitle}>
            {block.title}
          </Text>
        )}
        
        {highlightNote && (
          <View style={styles.highlightNote}>
            <Text style={styles.highlightNoteText}>
              💭 {highlightNote}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const showHighlightOptions = (blockId: string) => {
    const isHighlighted = highlights.has(blockId);
    
    const options = [
      {
        text: 'Remove Highlight',
        onPress: () => removeHighlight(blockId),
        style: isHighlighted ? 'destructive' : 'default',
      },
      { text: 'Cancel', style: 'cancel' },
    ];

    if (!isHighlighted) {
      highlightColors.forEach((color, index) => {
        options.unshift({
          text: `Highlight ${index + 1}`,
          onPress: () => addHighlight(blockId, color),
          style: 'default',
        });
      });
    }

    Alert.alert('Highlight Options', '', options);
  };

  const filteredManualData = useMemo(() => {
    if (!searchQuery.trim()) {
      return manualData;
    }

    return manualData.map((chapter) => ({
      ...chapter,
      sections: chapter.sections.map((section) => ({
        ...section,
        blocks: section.blocks.filter((block) =>
          block.content.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
      })).filter((section) => section.blocks.length > 0),
    })).filter((chapter) => chapter.sections.length > 0);
  }, [manualData, searchQuery]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading manual...</Text>
        {offlineMode && (
          <Text style={styles.offlineText}>Reading from cache</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Manual Reader</Text>
        <View style={styles.statusIndicator}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: offlineMode ? '#ef4444' : '#10b981' },
            ]}
          />
          <Text style={styles.statusText}>
            {offlineMode ? 'Offline' : 'Online'}
          </Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search manual content..."
          value={searchQuery}
          onChangeText={(text) => {
            setSearchQuery(text);
            searchInContent(text);
          }}
          placeholderTextColor="#9ca3af"
        />
        {searchQuery && (
          <Text style={styles.searchResultsText}>
            {searchResults.length} results found
          </Text>
        )}
      </View>

      {/* Content */}
      <ScrollView style={styles.contentContainer}>
        {filteredManualData.map((chapter) => (
          <View key={chapter.id} style={styles.chaperSection}>
            <Text style={styles.chapterTitle}>
              {chapter.number} {chapter.title}
            </Text>
            
            {chapter.sections.map((section) => (
              <View key={section.id} style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>
                  {section.number} {section.title}
                </Text>
                
                {section.blocks.map((block) =>
                  renderBlock(block, chapter.title, section.title),
                )}
              </View>
            ))}
          </View>
        ))}
        
        {filteredManualData.length === 0 && searchQuery && (
          <View style={styles.noResults}>
            <Text style={styles.noResultsText}>
              No results found for "{searchQuery}"
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Search Results Sidebar */}
      {searchResults.length > 0 && (
        <View style={styles.searchResultsSidebar}>
          <Text style={styles.searchSidebarTitle}>Search Results</Text>
          <ScrollView>
            {searchResults.map((result, index) => (
              <TouchableOpacity
                key={index}
                style={styles.searchResultItem}
                onPress={() => setSelectedBlockId(result.blockId)}
              >
                <Text style={styles.searchResultChapter}>
                  {result.chapterTitle}
                </Text>
                <Text style={styles.searchResultSection}>
                  {result.sectionTitle}
                </Text>
                <Text style={styles.searchResultMatch} numberOfLines={2}>
                  {result.match}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  offlineText: {
    marginTop: 8,
    fontSize: 14,
    color: '#ef4444',
    fontStyle: 'italic',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#6b7280',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: '#1f2937',
  },
  searchResultsText: {
    marginTop: 8,
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  chapterSection: {
    marginTop: 24,
  },
  chapterTitle: {
    color: '#1e40af',
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 12,
  },
  sectionContainer: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 16,
    marginBottom: 8,
  },
  block: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  blockTitle: {
    color: '#1f2937',
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 4,
  },
  blockContent: {
    color: '#374151',
    fontSize: 15,
    lineHeight: 22,
  },
  highlightNote: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
  },
  highlightNoteText: {
    color: '#6b7280',
    fontSize: 12,
    fontStyle: 'italic',
  },
  noResults: {
    padding: 24,
    alignItems: 'center',
  },
  noResultsText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  searchResultsSidebar: {
    position: 'absolute',
    right: 0,
    top: 100,
    bottom: 0,
    width: 300,
    backgroundColor: '#f9fafb',
    borderLeftWidth: 1,
    borderLeftColor: '#d1d5db',
  },
  searchSidebarTitle: {
    padding: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchResultItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchResultChapter: {
    fontSize: 12,
    color: '#1e40af',
    fontWeight: '600',
  },
  searchResultSection: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  searchResultMatch: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
});
