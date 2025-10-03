'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@skymanuals/ui';
import { ApprovalTask, Comment } from '@skymanuals/types';

interface TaskDetailPageProps {
  params: {
    id: string;
  };
}

// Mock task data
const mockTask: ApprovalTask = {
  id: 'task-1',
  workflowInstanceId: 'workflow-1',
  stageId: 'stage-1',
  assignedToUserId: 'user-1',
  entityType: 'manual',
  entityId: 'manual-1',
  priority: 'HIGH',
  status: 'PENDING',
  dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  commentsCount: 2,
  attachments: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockComments: Comment[] = [
  {
    id: 'comment-1',
    taskId: 'task-1',
    userId: 'reviewer-1',
    content: 'This manual section looks good overall, but I\'d like to see more detail in section 2.3.',
    type: 'general',
    isInternal: false,
    attachments: [],
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'comment-2',
    taskId: 'task-1',
    userId: 'author-1',
    content: 'I\'ll add more detail to section 2.3 as requested. The updates will be ready by Friday.',
    type: 'general',
    parentCommentId: 'comment-1',
    attachments: ['att-1'],
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
];

interface CommentThreadProps {
  comment: Comment;
  replies: Comment[];
}

const CommentThread: React.FC<CommentThreadProps> = ({ comment, replies }) => {
  return (
    <div className="border rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
            {comment.userId.charAt(0).toUpperCase()}
          </div>
          <div>
            <span className="font-medium">{comment.userId}</span>
            <span className="text-sm text-gray-500 ml-2">{comment.type}</span>
          </div>
        </div>
        <span className="text-sm text-gray-500">{new Date(comment.createdAt).toLocaleString()}</span>
      </div>
      
      <div className="ml-10">
        <p className="text-gray-700 mb-3">{comment.content}</p>
        
        {comment.attachments.length > 0 && (
          <div className="mb-3">
            <span className="text-sm text-gray-500">Attachments:</span>
            {comment.attachments.map((attId, index) => (
              <span key={attId} className="ml-2 text-blue-600 hover:underline cursor-pointer">
                📎 Attachment {index + 1}
              </span>
            ))}
          </div>
        )}
        
        {/* Replies */}
        {replies.length > 0 && (
          <div className="mt-4 pl-4 border-l-2 border-gray-200">
            {replies.map(reply => (
              <div key={reply.id} className="mb-3 p-3 bg-gray-50 rounded">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs">
                    {reply.userId.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-sm">{reply.userId}</span>
                  <span className="text-xs text-gray-500">{new Date(reply.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-sm text-gray-700">{reply.content}</p>
                {reply.isResolved && (
                  <span className="inline-block mt-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                    ✓ Resolved
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        
        <div className="mt-3">
          <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
            Reply →
          </button>
        </div>
      </div>
    </div>
  );
};

export default function TaskDetailPage({ params }: TaskDetailPageProps) {
  const [task, setTask] = useState<ApprovalTask>(mockTask);
  const [comments, setComments] = useState<Comment[]>(mockComments);
  const [newComment, setNewComment] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  useEffect(() => {
    // In real implementation, fetch task and comments from API
  }, [params.id]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const comment: Comment = {
      id: `comment-${Date.now()}`,
      taskId: params.id,
      userId: 'current-user',
      content: newComment,
      type: 'general',
      isInternal: false,
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setComments(prev => [...prev, comment]);
    setNewComment('');
  };

  const handleApprove = async () => {
    setIsApproving(true);
    
    try {
      // TODO: API call to approve task
      await new Promise(resolve => setTimeout(resolve, 1000)); // Mock delay
      
      setTask(prev => ({ ...prev, status: 'APPROVED', completedAt: new Date().toISOString() }));
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason) return;

    setIsRejecting(true);
    
    try {
      // TODO: API call to reject task
      await new Promise(resolve => setTimeout(resolve, 1000)); // Mock delay
      
      setTask(prev => ({ ...prev, status: 'REJECTED', completedAt: new Date().toISOString() }));
    } finally {
      setIsRejecting(false);
    }
  };

  // Group comments by parent-child relationships
  const topLevelComments = comments.filter(c => !c.parentCommentId);
  const replies = comments.filter(c => c.parentCommentId);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <button 
              onClick={() => window.history.back()}
              className="text-blue-600 hover:text-blue-800"
            >
              ← Back to Inbox
            </button>
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Review Task: {task.entityType.charAt(0).toUpperCase() + task.entityType.slice(1)} #{task.entityId}
          </h1>
          
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              task.priority === 'CRITICAL' ? 'text-red-600 bg-red-50' :
              task.priority === 'HIGH' ? 'text-orange-600 bg-orange-50' :
              task.priority === 'MEDIUM' ? 'text-yellow-600 bg-yellow-50' :
              'text-green-600 bg-green-50'
            }`}>
              {task.priority}
            </span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              task.status === 'PENDING' ? 'text-blue-600 bg-blue-50' :
              task.status === 'APPROVED' ? 'text-green-600 bg-green-50' :
              task.status === 'REJECTED' ? 'text-red-600 bg-red-50' :
              'text-gray-600 bg-gray-50'
            }`}>
              {task.status}
            </span>
            {task.dueAt && (
              <span>Due: {new Date(task.dueAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Action Request */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Document under Review</h2>
              <div className="bg-gray-100 rounded p-4 border-l-4 border-blue-500">
                <h3 className="font-medium mb-2">{task.entityType} Review Required</h3>
                <p className="text-gray-700 mb-4">
                  Please review the following {task.entityType} and provide your approval or rejection with comments.
                </p>
                
                {/* Document Preview Placeholder */}
                <div className="bg-white border rounded p-4">
                  <div className="border-2 border-dashed border-gray-300 rounded p-8 text-center text-gray-500">
                    <div className="text-2xl mb-2">📄</div>
                    <p>Document preview would appear here</p>
                    <button className="mt-2 text-blue-600 hover:text-blue-800">
                      View Full Document →
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Comments Thread */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Discussion ({comments.length})</h2>
              
              {/* Comment List */}
              <div className="space-y-4 mb-6">
                {topLevelComments.map(comment => (
                  <CommentThread
                    key={comment.id}
                    comment={comment}
                    replies={replies.filter(r => r.parentCommentId === comment.id)}
                  />
                ))}
              </div>

              {/* Add Comment Form */}
              <form onSubmit={handleSubmitComment} className="border-t pt-4">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Add Comment
                  </label>
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="w-full border rounded-md p-3 text-sm"
                    rows={3}
                    placeholder="Share your thoughts or ask questions..."
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    Post Comment
                  </Button>
                  <Button type="button" variant="outline" size="sm">
                    Mark as Resolved
                  </Button>
                </div>
              </form>
            </div>
          </div>

          {/* Action Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 sticky top-4">
              <h3 className="text-lg font-semibold mb-4">Actions</h3>
              
              <div className="space-y-3">
                <Button
                  onClick={handleApprove}
                  disabled={isApproving || task.status !== 'PENDING'}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {isApproving ? 'Approving...' : '✓ Approve'}
                </Button>
                
                <Button
                  onClick={handleReject}
                  disabled={isRejecting || task.status !== 'PENDING'}
                  variant="destructive"
                  className="w-full"
                >
                  {isRejecting ? 'Rejecting...' : '✗ Reject'}
                </Button>
                
                <Button variant="outline" className="w-full">
                  📤 Delegate
                </Button>
                
                <Button variant="outline" className="w-full">
                  ⏸️ Suspend
                </Button>
              </div>

              {/* Task Info */}
              <div className="mt-8 pt-6 border-t">
                <h4 className="font-medium mb-3">Task Information</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <div><span className="font-medium">ID:</span> {task.id}</div>
                  <div><span className="font-medium">Workflow:</span> {task.workflowInstanceId}</div>
                  <div><span className="font-medium">Stage:</span> {task.stageId}</div>
                  <div><span className="font-medium">Assigned:</span> {task.assignedToUserId}</div>
                  <div><span className="font-medium">Created:</span> {new Date(task.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
