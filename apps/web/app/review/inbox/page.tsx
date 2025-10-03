'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@skymanuals/ui';
import { ApprovalTask } from '@skymanuals/types';

// Mock data for development
const mockTasks: ApprovalTask[] = [
  {
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
  },
  {
    id: 'task-2',
    workflowInstanceId: 'workflow-2',
    stageId: 'stage-1',
    assignedToUserId: 'user-1',
    entityType: 'section',
    entityId: 'section-1',
    priority: 'MEDIUM',
    status: 'PENDING',
    commentsCount: 0,
    attachments: ['att-1'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

interface TaskCardProps {
  task: ApprovalTask;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string) => void;
  onViewDetails: (taskId: string) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onApprove, onReject, onViewDetails }) => {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return 'text-red-600 bg-red-50';
      case 'HIGH': return 'text-orange-600 bg-orange-50';
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-50';
      case 'LOW': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const isOverdue = task.dueAt && new Date(task.dueAt) < new Date();
  const entityLabel = task.entityType.charAt(0).toUpperCase() + task.entityType.slice(1);

  return (
    <div className={`bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow ${
      isOverdue ? 'border-red-200 bg-red-50' : ''
    }`}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-semibold text-gray-900">
                {entityLabel} Review Required
              </h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                getPriorityColor(task.priority || 'MEDIUM')
              }`}>
                {task.priority}
              </span>
            </div>
            
            <p className="text-sm text-gray-600 mb-2">
              Task ID: {task.id}
            </p>
            
            {task.dueAt && (
              <p className={`text-sm font-medium ${
                isOverdue ? 'text-red-600' : 'text-gray-600'
              }`}>
                Due: {new Date(task.dueAt).toLocaleDateString()}
                {isOverdue && ' (OVERDUE)'}
              </p>
            )}
          </div>
          
          <div className="text-right">
            <div className="flex items-center gap-4 text-sm text-gray-500">
              {task.commentsCount > 0 && (
                <span className="flex items-center gap-1">
                  💬 {task.commentsCount}
                </span>
              )}
              {task.attachments.length > 0 && (
                <span className="flex items-center gap-1">
                  📎 {task.attachments.length}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={() => onViewDetails(task.id)}
            variant="outline"
            size="sm"
          >
            View Details
          </Button>
          
          <Button
            onClick={() => onApprove(task.id)}
            size="sm"
            className="bg-green-600 hover:bg-green-700"
          >
            ✓ Approve
          </Button>
          
          <Button
            onClick={() => onReject(task.id)}
            variant="destructive"
            size="sm"
          >
            ✗ Reject
          </Button>
        </div>
      </div>
    </div>
  );
};

export default function ReviewerInboxPage() {
  const [tasks, setTasks] = useState<ApprovalTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<ApprovalTask | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');

  useEffect(() => {
    // Mock API call - in real implementation, fetch from /api/tasks
    setTasks(mockTasks);
  }, []);

  useEffect(() => {
    setSelectedTask(null);
  }, [selectedStatus]);

  const filteredTasks = tasks.filter(task => 
    selectedStatus === 'ALL' || task.status === selectedStatus
  );

  const pendingTasks = tasks.filter(task => task.status === 'PENDING');
  const overdueTasks = pendingTasks.filter(task => 
    task.dueAt && new Date(task.dueAt) < new Date()
  );

  const handleApprove = async (taskId: string) => {
    console.log('Approving task:', taskId);
    // TODO: API call to approve task
    
    // Optimistic update
    setTasks(prev => prev.map(task => 
      task.id === taskId 
        ? { ...task, status: 'APPROVED' as const, completedAt: new Date().toISOString() }
        : task
    ));
  };

  const handleReject = async (taskId: string) => {
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason) return;

    console.log('Rejecting task:', taskId, 'Reason:', reason);
    // TODO: API call to reject task
    
    // Optimistic update
    setTasks(prev => prev.map(task => 
      task.id === taskId 
        ? { ...task, status: 'REJECTED' as const, completedAt: new Date().toISOString() }
        : task
    ));
  };

  const handleViewDetails = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    setSelectedTask(task || null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Review Inbox</h1>
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-2xl font-bold text-blue-600">{pendingTasks.length}</div>
              <div className="text-sm text-gray-600">Pending Reviews</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-2xl font-bold text-red-600">{overdueTasks.length}</div>
              <div className="text-sm text-gray-600">Overdue Tasks</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-2xl font-bold text-green-600">
                {tasks.filter(t => t.status === 'APPROVED').length}
              </div>
              <div className="text-sm text-gray-600">Approved This Week</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-2xl font-bold text-purple-600">
                {tasks.filter(t => t.commentsCount > 0).length}
              </div>
              <div className="text-sm text-gray-600">With Comments</div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-1 bg-white rounded-lg shadow-sm p-1">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  selectedStatus === status
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {status} ({tasks.filter(t => status === 'ALL' ? true : t.status === status).length})
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Task List */}
          <div className="lg:col-span-2">
            <h2 className="text-xl font-semibold mb-4">
              {selectedStatus === 'ALL' ? 'All Tasks' : `${selectedStatus} Tasks`}
            </h2>
            
            <div className="space-y-4">
              {filteredTasks.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-4xl mb-4">📋</div>
                  <p>No tasks found.</p>
                </div>
              ) : (
                filteredTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onViewDetails={handleViewDetails}
                  />
                ))
              )}
            </div>
          </div>

          {/* Task Details Sidebar */}
          <div className="lg:col-span-1">
            {selectedTask ? (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Task Details</h3>
                
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="font-medium">ID:</span> {selectedTask.id}
                  </div>
                  <div>
                    <span className="font-medium">Entity:</span> {selectedTask.entityType}
                  </div>
                  <div>
                    <span className="font-medium">Priority:</span> {selectedTask.priority}
                  </div>
                  <div>
                    <span className="font-medium">Status:</span> {selectedTask.status}
                  </div>
                  {selectedTask.dueAt && (
                    <div>
                      <span className="font-medium">Due:</span> {new Date(selectedTask.dueAt).toLocaleDateString()}
                    </div>
                  )}
                  <div>
                    <span className="font-medium">Created:</span> {new Date(selectedTask.createdAt).toLocaleDateString()}
                  </div>
                </div>

                {/* Comment Thread Placeholder */}
                <div className="mt-6">
                  <h4 className="font-medium mb-3">Comments</h4>
                  <div className="space-y-2 text-sm text-gray-600">
                    {selectedTask.commentsCount === 0 ? (
                      <p>No comments yet.</p>
                    ) : (
                      <p>{selectedTask.commentsCount} comment(s) available</p>
                    )}
                  </div>
                  
                  <button className="mt-3 text-blue-600 hover:text-blue-800 text-sm font-medium">
                    View All Comments →
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-100 rounded-lg p-6 text-center text-gray-500">
                <div className="text-2xl mb-2">👀</div>
                <p>Select a task to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
