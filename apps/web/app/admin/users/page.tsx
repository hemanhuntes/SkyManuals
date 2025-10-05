'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  BulkRoleUpdate,
  Permission,
  RoleChangeRequest,
  AuditEvent,
} from '@skymanuals/types';

interface UserWithRole {
  id: string;
  name: string;
  email: string;
  role: string;
  organizationId: string;
  joinedAt: string;
  lastActive: string;
  membershipId: string;
}

interface RoleChangeReq {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  currentRole: string;
  requestedRole: string;
  reason: string;
  status: string;
  requestedAt: string;
  requestedBy: string;
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [roleChangeRequests, setRoleChangeRequests] = useState<RoleChangeReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  
  // Bulk operations state
  const [bulkOperation, setBulkOperation] = useState<{
    action: 'GRANT' | 'REVOKE' | 'UPDATE';
    role: string;
    reason: string;
  }>({
    action: 'GRANT',
    role: 'READER',
    reason: '',
  });

  const filters = {
    role: '',
    status: 'active',
  };

  useEffect(() => {
    loadUsers();
    loadRoleChangeRequests();
  }, [searchQuery, filters]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams({
        search: searchQuery,
        role: filters.role,
        page: '1',
        pageSize: '50',
      });

      const response = await fetch(`/api/users?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
          'x-org-id': localStorage.getItem('current_organization_id') || '',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load users');
      }

      const data = await response.json();
      setUsers(data.users);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRoleChangeRequests = async () => {
    try {
      const response = await fetch('/api/admin/role-change-requests', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
          'x-org-id': localStorage.getItem('current_organization_id') || '',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load role change requests');
      }

      const data = await response.json();
      setRoleChangeRequests(data.requests);
    } catch (error) {
      console.error('Failed to load role change requests:', error);
    }
  };

  const handleBulkRoleUpdate = async () => {
    if (selectedUsers.size === 0) return;

    try {
      const bulkUpdate: BulkRoleUpdate = {
        userIds: Array.from(selectedUsers),
        organizationId: localStorage.getItem('current_organization_id') || '',
        role: bulkOperation.role as any,
        action: bulkOperation.action,
        reason: bulkOperation.reason,
      };

      const response = await fetch('/api/admin/users/bulk-role-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
          'x-org-id': localStorage.getItem('current_organization_id') || '',
        },
        body: JSON.stringify(bulkUpdate),
      });

      if (!response.ok) {
        throw new Error('Failed to update user roles');
      }

      await loadUsers();
      setSelectedUsers(new Set());
    } catch (error) {
      console.error('Failed to update roles:', error);
    }
  };

  const handleApproveRoleChange = async (requestId: string) => {
    try {
      const response = await fetch(`/api/admin/role-change-requests/${requestId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
          'x-org-id': localStorage.getItem('current_organization_id') || '',
        },
        body: JSON.stringify({
          reviewNotes: 'Role change approved',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to approve role change');
      }

      await loadRoleChangeRequests();
      await loadUsers();
    } catch (error) {
      console.error('Failed to approve role change:', error);
    }
  };

  const handleRejectRoleChange = async (requestId: string, reason: string) => {
    try {
      const response = await fetch(`/api/admin/role-change-requests/${requestId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
          'x-org-id': localStorage.getItem('current_organization_id') || '',
        },
        body: JSON.stringify({
          reviewNotes: reason,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to reject role change');
      }

      await loadRoleChangeRequests();
    } catch (error) {
      console.error('Failed to reject role change:', error);
    }
  };

  const getRoleBadge = (role: string) => {
    const variants = {
      ADMIN: 'destructive',
      EDITOR: 'default',
      REVIEWER: 'secondary',
      READER: 'outline',
    };
    
    return (
      <Badge variant={variants[role as keyof typeof variants] || 'outline'}>
        {role}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      PENDING: 'secondary',
      APPROVED: 'default',
      REJECTED: 'destructive',
      EXPIRED: 'outline',
    };
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || 'outline'}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const handleUserSelection = (userId: string, selected: boolean) => {
    const newSelection = new Set(selectedUsers);
    if (selected) {
      newSelection.add(userId);
    } else {
      newSelection.delete(userId);
    }
    setSelectedUsers(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(users.map(u => u.id)));
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">User & Role Management</h1>
        <p className="text-gray-600">
          Manage user roles and permissions for your organization
        </p>
      </div>

      {/* Search and Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filter Users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search users by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <Select value={filters.role} onValueChange={(value) => { filters.role = value; loadUsers(); }}>
                <SelectTrigger>
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All roles</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="EDITOR">Editor</SelectItem>
                  <SelectItem value="REVIEWER">Reviewer</SelectItem>
                  <SelectItem value="READER">Reader</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Operations */}
      {selectedUsers.size > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Bulk Operations ({selectedUsers.size} selected)</CardTitle>
          </CardHeader>
          <CardContent>
            <Dialog>
              <DialogTrigger asChild>
                <Button>Update Roles</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bulk Role Update</DialogTitle>
                  <DialogDescription>
                    Update roles for multiple users at once
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="action">Action</Label>
                    <Select
                      value={bulkOperation.action}
                      onValueChange={(value: 'GRANT' | 'REVOKE' | 'UPDATE') => 
                        setBulkOperation({ ...bulkOperation, action: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GRANT">Grant Role</SelectItem>
                        <SelectItem value="REVOKE">Revoke Role</SelectItem>
                        <SelectItem value="UPDATE">Update Role</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="role">Role</Label>
                    <Select
                      value={bulkOperation.role}
                      onValueChange={(value) => 
                        setBulkOperation({ ...bulkOperation, role: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="READER">Reader</SelectItem>
                        <SelectItem value="REVIEWER">Reviewer</SelectItem>
                        <SelectItem value="EDITOR">Editor</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="reason">Reason (Optional)</Label>
                    <Input
                      id="reason"
                      placeholder="Reason for role change..."
                      value={bulkOperation.reason}
                      onChange={(e) => 
                        setBulkOperation({ ...bulkOperation, reason: e.target.value })
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleBulkRoleUpdate}>
                    Update Roles
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>Organization Users</CardTitle>
            <CardDescription>
              Manage roles and permissions for organization members
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <input
                      type="checkbox"
                      checked={selectedUsers.size === users.length && users.length > 0}
                      onChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedUsers.has(user.id)}
                        onChange={(e) => handleUserSelection(user.id, e.target.checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {new Date(user.joinedAt).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {user.lastActive ? new Date(user.lastActive).toLocaleDateString() : 'Never'}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Role Change Requests */}
        <Card>
          <CardHeader>
            <CardTitle>Role Change Requests</CardTitle>
            <CardDescription>
              Review and approve role change requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {roleChangeRequests.map((request) => (
                <div key={request.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-medium">{request.userName}</div>
                      <div className="text-sm text-gray-500">{request.userEmail}</div>
                    </div>
                    <div>{getStatusBadge(request.status)}</div>
                  </div>
                  
                  <div className="text-sm text-gray-600 mb-2">
                    {request.currentRole} → {request.requestedRole}
                  </div>
                  
                  {request.reason && (
                    <div className="text-sm text-gray-500 mb-2">
                      <strong>Reason:</strong> {request.reason}
                    </div>
                  )}
                  
                  <div className="text-xs text-gray-400">
                    Requested {new Date(request.requestedAt).toLocaleDateString()}
                  </div>
                  
                  {request.status === 'PENDING' && (
                    <div className="flex space-x-2 mt-3">
                      <Button
                        size="sm"
                        onClick={() => handleApproveRoleChange(request.id)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const reason = prompt('Rejection reason:');
                          if (reason) handleRejectRoleChange(request.id, reason);
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}






