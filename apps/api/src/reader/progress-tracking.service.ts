import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ReadingProgress {
  userId: string;
  bundleId: string;
  currentChapter: string;
  currentSection?: string;
  currentBlock?: string;
  progress: number; // 0-100
  readingTime: number; // seconds
  lastReadAt: Date;
  bookmarks: string[];
  highlights: Highlight[];
  notes: Note[];
}

export interface Highlight {
  id: string;
  blockId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  color: string;
  createdAt: Date;
}

export interface Note {
  id: string;
  blockId: string;
  text: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReadingSession {
  id: string;
  userId: string;
  bundleId: string;
  startedAt: Date;
  endedAt?: Date;
  totalTime: number;
  pagesRead: number;
  chaptersRead: string[];
}

export interface ReadingAnalytics {
  totalReadingTime: number;
  averageSessionTime: number;
  chaptersCompleted: number;
  totalChapters: number;
  readingSpeed: number; // words per minute
  completionRate: number;
  lastReadAt: Date;
}

@Injectable()
export class ProgressTrackingService {
  private readonly logger = new Logger(ProgressTrackingService.name);

  constructor(private prisma: PrismaService) {}

  async updateProgress(
    userId: string,
    bundleId: string,
    progressData: {
      currentChapter?: string;
      currentSection?: string;
      currentBlock?: string;
      progress?: number;
      readingTime?: number;
      action: 'start' | 'update' | 'complete' | 'pause';
    }
  ): Promise<ReadingProgress> {
    this.logger.log(`Updating progress for user ${userId}, bundle ${bundleId}`);

    try {
      // Get or create reading session
      let session = await this.getActiveSession(userId, bundleId);
      
      if (!session && progressData.action === 'start') {
        session = await this.createReadingSession(userId, bundleId);
      }

      // Update progress
      const updatedProgress = await this.prisma.readerSession.upsert({
        where: {
          userId_bundleId: {
            userId,
            bundleId
          }
        },
        update: {
          currentChapter: progressData.currentChapter,
          currentSection: progressData.currentSection,
          currentBlock: progressData.currentBlock,
          progress: progressData.progress,
          readingTime: progressData.readingTime ? {
            increment: progressData.readingTime
          } : undefined,
          lastReadAt: new Date(),
          updatedAt: new Date()
        },
        create: {
          userId,
          bundleId,
          currentChapter: progressData.currentChapter || '',
          currentSection: progressData.currentSection,
          currentBlock: progressData.currentBlock,
          progress: progressData.progress || 0,
          readingTime: progressData.readingTime || 0,
          lastReadAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Update session if active
      if (session) {
        await this.updateSession(session.id, {
          totalTime: progressData.readingTime ? session.totalTime + progressData.readingTime : session.totalTime,
          endedAt: progressData.action === 'complete' || progressData.action === 'pause' ? new Date() : undefined
        });
      }

      // Get full progress with bookmarks, highlights, notes
      const fullProgress = await this.getFullProgress(userId, bundleId);

      this.logger.log(`Progress updated for user ${userId}: ${progressData.progress}%`);

      return fullProgress;
    } catch (error) {
      this.logger.error(`Failed to update progress for user ${userId}:`, error);
      throw new Error(`Progress update failed: ${error.message}`);
    }
  }

  async getProgress(userId: string, bundleId: string): Promise<ReadingProgress | null> {
    try {
      const session = await this.prisma.readerSession.findUnique({
        where: {
          userId_bundleId: {
            userId,
            bundleId
          }
        }
      });

      if (!session) {
        return null;
      }

      return await this.getFullProgress(userId, bundleId);
    } catch (error) {
      this.logger.error(`Failed to get progress for user ${userId}:`, error);
      throw new Error(`Progress retrieval failed: ${error.message}`);
    }
  }

  async addHighlight(
    userId: string,
    bundleId: string,
    highlightData: {
      blockId: string;
      text: string;
      startOffset: number;
      endOffset: number;
      color: string;
    }
  ): Promise<Highlight> {
    this.logger.log(`Adding highlight for user ${userId}`);

    try {
      const highlight = await this.prisma.highlight.create({
        data: {
          id: this.generateId(),
          userId,
          bundleId,
          blockId: highlightData.blockId,
          text: highlightData.text,
          startOffset: highlightData.startOffset,
          endOffset: highlightData.endOffset,
          color: highlightData.color,
          createdAt: new Date()
        }
      });

      return {
        id: highlight.id,
        blockId: highlight.blockId,
        text: highlight.text,
        startOffset: highlight.startOffset,
        endOffset: highlight.endOffset,
        color: highlight.color,
        createdAt: highlight.createdAt
      };
    } catch (error) {
      this.logger.error(`Failed to add highlight for user ${userId}:`, error);
      throw new Error(`Highlight creation failed: ${error.message}`);
    }
  }

  async addNote(
    userId: string,
    bundleId: string,
    noteData: {
      blockId: string;
      text: string;
      position: number;
    }
  ): Promise<Note> {
    this.logger.log(`Adding note for user ${userId}`);

    try {
      const note = await this.prisma.note.create({
        data: {
          id: this.generateId(),
          userId,
          bundleId,
          blockId: noteData.blockId,
          text: noteData.text,
          position: noteData.position,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      return {
        id: note.id,
        blockId: note.blockId,
        text: note.text,
        position: note.position,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt
      };
    } catch (error) {
      this.logger.error(`Failed to add note for user ${userId}:`, error);
      throw new Error(`Note creation failed: ${error.message}`);
    }
  }

  async addBookmark(
    userId: string,
    bundleId: string,
    bookmarkData: {
      chapterId: string;
      sectionId?: string;
      blockId?: string;
      title: string;
      description?: string;
    }
  ): Promise<string> {
    this.logger.log(`Adding bookmark for user ${userId}`);

    try {
      const bookmark = await this.prisma.bookmark.create({
        data: {
          id: this.generateId(),
          userId,
          bundleId,
          chapterId: bookmarkData.chapterId,
          sectionId: bookmarkData.sectionId,
          blockId: bookmarkData.blockId,
          title: bookmarkData.title,
          description: bookmarkData.description,
          createdAt: new Date()
        }
      });

      return bookmark.id;
    } catch (error) {
      this.logger.error(`Failed to add bookmark for user ${userId}:`, error);
      throw new Error(`Bookmark creation failed: ${error.message}`);
    }
  }

  async getReadingAnalytics(userId: string, bundleId?: string): Promise<ReadingAnalytics> {
    try {
      const whereClause = bundleId ? { userId, bundleId } : { userId };

      // Get total reading time
      const sessions = await this.prisma.readerSession.findMany({
        where: whereClause
      });

      const totalReadingTime = sessions.reduce((sum, session) => sum + (session.readingTime || 0), 0);

      // Get reading sessions
      const readingSessions = await this.prisma.readingSession.findMany({
        where: whereClause,
        orderBy: { startedAt: 'desc' }
      });

      const averageSessionTime = readingSessions.length > 0 
        ? readingSessions.reduce((sum, session) => sum + session.totalTime, 0) / readingSessions.length
        : 0;

      // Get completion data
      const completedSessions = sessions.filter(s => s.progress >= 100);
      const chaptersCompleted = completedSessions.length;

      // Calculate reading speed (words per minute)
      // Assuming average 250 words per page
      const totalWords = sessions.reduce((sum, session) => sum + ((session.readingTime || 0) / 60) * 250, 0);
      const readingSpeed = totalReadingTime > 0 ? (totalWords / (totalReadingTime / 60)) : 0;

      const completionRate = sessions.length > 0 
        ? (completedSessions.length / sessions.length) * 100 
        : 0;

      const lastReadAt = sessions.length > 0 
        ? new Date(Math.max(...sessions.map(s => s.lastReadAt.getTime())))
        : new Date();

      return {
        totalReadingTime,
        averageSessionTime,
        chaptersCompleted,
        totalChapters: sessions.length,
        readingSpeed,
        completionRate,
        lastReadAt
      };
    } catch (error) {
      this.logger.error(`Failed to get reading analytics for user ${userId}:`, error);
      throw new Error(`Analytics retrieval failed: ${error.message}`);
    }
  }

  async getReadingSessions(userId: string, bundleId?: string): Promise<ReadingSession[]> {
    try {
      const whereClause = bundleId ? { userId, bundleId } : { userId };

      const sessions = await this.prisma.readingSession.findMany({
        where: whereClause,
        orderBy: { startedAt: 'desc' },
        take: 50 // Limit to last 50 sessions
      });

      return sessions.map(session => ({
        id: session.id,
        userId: session.userId,
        bundleId: session.bundleId,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        totalTime: session.totalTime,
        pagesRead: session.pagesRead,
        chaptersRead: session.chaptersRead || []
      }));
    } catch (error) {
      this.logger.error(`Failed to get reading sessions for user ${userId}:`, error);
      throw new Error(`Sessions retrieval failed: ${error.message}`);
    }
  }

  private async getFullProgress(userId: string, bundleId: string): Promise<ReadingProgress> {
    const session = await this.prisma.readerSession.findUnique({
      where: {
        userId_bundleId: {
          userId,
          bundleId
        }
      }
    });

    if (!session) {
      throw new Error('Reading session not found');
    }

    // Get bookmarks
    const bookmarks = await this.prisma.bookmark.findMany({
      where: { userId, bundleId },
      select: { id: true }
    });

    // Get highlights
    const highlights = await this.prisma.highlight.findMany({
      where: { userId, bundleId }
    });

    // Get notes
    const notes = await this.prisma.note.findMany({
      where: { userId, bundleId }
    });

    return {
      userId: session.userId,
      bundleId: session.bundleId,
      currentChapter: session.currentChapter,
      currentSection: session.currentSection,
      currentBlock: session.currentBlock,
      progress: session.progress,
      readingTime: session.readingTime,
      lastReadAt: session.lastReadAt,
      bookmarks: bookmarks.map(b => b.id),
      highlights: highlights.map(h => ({
        id: h.id,
        blockId: h.blockId,
        text: h.text,
        startOffset: h.startOffset,
        endOffset: h.endOffset,
        color: h.color,
        createdAt: h.createdAt
      })),
      notes: notes.map(n => ({
        id: n.id,
        blockId: n.blockId,
        text: n.text,
        position: n.position,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt
      }))
    };
  }

  private async getActiveSession(userId: string, bundleId: string): Promise<any> {
    return await this.prisma.readingSession.findFirst({
      where: {
        userId,
        bundleId,
        endedAt: null
      },
      orderBy: {
        startedAt: 'desc'
      }
    });
  }

  private async createReadingSession(userId: string, bundleId: string): Promise<any> {
    return await this.prisma.readingSession.create({
      data: {
        id: this.generateId(),
        userId,
        bundleId,
        startedAt: new Date(),
        totalTime: 0,
        pagesRead: 0,
        chaptersRead: []
      }
    });
  }

  private async updateSession(sessionId: string, data: {
    totalTime?: number;
    pagesRead?: number;
    chaptersRead?: string[];
    endedAt?: Date;
  }): Promise<void> {
    await this.prisma.readingSession.update({
      where: { id: sessionId },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });
  }

  private generateId(): string {
    return `progress_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Health check
  async healthCheck(): Promise<{ status: string; details?: any }> {
    try {
      const sessionCount = await this.prisma.readerSession.count();
      const highlightCount = await this.prisma.highlight.count();
      const noteCount = await this.prisma.note.count();

      return {
        status: 'healthy',
        details: {
          activeSessions: sessionCount,
          totalHighlights: highlightCount,
          totalNotes: noteCount
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }
}
