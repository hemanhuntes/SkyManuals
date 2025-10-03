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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Device,
  DevicePolicyUpdateRequest,
  ManualPinningPolicy,
  CacheSyncPolicy,
  SecurityPolicy,
  CacheInvalidationRequest,
} from '@skymanuals/types';

interface DeviceWithDetails extends Device {
  user?: {
    name: string;
    email: string;
  };
  lastSyncJob?: {
    status: string;
    type: string;
    createdAt: string;
  };
  totalCacheSizeMB: number;
}

export default function DeviceManagementPage() {
  const [devices, setDevices] = useState<DeviceWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    status: '',
    platform: '',
    search: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalCount: 0,
    totalPages: 0,
  });

  // Policy management state
  const [policies, setPolicies] = useState<any[]>([]);
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const [selectedPolicyType, setSelectedPolicyType] = useState<string>('');
  const [policySettings, setPolicySettings] = useState<any>({});

  useEffect(() => {
    loadDevices();
    loadPolicies();
  }, [filters, pagination.page]);

  const loadDevices = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
        ...filters,
      });

      const response = await fetch(`/api/efb/devices?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load devices');
      }

      const data = await response.json();
      setDevices(data.devices);
      setPagination({
        ...pagination,
        totalCount: data.totalCount,
        totalPages: data.pagination.totalPages,
      });
    } catch (error) {
      console.error('Failed to load devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPolicies = async () => {
    try {
      const response = await fetch('/api/efb/policies', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load policies');
      }

      const data = await response.json();
      setPolicies(data);
    } catch (error) {
      console.error('Failed to load policies:', error);
    }
  };

  const handleDeviceSelection = (deviceId: string, selected: boolean) => {
    const newSelection = new Set(selectedDevices);
    if (selected) {
      newSelection.add(deviceId);
    } else {
      newSelection.delete(deviceId);
    }
    setSelectedDevices(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedDevices.size === devices.length) {
      setSelectedDevices(new Set());
    } else {
      setSelectedDevices(new Set(devices.map(d => d.id)));
    }
  };

  const handleSuspendDevice = async (deviceId: string) => {
    try {
      const reason = prompt('Enter reason for suspension:');
      if (!reason) return;

      const response = await fetch(`/api/efb/devices/${deviceId}/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
        },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        throw new Error('Failed to suspend device');
      }

      await loadDevices();
    } catch (error) {
      console.error('Failed to suspend device:', error);
    }
  };

  const handleApproveDevice = async (deviceId: string) => {
    try {
      const response = await fetch(`/api/efb/devices/${deviceId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
        },
        body: JSON.stringify({ customPolicies: [] }),
      });

      if (!response.ok) {
        throw new Error('Failed to approve device');
      }

      await loadDevices();
    } catch (error) {
      console.error('Failed to approve device:', error);
    }
  };

  const handleBulkPolicyUpdate = async (policyId: string, action: 'ADD' | 'REMOVE' | 'REPLACE') => {
    try {
      const request: DevicePolicyUpdateRequest = {
        deviceIds: Array.from(selectedDevices),
        policyId,
        action,
      };

      const response = await fetch('/api/efb/policies/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error('Failed to update device policies');
      }

      await loadDevices();
      setSelectedDevices(new Set());
    } catch (error) {
      console.error('Failed to update policies:', error);
    }
  };

  const handleCacheInvalidation = async () => {
    try {
      const request: CacheInvalidationRequest = {
        deviceIds: Array.from(selectedDevices),
        scope: {
          forceImmediate: true,
        },
      };

      const response = await fetch('/api/efb/cache/invalidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error('Failed to invalidate cache');
      }

      await loadDevices();
      setSelectedDevices(new Set());
    } catch (error) {
      console.error('Failed to invalidate cache:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      ACTIVE: 'default',
      PENDING_ENROLLMENT: 'secondary',
      SUSPENDED: 'destructive',
      DECOMMISSIONED: 'outline',
    };
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || 'outline'}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getPlatformBadge = (platform: string) => {
    const colors = {
      iOS: 'bg-blue-100 text-blue-800',
      Android: 'bg-green-100 text-green-800',
      Windows: 'bg-purple-100 text-purple-800',
    };
    
    return (
      <Badge className={colors[platform as keyof typeof colors] || 'bg-gray-100 text-gray-800'}>
        {platform}
      </Badge>
    );
  };

  const renderManualPinningPolicy = () => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="manualIds">Manual IDs</Label>
        <Input
          id="manualIds"
          placeholder="Comma-separated manual IDs"
          onChange={(e) => setPolicySettings({
            ...policySettings,
            manualIds: e.target.value.split(',').map(id => id.trim()),
          })}
        />
      </div>
      <div>
        <Label htmlFor="folderIds">Folder IDs (Optional)</Label>
        <Input
          id="folderIds"
          placeholder="Comma-separated folder IDs"
          onChange={(e) => setPolicySettings({
            ...policySettings,
            folderIds: e.target.value.split(',').map(id => id.trim()),
          })}
        />
      </div>
      <div>
        <Label htmlFor="maxStorageMB">Max Storage (MB)</Label>
        <Input
          id="maxStorageMB"
          type="number"
          defaultValue={1000}
          onChange={(e) => setPolicySettings({
            ...policySettings,
            ...policySettings.expiration,
            maxStorageMB: parseInt(e.target.value),
          })}
        />
      </div>
      <div>
        <Label htmlFor="expirationDays">Expiration Days</Label>
        <Input
          id="expirationDays"
          type="number"
          defaultValue={30}
          onChange={(e) => setPolicySettings({
            ...policySettings,
            expiration: {
              ...policySettings.expiration,
              enabled: true,
              maxDays: parseInt(e.target.value),
              autoRefresh: true,
            },
          })}
        />
      </div>
    </div>
  );

  const renderCacheSyncPolicy = () => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="syncInterval">Sync Interval (Hours)</Label>
        <Input
          id="syncInterval"
          type="number"
          defaultValue={24}
          onChange={(e) => setPolicySettings({
            ...policySettings,
            syncIntervalHours: parseInt(e.target.value),
          })}
        />
      </div>
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="wifiRequired"
          onChange={(e) => setPolicySettings({
            ...policySettings,
            wifiRequired: e.target.checked,
          })}
        />
        <Label htmlFor="wifiRequired">Require WiFi for sync</Label>
      </div>
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="allowCellular"
          onChange={(e) => setPolicySettings({
            ...policySettings,
            allowCellular: e.target.checked,
          })}
        />
        <Label htmlFor="allowCellular">Allow cellular data</Label>
      </div>
      <div>
        <Label htmlFor="chunkSizeKB">Chunk Size (KB)</Label>
        <Input
          id="chunkSizeKB"
          type="number"
          defaultValue={512}
          onChange={(e) => setPolicySettings({
            ...policySettings,
            chunkSizeKB: parseInt(e.target.value),
          })}
        />
      </div>
    </div>
  );

  const renderSecurityPolicy = () => (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="allowScreenshots"
          onChange={(e) => setPolicySettings({
            ...policySettings,
            allowScreenshots: e.target.checked,
          })}
        />
        <Label htmlFor="allowScreenshots">Allow screenshots</Label>
      </div>
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="requireBiometrics"
          defaultChecked
          onChange={(e) => setPolicySettings({
            ...policySettings,
            requireBiometrics: e.target.checked,
          })}
        />
        <Label htmlFor="requireBiometrics">Require biometric authentication</Label>
      </div>
      <div>
        <Label htmlFor="sessionTimeout">Session Timeout (Minutes)</Label>
        <Input
          id="sessionTimeout"
          type="number"
          defaultValue={30}
          onChange={(e) => setPolicySettings({
            ...policySettings,
            sessionTimeoutMinutes: parseInt(e.target.value),
          })}
        />
      </div>
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="remoteWipeEnabled"
          defaultChecked
          onChange={(e) => setPolicySettings({
            ...policySettings,
            remoteWipeEnabled: e.target.checked,
          })}
        />
        <Label htmlFor="remoteWipeEnabled">Enable remote wipe</Label>
      </div>
    </div>
  );

  const handleCreatePolicy = async () => {
    try {
      const policyData = {
        name: prompt('Policy name:'),
        description: prompt('Policy description (optional):'),
        type: selectedPolicyType,
        settings: {
          type: selectedPolicyType,
          ...policySettings,
        },
      };

      const response = await fetch('/api/efb/policies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
        },
        body: JSON.stringify(policyData),
      });

      if (!response.ok) {
        throw new Error('Failed to create policy');
      }

      await loadPolicies();
      setPolicyDialogOpen(false);
      setPolicySettings({});
    } catch (error) {
      console.error('Failed to create policy:', error);
    }
  };

  if (loading && devices.length === 0) {
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
        <h1 className="text-3xl font-bold">Device Management</h1>
        <p className="text-gray-600">
          Manage enrolled EFB devices, policies, and security settings
        </p>
      </div>

      <Tabs defaultValue="devices" className="space-y-6">
        <TabsList>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="devices" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardHeader>
                <CardTitle>Filter Devices</CardTitle>
              </CardHeader>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All statuses</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="PENDING_ENROLLMENT">Pending</SelectItem>
                      <SelectItem value="SUSPENDED">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="platform">Platform</Label>
                  <Select value={filters.platform} onValueChange={(value) => setFilters({ ...filters, platform: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All platforms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All platforms</SelectItem>
                      <SelectItem value="iOS">iOS</SelectItem>
                      <SelectItem value="Android">Android</SelectItem>
                      <SelectItem value="Windows">Windows</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="search">Search</Label>
                  <Input
                    id="search"
                    placeholder="Search devices..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value }]}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bulk Actions */}
          {selectedDevices.size > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Bulk Actions ({selectedDevices.size} selected)</CardTitle>
              </CardHeader>
              <CardContent className="space-x-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline">Apply Policy</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Apply Policy to Selected Devices</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="policySelect">Policy</Label>
                        <Select onValueChange={(policyId) => {
                          const action = prompt('Action (ADD/REMOVE/REPLACE):');
                          if (action && ['ADD', 'REMOVE', 'REPLACE'].includes(action)) {
                            handleBulkPolicyUpdate(policyId, action as any);
                          }
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select policy" />
                          </SelectTrigger>
                          <SelectContent>
                            {policies.map((policy) => (
                              <SelectItem key={policy.id} value={policy.id}>
                                {policy.name} ({policy.type})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">Invalidate Cache</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Invalidate Cache</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will force selected devices to re-download all cached content.
                        Are you sure you want to proceed?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleCacheInvalidation}>
                        Invalidate Cache
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          )}

          {/* Device List */}
          <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <input
                      type="checkbox"
                      checked={selectedDevices.size === devices.length && devices.length > 0}
                      onChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Device Name</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Sync</TableHead>
                  <TableHead>Cache Size</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedDevices.has(device.id)}
                        onChange={(e) => handleDeviceSelection(device.id, e.target.checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{device.deviceName}</div>
                        <div className="text-sm text-gray-500">{device.deviceModel}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {device.user ? (
                        <div>
                          <div className="font-medium">{device.user.name}</div>
                          <div className="text-sm text-gray-500">{device.user.email}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>{getPlatformBadge(device.platform)}</TableCell>
                    <TableCell>{getStatusBadge(device.status)}</TableCell>
                    <TableCell>
                      {device.lastSyncAt ? (
                        <div>
                          <div>{new Date(device.lastSyncAt).toLocaleDateString()}</div>
                          <div className="text-sm text-gray-500">
                            {device.lastSyncJob?.status || 'Unknown'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{device.totalCacheSizeMB.toFixed(1)} MB</div>
                    </TableCell>
                    <TableCell>
                      <div className="space-x-1">
                        {device.status === 'PENDING_ENROLLMENT' && (
                          <Button
                            size="sm"
                            onClick={() => handleApproveDevice(device.id)}
                          >
                            Approve
                          </Button>
                        )}
                        {device.status === 'ACTIVE' && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleSuspendDevice(device.id)}
                          >
                            Suspend
                          </Button>
                        )}
                  </TableCell>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          </Card>

          {/* Pagination */}
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Showing {((pagination.page - 1) * pagination.pageSize) + 1} to{' '}
              {Math.min(pagination.page * pagination.pageSize, pagination.totalCount)} of{' '}
              {pagination.totalCount} devices
            </div>
            <div className="space-x-2">
              <Button
                variant="outline"
                disabled={pagination.page === 1}
                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={pagination.page === pagination.totalPages}
                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
              >
                Next
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="policies" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Device Policies</h2>
            <Dialog open={policyDialogOpen} onOpenChange={setPolicyDialogOpen}>
              <DialogTrigger asChild>
                <Button>Create Policy</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Device Policy</DialogTitle>
                  <DialogDescription>
                    Configure policy settings for device enforcement
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="policyType">Policy Type</Label>
                    <Select value={selectedPolicyType} onValueChange={setSelectedPolicyType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select policy type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MANUAL_PINNING">Manual Pinning</SelectItem>
                        <SelectItem value="CACHE_SYNC">Cache Sync</SelectItem>
                        <SelectItem value="SECURITY">Security</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedPolicyType === 'MANUAL_PINNING' && renderManualPinningPolicy()}
                  {selectedPolicyType === 'CACHE_SYNC' && renderCacheSyncPolicy()}
                  {selectedPolicyType === 'SECURITY' && renderSecurityPolicy()}
                </div>
                <DialogFooter>
                  <Button onClick={handleCreatePolicy}>Create Policy</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {policies.map((policy) => (
              <Card key={policy.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {policy.name}
                    <Badge variant="outline">{policy.type}</Badge>
                  </CardTitle>
                  <CardDescription>{policy.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-gray-600">
                    <div>Priority: {policy.priority}</div>
                    <div>Effective: {policy.isActive ? 'Active' : 'Inactive'}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <Card>
            <CardHeader>
              <CardTitle>Device Analytics</CardTitle>
              <CardDescription>
                Usage patterns and compliance metrics for enrolled devices
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center text-gray-500 py-8">
                Analytics dashboard coming soon...
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
